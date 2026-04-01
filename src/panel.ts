import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getClaudeSettingsPath } from './claudeSettings';
import { readAwsProfiles, readAwsProfilesFrom, getAwsConfigInfo } from './awsConfig';
import { readProfileStore, writeProfileStore, createEmptyStore, generateId } from './profiles';
import { applyAllScopes } from './resolver';
import { PanelState, ProfileStore } from './types';
import { ANTHROPIC_DEFAULTS } from './models';
import { buildHtml } from './webview/index';
import { refreshStatusBar, setRefreshHook } from './statusBar';

// ---------------------------------------------------------------------------
// Migration: import existing settings into a ProfileStore
// ---------------------------------------------------------------------------

import { readClaudeSettings } from './claudeSettings';
import { readUserMcpServers, ensureOnboardingComplete } from './claudeJson';
import { readProjectMcpServers } from './mcpJson';
import { McpServerEntry } from './types';
import { MANAGED_ENV_KEYS } from './models';

function migrateExistingSettings(workspaceRoot: string | undefined): ProfileStore {
  const store = createEmptyStore();
  const settings = readClaudeSettings();
  const env = settings.env ?? {};

  // Detect if there's anything to migrate
  const hasBedrock = env['CLAUDE_CODE_USE_BEDROCK'] === '1';
  const hasProxy = !!env['ANTHROPIC_BASE_URL'];
  const hasAnyManaged = Object.keys(env).some(k => MANAGED_ENV_KEYS.has(k));

  if (!hasAnyManaged) {
    return store; // Nothing to migrate
  }

  // Create a provider profile from existing settings
  const providerId = generateId();
  if (hasBedrock) {
    store.providers.push({
      id: providerId,
      name: 'Migrated Bedrock',
      type: 'bedrock',
      awsProfile: env['AWS_PROFILE'] || undefined,
      awsRegion: env['AWS_REGION'] || 'us-east-1',
      awsAuthRefresh: settings.awsAuthRefresh || undefined,
      primaryModel: env['ANTHROPIC_DEFAULT_SONNET_MODEL'] || env['ANTHROPIC_MODEL'] || 'global.anthropic.claude-sonnet-4-6',
      smallFastModel: env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] || env['ANTHROPIC_SMALL_FAST_MODEL'] || 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      opusModel: env['ANTHROPIC_DEFAULT_OPUS_MODEL'] || 'us.anthropic.claude-opus-4-6-v1',
      disablePromptCaching: env['DISABLE_PROMPT_CACHING'] === '1',
    });
  } else if (hasProxy) {
    store.providers.push({
      id: providerId,
      name: 'Migrated Proxy',
      type: 'proxy',
      proxyBaseUrl: env['ANTHROPIC_BASE_URL'] || undefined,
      proxyApiKey: env['ANTHROPIC_AUTH_TOKEN'] ? undefined : (env['ANTHROPIC_API_KEY'] || undefined),
      proxyAuthToken: env['ANTHROPIC_AUTH_TOKEN'] || undefined,
      primaryModel: env['ANTHROPIC_DEFAULT_SONNET_MODEL'] || '',
      smallFastModel: env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] || '',
      opusModel: env['ANTHROPIC_DEFAULT_OPUS_MODEL'] || '',
    });
  } else {
    store.providers.push({
      id: providerId,
      name: 'Anthropic',
      type: 'anthropic',
      anthropicApiKey: env['ANTHROPIC_API_KEY'] || undefined,
      primaryModel: env['ANTHROPIC_DEFAULT_SONNET_MODEL'] || ANTHROPIC_DEFAULTS.sonnet,
      smallFastModel: env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] || ANTHROPIC_DEFAULTS.haiku,
      opusModel: env['ANTHROPIC_DEFAULT_OPUS_MODEL'] || ANTHROPIC_DEFAULTS.opus,
    });
  }

  // Migrate user MCP servers
  const userMcp = readUserMcpServers();
  const userMcpEntries = Object.entries(userMcp);
  if (userMcpEntries.length > 0) {
    const groupId = generateId();
    store.mcpGroups.push({
      id: groupId,
      name: 'Default Servers',
      servers: userMcpEntries.map(([name, cfg]): McpServerEntry => ({ name, ...cfg })),
    });

    // Create preset with provider + MCP group
    const presetId = generateId();
    store.presets.push({
      id: presetId,
      name: 'Migrated',
      providerId,
      mcpGroupIds: [groupId],
      directoryGroupIds: [],
    });
    store.globalScope = { mode: 'preset', presetId };
  } else {
    // Create preset with just the provider
    const presetId = generateId();
    store.presets.push({
      id: presetId,
      name: 'Migrated',
      providerId,
      mcpGroupIds: [],
      directoryGroupIds: [],
    });
    store.globalScope = { mode: 'preset', presetId };
  }

  // Migrate allowed directories
  if (settings.allowedDirectories?.length) {
    const dirGroupId = generateId();
    store.directoryGroups.push({
      id: dirGroupId,
      name: 'Migrated Directories',
      directories: settings.allowedDirectories,
    });
    // Add to the first preset
    if (store.presets.length > 0) {
      store.presets[0].directoryGroupIds.push(dirGroupId);
    }
  }

  // Migrate project MCP servers
  if (workspaceRoot) {
    const projectMcp = readProjectMcpServers(workspaceRoot);
    const projectMcpEntries = Object.entries(projectMcp);
    if (projectMcpEntries.length > 0) {
      const groupId = generateId();
      store.mcpGroups.push({
        id: groupId,
        name: 'Project Servers',
        servers: projectMcpEntries.map(([name, cfg]): McpServerEntry => ({ name, ...cfg })),
      });

      const presetId = generateId();
      store.presets.push({
        id: presetId,
        name: 'Project',
        providerId,
        mcpGroupIds: [groupId],
        directoryGroupIds: [],
      });
      store.workspaceScopes[workspaceRoot] = { mode: 'preset', presetId };
    }
  }

  return store;
}

