import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { getClaudeSettingsPath } from './claudeSettings';
import { readAwsProfiles } from './awsConfig';
import { readProfileStore, writeProfileStore, createEmptyStore, generateId } from './profiles';
import { applyAllScopes } from './resolver';
import { PanelState, ProfileStore } from './types';
import { ANTHROPIC_DEFAULTS } from './models';
import { buildHtml } from './webview/index';

// ---------------------------------------------------------------------------
// Migration: import existing settings into a ProfileStore
// ---------------------------------------------------------------------------

import { readClaudeSettings } from './claudeSettings';
import { readUserMcpServers } from './claudeJson';
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
      proxyApiKey: env['ANTHROPIC_API_KEY'] || undefined,
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
      store.projectScopes[workspaceRoot] = { mode: 'preset', presetId };
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

  public static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (ClaudeCodeSettingsPanel.currentPanel) {
      ClaudeCodeSettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'claudeCodeBedrockSettings',
      PANEL_TITLE,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
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

    this._panel.webview.onDidReceiveMessage(
      async (msg: { type: string; [key: string]: unknown }) => this._handleMessage(msg),
      null,
      this._disposables
    );

    this._render();
  }

  private _render(): void {
    const nonce = crypto.randomBytes(16).toString('hex');
    const cspSource = this._panel.webview.cspSource;
    const state = this._buildState();
    this._panel.webview.html = buildHtml(state, nonce, cspSource);
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

    const awsProfiles = readAwsProfiles();

    const workspaceName = this._workspaceRoot
      ? path.basename(this._workspaceRoot)
      : undefined;

    return {
      store,
      awsProfiles,
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
        this._panel.title = PANEL_TITLE_DIRTY;
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
    }
  }

  private async _saveStore(store: ProfileStore): Promise<void> {
    try {
      // Write the profile store
      writeProfileStore(store);

      // Resolve and apply active presets to Claude Code's config files
      applyAllScopes(store, this._workspaceRoot);

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

  public dispose(): void {
    ClaudeCodeSettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }
}