// ---------------------------------------------------------------------------
// Panel class
// ---------------------------------------------------------------------------

const PANEL_TITLE = 'Claude Code — Settings';
const PANEL_TITLE_DIRTY = 'Claude Code — Settings ●';

export class ClaudeCodeSettingsPanel {
  public static currentPanel: ClaudeCodeSettingsPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _workspaceRoot: string | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  private _dirty = false;

  public static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (ClaudeCodeSettingsPanel.currentPanel) {
      ClaudeCodeSettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const mediaPath = vscode.Uri.joinPath(context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'claudeCodeBedrockSettings',
      PANEL_TITLE,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaPath],
      }
    );

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    ClaudeCodeSettingsPanel.currentPanel = new ClaudeCodeSettingsPanel(panel, context, workspaceRoot);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, workspaceRoot: string | undefined) {
    this._panel = panel;
    this._context = context;
    this._workspaceRoot = workspaceRoot;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Let the quick-switch command refresh this panel when it changes scopes
    setRefreshHook(() => this._sendState());

    this._panel.webview.onDidReceiveMessage(
      async (msg: { type: string; [key: string]: unknown }) => this._handleMessage(msg),
      null,
      this._disposables
    );

    this._render();

    // If a draft exists from a previous session, offer to restore it
    const draft = ClaudeCodeSettingsPanel._loadDraft();
    if (draft) {
      vscode.window.showInformationMessage(
        'You have unsaved changes from a previous session.',
        'Restore Draft', 'Discard'
      ).then(choice => {
        if (choice === 'Restore Draft') {
          this._panel.webview.postMessage({ type: 'init', data: { ...this._buildState(), store: draft } });
          this._dirty = true;
          this._panel.title = PANEL_TITLE_DIRTY;
        } else if (choice === 'Discard') {
          ClaudeCodeSettingsPanel._clearDraft();
        }
      });
    }
  }

  private _render(): void {
    const nonce = crypto.randomBytes(16).toString('hex');
    const cspSource = this._panel.webview.cspSource;
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'webview.js')
    ).toString();
    const state = this._buildState();
    this._panel.webview.html = buildHtml(state, nonce, cspSource, scriptUri);
  }

  private _buildState(): PanelState {
    let store = readProfileStore();

    // Auto-migrate on first use
    if (store.providers.length === 0 && store.presets.length === 0) {
      store = migrateExistingSettings(this._workspaceRoot);
      if (store.providers.length > 0) {
        writeProfileStore(store);
      }
    }

    const awsConfigInfo = getAwsConfigInfo();
    const awsProfiles = readAwsProfiles();

    const workspaceName = this._workspaceRoot
      ? path.basename(this._workspaceRoot)
      : undefined;

    return {
      store,
      awsProfiles,
      awsConfigInfo,
      hasWorkspace: !!this._workspaceRoot,
      workspacePath: this._workspaceRoot,
      workspaceName,
    };
  }

  private _sendState(): void {
    const state = this._buildState();
    this._panel.webview.postMessage({ type: 'init', data: state });
  }

  private async _handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this._sendState();
        break;

      case 'dirty':
        this._dirty = true;
        this._panel.title = PANEL_TITLE_DIRTY;
        break;

      case 'saveDraft':
        // Auto-save draft so unsaved changes survive panel close
        this._saveDraft(msg.store as ProfileStore);
        break;

      case 'saveStore':
        await this._saveStore(msg.store as ProfileStore);
        break;

      case 'openFile':
        try {
          const doc = await vscode.workspace.openTextDocument(
            vscode.Uri.file(getClaudeSettingsPath())
          );
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showErrorMessage('Could not open settings.json — save settings first.');
        }
        break;

      case 'pickDirectory':
        await this._pickDirectory(msg.groupId as string, msg.index as number);
        break;

      case 'reload':
        this._sendState();
        this._panel.title = PANEL_TITLE;
        break;

      case 'fetchLocalModels':
        await this._fetchLocalModels(msg.baseUrl as string, msg.apiKey as string);
        break;

      case 'fetchBedrockModels':
        await this._fetchBedrockModels(msg.awsProfile as string, msg.awsRegion as string);
        break;

      case 'switchAwsEnv': {
        // User selected a different aws-env — store it on the provider (per-provider,
        // no symlink mutation) and reload profiles from the target config.
        const envName = msg.envName as string;
        const providerId = msg.providerId as string | undefined;
        const store = readProfileStore();
        if (providerId) {
          const provider = store.providers.find(p => p.id === providerId);
          if (provider) {
            provider.awsEnv = envName;
            writeProfileStore(store);
            applyAllScopes(store, this._workspaceRoot);
          }
        }
        const awsEnvsBase = path.join(os.homedir(), '.aws', 'aws-envs');
        const newConfigPath = path.join(awsEnvsBase, envName, 'config');
        const profiles = readAwsProfilesFrom(newConfigPath);
        const configInfo = getAwsConfigInfo();
        this._panel.webview.postMessage({
          type: 'awsEnvSwitched',
          envName,
          providerId,
          awsProfiles: profiles,
          awsConfigInfo: configInfo,
        });
        break;
      }
    }
  }

  /**
   * Sync claudeCode.disableLoginPrompt in VS Code settings based on the active
   * provider type, at the correct configuration scope:
   * - Global preset   → ConfigurationTarget.Global
   * - Workspace preset → ConfigurationTarget.Workspace (overrides global for this workspace)
   * - Workspace inherit → clear workspace override (falls back to global)
   * - Workspace manual → leave workspace setting untouched
   *
   * This prevents the Claude Code extension from showing the Anthropic login
   * prompt when Bedrock or a standalone proxy provider is active.
   */
  private _syncVsCodeLoginSetting(store: ProfileStore): void {
    const cfg = vscode.workspace.getConfiguration('claudeCode');

    const disableForPreset = (presetId: string): boolean | undefined => {
      const preset = store.presets.find(p => p.id === presetId);
      const provider = preset ? store.providers.find(p => p.id === preset.providerId) : undefined;
      if (!provider) { return undefined; }
      if (provider.type === 'bedrock') { return true; }
      if (provider.type === 'proxy') { return provider.disableLoginPrompt !== false ? true : undefined; }
      return undefined; // anthropic → reset to default
    };

    // Global scope
    const globalDisable = store.globalScope.mode === 'preset' && store.globalScope.presetId
      ? disableForPreset(store.globalScope.presetId)
      : undefined;
    cfg.update('disableLoginPrompt', globalDisable, vscode.ConfigurationTarget.Global)
      .then(undefined, () => { /* best effort */ });

    // Workspace scope
    if (this._workspaceRoot) {
      const wsScope = store.workspaceScopes[this._workspaceRoot];
      if (wsScope?.mode === 'preset' && wsScope.presetId) {
        const wsDisable = disableForPreset(wsScope.presetId);
        cfg.update('disableLoginPrompt', wsDisable, vscode.ConfigurationTarget.Workspace)
          .then(undefined, () => { /* best effort */ });
      } else if (wsScope?.mode === 'inherit') {
        // Clear workspace override so the global value takes effect
        cfg.update('disableLoginPrompt', undefined, vscode.ConfigurationTarget.Workspace)
          .then(undefined, () => { /* best effort */ });
      }
      // 'manual' mode: user manages the setting themselves
    }
  }

  private async _saveStore(store: ProfileStore): Promise<void> {
    try {
      // Write the profile store
      writeProfileStore(store);

      // Ensure the first-run wizard won't prompt for Anthropic login
      ensureOnboardingComplete();

      // Resolve and apply active presets to Claude Code's config files
      applyAllScopes(store, this._workspaceRoot);

      // Sync claudeCode.disableLoginPrompt in VS Code settings
      this._syncVsCodeLoginSetting(store);

      // Update the status bar to reflect the new scope/preset
      refreshStatusBar();

      this._dirty = false;
      ClaudeCodeSettingsPanel._clearDraft();
      this._panel.title = PANEL_TITLE;
      this._panel.webview.postMessage({ type: 'saved' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to save: ${message}`);
      this._panel.webview.postMessage({ type: 'error', message });
    }
  }

  private async _pickDirectory(groupId: string, index: number): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Directory',
    });
    if (result?.[0]) {
      this._panel.webview.postMessage({
        type: 'directoryPicked',
        groupId,
        index,
        path: result[0].fsPath,
      });
    }
  }

  private async _fetchLocalModels(baseUrl: string, apiKey: string): Promise<void> {
    try {
      const base = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const url = base + '/v1/models';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) { headers['Authorization'] = `Bearer ${apiKey}`; }
      const res = await (globalThis as any).fetch(url, { headers });
      if (!res.ok) { throw new Error(`HTTP ${res.status}: ${res.statusText}`); }
      const json = await res.json() as { data?: { id: string }[]; models?: { name?: string; id?: string }[] };
      let models: string[] = [];
      if (Array.isArray(json?.data)) {
        models = (json.data as { id: string }[]).map(m => m.id).filter(Boolean);
      } else if (Array.isArray(json?.models)) {
        models = (json.models as { name?: string; id?: string }[]).map(m => m.name ?? m.id ?? '').filter(Boolean);
      }
      this._panel.webview.postMessage({ type: 'localModels', models });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({ type: 'localModelsError', message });
    }
  }

  // ── Bedrock model cache (1-hour TTL per profile+region) ─────────────

  private static _modelCachePath(awsProfile: string, awsRegion: string): string {
    const key = `${awsProfile || 'default'}-${awsRegion}`.replace(/[^a-z0-9-]/gi, '_');
    return path.join(os.homedir(), '.claude', `bedrock-model-cache-${key}.json`);
  }

  private static _readModelCache(cachePath: string): { id: string; label: string }[] | null {
    try {
      const raw = fs.readFileSync(cachePath, 'utf8');
      const { ts, models } = JSON.parse(raw) as { ts: number; models: { id: string; label: string }[] };
      if (Date.now() - ts < 60 * 60 * 1000) { return models; } // 1-hour TTL
    } catch { /* cache miss or corrupt */ }
    return null;
  }

  private static _writeModelCache(cachePath: string, models: { id: string; label: string }[]): void {
    try {
      fs.writeFileSync(cachePath, JSON.stringify({ ts: Date.now(), models }, null, 2), 'utf8');
    } catch { /* best effort */ }
  }

  private async _fetchBedrockModels(awsProfile: string, awsRegion: string): Promise<void> {
    const cachePath = ClaudeCodeSettingsPanel._modelCachePath(awsProfile, awsRegion);
    const cached = ClaudeCodeSettingsPanel._readModelCache(cachePath);
    if (cached) {
      this._panel.webview.postMessage({ type: 'bedrockModels', models: cached });
      return;
    }

    try {
      const { execSync } = require('child_process') as typeof import('child_process');
      const env: Record<string, string> = { ...process.env as Record<string, string> };
      if (awsProfile) { env['AWS_PROFILE'] = awsProfile; }
      if (awsRegion) { env['AWS_REGION'] = awsRegion; }
      const opts = { encoding: 'utf8' as const, env, timeout: 30000 };

      // Fetch inference profiles (cross-region) and foundation models
      const models: { id: string; label: string }[] = [];
      const seen = new Set<string>();
      const fetchErrors: string[] = [];

      try {
        const profilesJson = execSync(
          'aws bedrock list-inference-profiles --output json', opts
        );
        const profiles = JSON.parse(profilesJson) as {
          inferenceProfileSummaries?: { inferenceProfileId: string; inferenceProfileName: string }[];
        };
        for (const p of profiles.inferenceProfileSummaries ?? []) {
          if (!seen.has(p.inferenceProfileId)) {
            seen.add(p.inferenceProfileId);
            models.push({ id: p.inferenceProfileId, label: `${p.inferenceProfileName} (inference profile)` });
          }
        }
      } catch (err) {
        fetchErrors.push(`list-inference-profiles: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
      }

      try {
        const fmJson = execSync(
          'aws bedrock list-foundation-models --by-provider anthropic --output json', opts
        );
        const fm = JSON.parse(fmJson) as {
          modelSummaries?: { modelId: string; modelName: string }[];
        };
        for (const m of fm.modelSummaries ?? []) {
          if (!seen.has(m.modelId)) {
            seen.add(m.modelId);
            models.push({ id: m.modelId, label: `${m.modelName} (${m.modelId})` });
          }
        }
      } catch (err) {
        fetchErrors.push(`list-foundation-models: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
      }

      if (models.length === 0) {
        const detail = fetchErrors.length > 0 ? `\n\nErrors:\n${fetchErrors.join('\n')}` : '';
        throw new Error(
          `No models returned. Check: (1) AWS CLI installed and on PATH? (2) Profile "${awsProfile || 'default'}" and region "${awsRegion}" configured? (3) Bedrock enabled in this region?${detail}`
        );
      }

      ClaudeCodeSettingsPanel._writeModelCache(cachePath, models);
      this._panel.webview.postMessage({ type: 'bedrockModels', models });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({ type: 'bedrockModelsError', message });
    }
  }

  // ── Draft persistence ───────────────────────────────────────────────

  private static _draftPath(): string {
    return path.join(os.homedir(), '.claude', 'coder-profiles.draft.json');
  }

  private _saveDraft(store: ProfileStore): void {
    try {
      fs.writeFileSync(ClaudeCodeSettingsPanel._draftPath(), JSON.stringify(store, null, 2) + '\n', 'utf8');
    } catch { /* best effort */ }
  }

  private static _clearDraft(): void {
    try { fs.unlinkSync(ClaudeCodeSettingsPanel._draftPath()); } catch { /* ok if missing */ }
  }

  private static _loadDraft(): ProfileStore | null {
    try {
      const raw = fs.readFileSync(ClaudeCodeSettingsPanel._draftPath(), 'utf8');
      return JSON.parse(raw) as ProfileStore;
    } catch { return null; }
  }

  public dispose(): void {
    const wasDirty = this._dirty;
    ClaudeCodeSettingsPanel.currentPanel = undefined;
    setRefreshHook(() => {});
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }

    // If the panel was closed with unsaved changes, offer to save
    if (wasDirty) {
      const draft = ClaudeCodeSettingsPanel._loadDraft();
      if (draft) {
        vscode.window.showWarningMessage(
          'You closed the settings panel with unsaved changes.',
          { modal: true },
          'Save Changes',
          'Discard'
        ).then(choice => {
          if (choice === 'Save Changes') {
            writeProfileStore(draft);
            ensureOnboardingComplete();
            applyAllScopes(draft, this._workspaceRoot);
            this._syncVsCodeLoginSetting(draft);
            refreshStatusBar();
            ClaudeCodeSettingsPanel._clearDraft();
            vscode.window.showInformationMessage('Settings saved.');
          } else if (choice === 'Discard') {
            ClaudeCodeSettingsPanel._clearDraft();
          }
          // If dismissed (no choice), keep the draft for next time
        });
      }
    }
  }
}
