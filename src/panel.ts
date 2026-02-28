import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  readClaudeSettings,
  writeClaudeSettings,
  getClaudeSettingsPath,
} from './claudeSettings';
import { readUserMcpServers, writeUserMcpServers } from './claudeJson';
import { readProjectMcpServers, writeProjectMcpServers } from './mcpJson';
import { readAwsProfiles } from './awsConfig';
import {
  ClaudeCodeSettings,
  LlmProvider,
  McpServer,
  McpServerConfig,
  PanelState,
  BedrockConfig,
  ModelConfig,
} from './types';

// ---------------------------------------------------------------------------
// Known Bedrock inference profile IDs (as of Feb 2026)
// ---------------------------------------------------------------------------

// prefix: 'global' | 'us' | 'eu' | 'ap' | '' (regional — always shown)
const HAIKU_MODELS = [
  { prefix: 'us',     id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',  label: 'Claude Haiku 4.5 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',  label: 'Claude Haiku 4.5 — EU Cross-Region' },
  { prefix: 'ap',     id: 'ap.anthropic.claude-haiku-4-5-20251001-v1:0',  label: 'Claude Haiku 4.5 — AP Cross-Region' },
  { prefix: '',       id: 'anthropic.claude-3-5-haiku-20241022-v1:0',      label: 'Claude Haiku 3.5 — Regional' },
  { prefix: '',       id: 'anthropic.claude-3-haiku-20240307-v1:0',        label: 'Claude Haiku 3 — Regional' },
];

const SONNET_MODELS = [
  { prefix: 'global', id: 'global.anthropic.claude-sonnet-4-6',             label: 'Claude Sonnet 4.6 — Global' },
  { prefix: 'us',     id: 'us.anthropic.claude-sonnet-4-6',                 label: 'Claude Sonnet 4.6 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-sonnet-4-6',                 label: 'Claude Sonnet 4.6 — EU Cross-Region' },
  { prefix: 'us',     id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',   label: 'Claude Sonnet 4.5 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0',   label: 'Claude Sonnet 4.5 — EU Cross-Region' },
  { prefix: '',       id: 'anthropic.claude-sonnet-4-20250514-v1:0',        label: 'Claude Sonnet 4 — Regional' },
  { prefix: '',       id: 'anthropic.claude-3-7-sonnet-20250219-v1:0',      label: 'Claude Sonnet 3.7 — Regional' },
];

const OPUS_MODELS = [
  { prefix: 'us',     id: 'us.anthropic.claude-opus-4-6-v1',               label: 'Claude Opus 4.6 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-opus-4-6-v1',               label: 'Claude Opus 4.6 — EU Cross-Region' },
  { prefix: '',       id: 'anthropic.claude-opus-4-20250514-v1:0',          label: 'Claude Opus 4 — Regional' },
  { prefix: '',       id: 'anthropic.claude-opus-4-5-20251101-v1:0',        label: 'Claude Opus 4.5 — Regional' },
];

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
  'ap-south-1', 'sa-east-1',
];

// ---------------------------------------------------------------------------
// Env var keys that this extension manages (others are preserved as-is)
// ---------------------------------------------------------------------------

const BEDROCK_ENV_KEYS = new Set([
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_PROFILE',
  'AWS_REGION',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_MODEL',                       // old name — cleared on save
  'ANTHROPIC_SMALL_FAST_MODEL',            // deprecated — cleared on save
  'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION', // cleared on save
  'DISABLE_PROMPT_CACHING',
  'ANTHROPIC_BASE_URL',                    // local LLM
  'ANTHROPIC_API_KEY',                     // local LLM
]);

// ---------------------------------------------------------------------------
// Panel class
// ---------------------------------------------------------------------------

const PANEL_TITLE        = 'Claude Code — Provider Settings';
const PANEL_TITLE_DIRTY  = 'Claude Code — Provider Settings ●';

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
      async (msg: { type: string; data?: unknown }) => this._handleMessage(msg),
      null,
      this._disposables
    );

    this._render();
  }

  private _render(): void {
    this._panel.webview.html = this._buildHtml();
    // Data is sent once the webview signals it's ready
  }

  private _sendState(): void {
    const settings  = readClaudeSettings();
    const awsProfiles = readAwsProfiles();
    const state = this._toState(settings, awsProfiles);
    this._panel.webview.postMessage({ type: 'init', data: state });
  }

  private _toState(settings: ClaudeCodeSettings, awsProfiles: string[]): PanelState {
    const env = settings.env ?? {};

    // Try to read the current disableLoginPrompt VS Code setting
    let disableLoginPrompt = false;
    try {
      disableLoginPrompt = vscode.workspace.getConfiguration().get<boolean>('claudeCode.disableLoginPrompt') ?? false;
    } catch { /* extension not installed */ }

    // Detect active provider: if ANTHROPIC_BASE_URL is set → local, otherwise bedrock
    const provider: LlmProvider = env['ANTHROPIC_BASE_URL'] ? 'local' : 'bedrock';

    const bedrockConfig: BedrockConfig = {
      provider,
      enabled:             env['CLAUDE_CODE_USE_BEDROCK'] === '1',
      awsProfile:          env['AWS_PROFILE'] ?? '',
      awsRegion:           env['AWS_REGION'] ?? 'us-east-1',
      awsAuthRefresh:      settings.awsAuthRefresh ?? '',
      disableLoginPrompt,
      localBaseUrl:        env['ANTHROPIC_BASE_URL'] ?? '',
      localApiKey:         env['ANTHROPIC_API_KEY']  ?? '',
    };

    const modelConfig: ModelConfig = {
      // Prefer new names; fall back to old ANTHROPIC_MODEL for migration
      primaryModel:  env['ANTHROPIC_DEFAULT_SONNET_MODEL'] ?? env['ANTHROPIC_MODEL'] ?? 'global.anthropic.claude-sonnet-4-6',
      smallFastModel: env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] ?? env['ANTHROPIC_SMALL_FAST_MODEL'] ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      opusModel:     env['ANTHROPIC_DEFAULT_OPUS_MODEL']   ?? 'us.anthropic.claude-opus-4-6-v1',
      disablePromptCaching: env['DISABLE_PROMPT_CACHING'] === '1',
    };

    const toList = (map: Record<string, McpServerConfig>): McpServer[] =>
      Object.entries(map).map(([name, cfg]) => ({ name, ...cfg }));

    const userMcpServers    = toList(readUserMcpServers());
    const projectMcpServers = this._workspaceRoot
      ? toList(readProjectMcpServers(this._workspaceRoot))
      : [];

    return {
      bedrockConfig,
      modelConfig,
      userMcpServers,
      projectMcpServers,
      allowedDirectories: settings.allowedDirectories ?? [],
      awsProfiles,
      hasWorkspace: !!this._workspaceRoot,
    };
  }

  private async _handleMessage(msg: { type: string; data?: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this._sendState();
        break;

      case 'dirty':
        this._panel.title = PANEL_TITLE_DIRTY;
        break;

      case 'save':
        await this._save(msg.data as PanelState);
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
        await this._pickDirectory(msg.data as number);
        break;

      case 'reload':
        this._sendState();
        break;

      case 'fetchLocalModels':
        await this._fetchLocalModels(msg.data as { baseUrl: string; apiKey: string });
        break;
    }
  }

  private async _fetchLocalModels({ baseUrl, apiKey }: { baseUrl: string; apiKey: string }): Promise<void> {
    try {
      // Strip any trailing /v1 the user may have added — the base URL must not include it
      // because Claude Code appends /v1/messages itself. We add /v1/models for the fetch.
      const base = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const url = base + '/v1/models';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) { headers['Authorization'] = `Bearer ${apiKey}`; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  private async _pickDirectory(index: number): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Directory',
    });
    if (result?.[0]) {
      this._panel.webview.postMessage({
        type: 'directoryPicked',
        index,
        path: result[0].fsPath,
      });
    }
  }

  private async _save(state: PanelState): Promise<void> {
    try {
      const existing = readClaudeSettings();

      // Preserve env vars we don't manage
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(existing.env ?? {})) {
        if (!BEDROCK_ENV_KEYS.has(k)) {
          env[k] = v;
        }
      }

      const { bedrockConfig: bc, modelConfig: mc } = state;

      // Always write model IDs regardless of provider
      env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = mc.primaryModel;
      env['ANTHROPIC_DEFAULT_HAIKU_MODEL']  = mc.smallFastModel;
      env['ANTHROPIC_DEFAULT_OPUS_MODEL']   = mc.opusModel;
      if (mc.disablePromptCaching) {
        env['DISABLE_PROMPT_CACHING'] = '1';
      }

      if (bc.provider === 'local') {
        // Local LLM — set base URL and optional API key; clear Bedrock flags
        if (bc.localBaseUrl) {
          env['ANTHROPIC_BASE_URL'] = bc.localBaseUrl;
        }
        if (bc.localApiKey) {
          env['ANTHROPIC_API_KEY'] = bc.localApiKey;
        }
      } else {
        // Bedrock — persist AWS config so values survive enable/disable cycles
        env['AWS_REGION'] = bc.awsRegion;
        if (bc.awsProfile) {
          env['AWS_PROFILE'] = bc.awsProfile;
        }
        // Only set the Bedrock activation flag when explicitly enabled
        if (bc.enabled) {
          env['CLAUDE_CODE_USE_BEDROCK'] = '1';
        }
      }

      // Write MCP servers to the correct files (NOT settings.json)
      const toMap = (list: McpServer[]): Record<string, McpServerConfig> => {
        const map: Record<string, McpServerConfig> = {};
        for (const { name, ...cfg } of list) { if (name) { map[name] = cfg; } }
        return map;
      };
      writeUserMcpServers(toMap(state.userMcpServers));
      if (this._workspaceRoot) {
        writeProjectMcpServers(this._workspaceRoot, toMap(state.projectMcpServers));
      }

      const newSettings: ClaudeCodeSettings = {
        ...existing,
        env,
        allowedDirectories: state.allowedDirectories.filter(Boolean),
      };

      if (bc.awsAuthRefresh) {
        newSettings.awsAuthRefresh = bc.awsAuthRefresh;
      } else {
        delete newSettings.awsAuthRefresh;
      }

      writeClaudeSettings(newSettings);

      // Sync claudeCode.disableLoginPrompt with the explicit toggle value
      try {
        await vscode.workspace
          .getConfiguration()
          .update('claudeCode.disableLoginPrompt', bc.disableLoginPrompt, vscode.ConfigurationTarget.Global);
      } catch {
        // Claude Code extension may not be installed — that's fine
      }

      const settingsPath = getClaudeSettingsPath();
      this._panel.title = PANEL_TITLE; // clear dirty indicator
      this._panel.webview.postMessage({ type: 'saved', settingsPath });
      vscode.window.showInformationMessage(`Claude Code Bedrock settings saved to ${settingsPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({ type: 'error', message: msg });
      vscode.window.showErrorMessage(`Failed to save settings: ${msg}`);
    }
  }

  public dispose(): void {
    ClaudeCodeSettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }

  // ---------------------------------------------------------------------------
  // HTML generation
  // ---------------------------------------------------------------------------

  private _buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString('hex');

    const regionOptions = AWS_REGIONS
      .map(r => `<option value="${r}">${r}</option>`)
      .join('\n              ');

    // Embed model data as JSON so the JS can filter by region at runtime
    const allModels = JSON.stringify({ sonnet: SONNET_MODELS, haiku: HAIKU_MODELS, opus: OPUS_MODELS });

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Claude Code Bedrock Settings</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 0 20px 80px;
      max-width: 860px;
    }

    /* ── Tabs ─────────────────────────────────────────────────────────── */
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--vscode-tab-border, #444);
      margin-bottom: 24px;
      padding-top: 12px;
      gap: 0;
      flex-wrap: wrap;
    }
    .tab-btn {
      padding: 7px 16px;
      cursor: pointer;
      border: 1px solid transparent;
      border-bottom: none;
      background: transparent;
      color: var(--vscode-tab-inactiveForeground, #999);
      font-size: 13px;
      font-family: inherit;
    }
    .tab-btn:hover { color: var(--vscode-foreground); }
    .tab-btn.active {
      color: var(--vscode-tab-activeForeground, #fff);
      border-color: var(--vscode-tab-border, #444);
      background: var(--vscode-editor-background);
      margin-bottom: -1px;
    }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    /* ── Typography ───────────────────────────────────────────────────── */
    h2 {
      font-size: 15px;
      font-weight: 600;
      margin: 0 0 4px;
    }
    h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
    .section-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 20px;
      line-height: 1.5;
    }

    /* ── Form groups ──────────────────────────────────────────────────── */
    .form-group { margin-bottom: 18px; }
    .form-group > label {
      display: block;
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-foreground);
    }
    .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: 3px 0 6px;
      line-height: 1.4;
    }

    input[type="text"],
    select,
    textarea {
      width: 100%;
      padding: 5px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #555));
      border-radius: 2px;
      font-family: inherit;
      font-size: 13px;
    }
    input[type="text"]:focus,
    select:focus,
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    textarea { resize: vertical; }
    select option { background: var(--vscode-input-background); }

    /* ── Toggle ───────────────────────────────────────────────────────── */
    .toggle-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .toggle {
      position: relative;
      display: inline-block;
      width: 42px;
      height: 22px;
      flex-shrink: 0;
    }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: absolute;
      inset: 0;
      background: var(--vscode-button-secondaryBackground, #505050);
      border-radius: 22px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .toggle-thumb {
      position: absolute;
      width: 16px; height: 16px;
      left: 3px; top: 3px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
      pointer-events: none;
    }
    .toggle input:checked ~ .toggle-track { background: var(--vscode-button-background, #0078d4); }
    .toggle input:checked ~ .toggle-thumb { transform: translateX(20px); }
    .toggle-label { font-size: 13px; font-weight: 600; cursor: pointer; }

    /* ── Two-column grid ──────────────────────────────────────────────── */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 560px) { .grid-2 { grid-template-columns: 1fr; } }

    /* ── Callout boxes ────────────────────────────────────────────────── */
    .callout {
      padding: 10px 14px;
      border-radius: 3px;
      margin-bottom: 16px;
      font-size: 12px;
      line-height: 1.5;
    }
    .callout-info {
      border-left: 3px solid var(--vscode-infoBar-foreground, #75beff);
      background: var(--vscode-inputValidation-infoBackground, #063b4926);
    }
    .callout-warn {
      border-left: 3px solid var(--vscode-inputValidation-warningBorder, #b89500);
      background: var(--vscode-inputValidation-warningBackground, #352a0526);
    }

    /* ── Buttons ──────────────────────────────────────────────────────── */
    button {
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      border-radius: 2px;
      padding: 5px 14px;
      border: none;
    }
    .btn-primary {
      background: var(--vscode-button-background, #0078d4);
      color: var(--vscode-button-foreground, #fff);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground, #0069ba); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #44474b); }
    .btn-danger {
      background: transparent;
      color: var(--vscode-errorForeground, #f48771);
      border: 1px solid var(--vscode-errorForeground, #f48771);
      padding: 3px 10px;
      font-size: 12px;
    }
    .btn-danger:hover { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); }
    .btn-sm { padding: 3px 10px; font-size: 12px; }

    /* ── MCP server cards ─────────────────────────────────────────────── */
    .server-card {
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 4px;
      padding: 12px 14px;
      margin-bottom: 8px;
      background: var(--vscode-sideBar-background, transparent);
    }
    .server-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .server-name { font-weight: 600; font-size: 13px; }
    .badge {
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 10px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      margin-left: 8px;
    }
    .server-detail {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family, monospace);
      word-break: break-all;
    }
    .card-actions { display: flex; gap: 6px; }

    /* ── Inline form for add/edit server ──────────────────────────────── */
    .inline-form {
      border: 1px solid var(--vscode-focusBorder, #007fd4);
      border-radius: 4px;
      padding: 16px;
      margin-bottom: 16px;
      background: var(--vscode-sideBarSectionHeader-background, transparent);
    }
    .inline-form h3 { margin-top: 0; }
    .form-actions { display: flex; gap: 8px; margin-top: 12px; }

    /* ── Directory rows ───────────────────────────────────────────────── */
    .dir-row {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
    .dir-row input { flex: 1; }

    /* ── Env var rows in server form ──────────────────────────────────── */
    .env-row {
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
      align-items: center;
    }
    .env-row input { flex: 1; }

    /* ── Sticky save bar ──────────────────────────────────────────────── */
    .save-bar {
      position: fixed;
      bottom: 0;
      left: 0; right: 0;
      background: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-panel-border, #444);
      padding: 10px 24px;
      display: flex;
      gap: 10px;
      align-items: center;
      z-index: 100;
    }
    .save-status {
      flex: 1;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .save-status.ok  { color: var(--vscode-terminal-ansiGreen, #23d18b); }
    .save-status.err { color: var(--vscode-errorForeground, #f48771); }

    /* ── Help tab ─────────────────────────────────────────────────────── */
    .help-block { margin-bottom: 20px; }
    .help-block p, .help-block li { font-size: 12px; line-height: 1.7; margin: 4px 0; }
    .help-block pre {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 10px;
      border-radius: 3px;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      overflow-x: auto;
      margin: 8px 0;
    }
    code {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 92%;
    }
    hr { border: none; border-top: 1px solid var(--vscode-panel-border, #444); margin: 20px 0; }
    a { color: var(--vscode-textLink-foreground, #4daafc); }
    a:hover { color: var(--vscode-textLink-activeForeground, #4daafc); }

    /* ── Segmented control (shared by Provider + MCP scope bars) ───── */
    .seg-bar {
      display: flex;
      gap: 0;
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 4px;
      overflow: hidden;
      width: fit-content;
    }
    .seg-btn {
      padding: 7px 22px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 13px;
      font-family: inherit;
      font-weight: 500;
      border-right: 1px solid var(--vscode-panel-border, #444);
    }
    .seg-btn:last-child { border-right: none; }
    .seg-btn.active {
      background: var(--vscode-button-background, #0078d4);
      color: var(--vscode-button-foreground, #fff);
    }
    .seg-btn:not(.active):hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }

    /* ── Refresh button loading state ────────────────────── */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinning { display: inline-block; animation: spin 0.8s linear infinite; }

    /* ── Provider selector ─────────────────────────────────── */
    .provider-bar {
      display: flex;
      gap: 0;
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 20px;
      width: fit-content;
    }
    .provider-btn {
      padding: 7px 22px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 13px;
      font-family: inherit;
      font-weight: 500;
      border-right: 1px solid var(--vscode-panel-border, #444);
    }
    .provider-btn:last-child { border-right: none; }
    .provider-btn.active {
      background: var(--vscode-button-background, #0078d4);
      color: var(--vscode-button-foreground, #fff);
    }
    .provider-btn:not(.active):hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }

    .hidden { display: none !important; }
    .empty-msg { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  </style>
</head>
<body>

  <!-- ── Tab bar ────────────────────────────────────────────────────────── -->
  <div class="tab-bar">
    <button class="tab-btn active" data-tab="provider">Provider</button>
    <button class="tab-btn" data-tab="models">Models</button>
    <button class="tab-btn" data-tab="mcp">MCP Servers</button>
    <button class="tab-btn" data-tab="dirs">Directories</button>
    <button class="tab-btn" data-tab="help">Help</button>
  </div>

  <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       TAB: Provider
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
  <div id="tab-provider" class="tab-pane active">
    <h2>LLM Provider</h2>
    <p class="section-desc">
      Settings are written to <code>~/.claude/settings.json</code> and shared by
      both the Claude Code VS Code extension and the <code>claude</code> CLI.
    </p>

    <!-- Provider selector -->
    <div class="form-group">
      <label>Provider</label>
      <div class="provider-bar">
        <button class="provider-btn active" data-provider="bedrock">AWS Bedrock</button>
        <button class="provider-btn" data-provider="local">Local / Compatible API</button>
      </div>
    </div>

    <!-- Disable login prompt (common to both providers) -->
    <div class="form-group">
      <div class="toggle-row">
        <label class="toggle" for="disable-login-prompt">
          <input type="checkbox" id="disable-login-prompt">
          <span class="toggle-track"></span>
          <span class="toggle-thumb"></span>
        </label>
        <span id="lbl-disable-login-prompt" class="toggle-label">Disable Anthropic login prompt</span>
      </div>
      <p class="hint">
        Sets <code>claudeCode.disableLoginPrompt</code> — suppresses the Anthropic login screen
        when launching Claude Code. Enable this when running entirely through a non-Anthropic backend.
      </p>
    </div>

    <!-- ─────────── Bedrock fields ─────────── -->
    <div id="provider-bedrock-section">
      <div class="form-group">
        <div class="toggle-row">
          <label class="toggle" for="bedrock-enabled">
            <input type="checkbox" id="bedrock-enabled">
            <span class="toggle-track"></span>
            <span class="toggle-thumb"></span>
          </label>
          <span id="lbl-bedrock-enabled" class="toggle-label">Enable AWS Bedrock</span>
        </div>
        <p class="hint">
          Sets <code>CLAUDE_CODE_USE_BEDROCK=1</code> in the Claude Code environment.
        </p>
      </div>

      <div id="bedrock-fields">
        <div class="callout callout-info">
          ℹ️ These settings are written to
          <strong>~/.claude/settings.json</strong> and are shared between the
          Claude Code VS Code extension and the <code>claude</code> terminal CLI.
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label for="aws-profile">AWS Profile</label>
            <p class="hint">
              Profile from <code>~/.aws/config</code> (or <code>$AWS_CONFIG_FILE</code>).
              Leave blank to use the default credential chain.
            </p>
            <select id="aws-profile">
              <option value="">(default credential chain)</option>
            </select>
          </div>

          <div class="form-group">
            <label for="aws-region">AWS Region <span style="color:var(--vscode-errorForeground)">*</span></label>
            <p class="hint">Required. The Bedrock region to use (<code>AWS_REGION</code>).</p>
            <select id="aws-region">
              ${regionOptions}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="aws-auth-refresh">AWS Credential Refresh Command</label>
          <p class="hint">
            Optional. Command run automatically when credentials expire — ideal for SSO flows
            (<code>awsAuthRefresh</code> key in settings.json).
          </p>
          <input type="text" id="aws-auth-refresh"
                 placeholder="e.g.  aws sso login --profile my-sso-profile">
        </div>

        <div class="callout callout-warn">
          ⚠️ <strong>IAM permissions needed:</strong>
          <code>bedrock:InvokeModel</code>,
          <code>bedrock:InvokeModelWithResponseStream</code>, and
          <code>bedrock:ListInferenceProfiles</code>.
          <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html"
             target="_blank">Bedrock IAM docs ↗</a>
        </div>
      </div>
    </div><!-- /provider-bedrock-section -->

    <!-- ─────────── Local fields ─────────── -->
    <div id="provider-local-section" class="hidden">
      <div class="callout callout-info">
        ℹ️ Works with any OpenAI-compatible server: Ollama, LM Studio, LiteLLM, vLLM, etc.
        Point Claude Code at the server's base URL.
      </div>

      <div class="form-group">
        <label for="local-base-url">Base URL <span style="color:var(--vscode-errorForeground)">*</span></label>
        <p class="hint">
          Sets <code>ANTHROPIC_BASE_URL</code>. Enter the root URL <strong>without</strong> a
          trailing <code>/v1</code> — Claude Code appends <code>/v1/messages</code> itself.
          The Refresh button fetches <code>&lt;baseUrl&gt;/v1/models</code>.
        </p>
        <input type="text" id="local-base-url"
               placeholder="http://localhost:11434  or  http://localhost:8000">
      </div>

      <div class="form-group">
        <label for="local-api-key">API Key</label>
        <p class="hint">
          Sets <code>ANTHROPIC_API_KEY</code>. Most local servers accept any non-empty value
          (e.g. <code>local</code>). Leave blank to omit the header.
        </p>
        <input type="text" id="local-api-key" placeholder="local">
      </div>
    </div><!-- /provider-local-section -->
  </div><!-- /tab-provider -->

  <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       TAB: Models
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
  <div id="tab-models" class="tab-pane">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <div>
        <h2 style="margin:0 0 4px">Model Selection</h2>
        <p class="section-desc" style="margin:0">
          Choose which model to use for each tier. Options adapt to the selected provider.
        </p>
      </div>
      <button id="btn-refresh-models" class="btn-secondary btn-sm"
              title="Fetch available models from the provider"
              style="margin-top:4px;white-space:nowrap">
        <span class="refresh-icon">⟳</span> Refresh
      </button>
    </div>

    <!-- ─────────── Bedrock models ─────────── -->
    <div id="models-bedrock-section">
      <div class="callout callout-info">
        💡 Models prefixed with <code>global.</code> or <code>us.</code> are
        <em>cross-region inference profiles</em> that provide maximum availability.
        Model options are filtered to match your selected AWS region.
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="primary-model">Sonnet — Primary</label>
          <p class="hint">Main model for most tasks (<code>ANTHROPIC_DEFAULT_SONNET_MODEL</code>).</p>
          <select id="primary-model"><!-- populated by JS --></select>
          <input type="text" id="primary-model-custom" class="hidden"
                 placeholder="e.g. arn:aws:bedrock:us-east-2:123:…"
                 style="margin-top:4px">
        </div>

        <div class="form-group">
          <label for="small-model">Haiku — Small / Fast</label>
          <p class="hint">Used for quick tasks (<code>ANTHROPIC_DEFAULT_HAIKU_MODEL</code>).</p>
          <select id="small-model"><!-- populated by JS --></select>
          <input type="text" id="small-model-custom" class="hidden"
                 placeholder="Custom Haiku model ID" style="margin-top:4px">
        </div>
      </div>

      <div class="form-group">
        <label for="opus-model">Opus — Complex tasks</label>
        <p class="hint">Selected when you switch to Opus tier (<code>ANTHROPIC_DEFAULT_OPUS_MODEL</code>).</p>
        <select id="opus-model"><!-- populated by JS --></select>
        <input type="text" id="opus-model-custom" class="hidden"
               placeholder="Custom Opus model ID" style="margin-top:4px">
      </div>
    </div><!-- /models-bedrock-section -->

    <!-- ─────────── Local models ─────────── -->
    <div id="models-local-section" class="hidden">
      <div class="callout callout-info">
        💡 Click <strong>Refresh</strong> to load the model list from your local server.
        Common formats: <code>llama3.3:70b</code> (Ollama),
        <code>claude-3-5-sonnet-20241022</code> (Anthropic proxy),
        <code>mistral-large-2411</code> (LiteLLM).
        You can also type any model ID manually.
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="local-primary-model">Sonnet — Primary</label>
          <p class="hint">Main model (<code>ANTHROPIC_DEFAULT_SONNET_MODEL</code>).</p>
          <select id="local-primary-model"><option value="">— click Refresh —</option></select>
          <input type="text" id="local-primary-model-custom" class="hidden"
                 placeholder="type any model ID" style="margin-top:4px">
        </div>

        <div class="form-group">
          <label for="local-small-model">Haiku — Small / Fast</label>
          <p class="hint">Quick tasks (<code>ANTHROPIC_DEFAULT_HAIKU_MODEL</code>).</p>
          <select id="local-small-model"><option value="">— click Refresh —</option></select>
          <input type="text" id="local-small-model-custom" class="hidden"
                 placeholder="type any model ID" style="margin-top:4px">
        </div>
      </div>

      <div class="form-group">
        <label for="local-opus-model">Opus — Complex tasks</label>
        <p class="hint">Complex tasks (<code>ANTHROPIC_DEFAULT_OPUS_MODEL</code>).</p>
        <select id="local-opus-model"><option value="">— click Refresh —</option></select>
        <input type="text" id="local-opus-model-custom" class="hidden"
               placeholder="type any model ID" style="margin-top:4px">
      </div>
    </div><!-- /models-local-section -->

    <!-- Common: prompt caching -->
    <div class="form-group" style="margin-top:8px; padding-top:16px;
         border-top:1px solid var(--vscode-panel-border,#444);">
      <div class="toggle-row">
        <label class="toggle" for="disable-caching">
          <input type="checkbox" id="disable-caching">
          <span class="toggle-track"></span>
          <span class="toggle-thumb"></span>
        </label>
        <span id="lbl-disable-caching" class="toggle-label">Disable Prompt Caching</span>
      </div>
      <p class="hint">
        Sets <code>DISABLE_PROMPT_CACHING=1</code>. Useful when prompt caching is unavailable
        in your region or not supported by your local server.
      </p>
    </div>
  </div><!-- /tab-models -->

  <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       TAB: MCP Servers
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
  <div id="tab-mcp" class="tab-pane">
    <h2>MCP Servers</h2>
    <p class="section-desc">
      Model Context Protocol servers extend Claude Code with external tools, databases, and APIs.
      After saving, type <code>/mcp</code> in Claude Code to authenticate and use servers.
    </p>

    <!-- Scope selector -->
    <div class="form-group">
      <label>Scope</label>
      <div class="seg-bar" data-mcp-scope-bar style="margin-bottom:0">
        <button class="seg-btn active" data-scope="user">User scope</button>
        <button class="seg-btn" data-scope="project">Project scope</button>
      </div>
    </div>
    <p id="mcp-scope-hint" class="hint" style="margin-bottom:14px;">
      User-scope servers are stored in <code>~/.claude.json</code> and apply to every project.
    </p>

    <div id="server-list"></div>

    <!-- Add / Edit server inline form -->
    <div id="server-form" class="inline-form hidden">
      <h3 id="server-form-title">Add MCP Server</h3>

      <div class="form-group">
        <label for="srv-name">Server Name</label>
        <p class="hint">Unique identifier used as the key in settings.json (e.g. <code>github</code>, <code>postgres</code>).</p>
        <input type="text" id="srv-name" placeholder="my-server">
      </div>

      <div class="form-group">
        <label for="srv-type">Transport Type</label>
        <select id="srv-type">
          <option value="http">HTTP</option>
          <option value="sse">SSE (Server-Sent Events)</option>
          <option value="stdio">stdio (local process)</option>
        </select>
      </div>

      <div id="srv-url-group" class="form-group">
        <label for="srv-url">Server URL</label>
        <input type="text" id="srv-url" placeholder="https://api.example.com/mcp/">
      </div>

      <div id="srv-stdio-group" class="hidden">
        <div class="form-group">
          <label for="srv-command">Command</label>
          <p class="hint">Executable to launch (e.g. <code>npx</code>, <code>node</code>, <code>python</code>).</p>
          <input type="text" id="srv-command" placeholder="npx">
        </div>
        <div class="form-group">
          <label for="srv-args">Arguments <span class="hint" style="display:inline">(one per line)</span></label>
          <textarea id="srv-args" rows="3"
                    placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/dir"></textarea>
        </div>
      </div>

      <div class="form-group">
        <label>Environment Variables <span class="hint" style="display:inline">(passed to server process)</span></label>
        <div id="srv-env-list"></div>
        <button id="btn-add-env" class="btn-secondary btn-sm" style="margin-top:4px">
          + Add Variable
        </button>
      </div>

      <div class="form-actions">
        <button id="btn-commit-server" class="btn-primary">Save Server</button>
        <button id="btn-cancel-server" class="btn-secondary">Cancel</button>
      </div>
    </div>

    <button id="add-server-btn" class="btn-secondary">+ Add MCP Server</button>
  </div>

  <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       TAB: Directories
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
  <div id="tab-dirs" class="tab-pane">
    <h2>Allowed Directories</h2>
    <p class="section-desc">
      Additional directories Claude Code can read from and write to beyond the current
      workspace. Stored under <code>allowedDirectories</code> in
      <code>~/.claude/settings.json</code>.
    </p>

    <div class="callout callout-info">
      📁 By default Claude Code can only access the current project directory.
      Add shared libraries, configuration directories, or other repositories here.
    </div>

    <div id="dirs-list"></div>

    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="btn-add-dir" class="btn-secondary">+ Add Directory</button>
      <button id="btn-browse-dir" class="btn-secondary">Browse…</button>
    </div>
  </div>

  <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       TAB: Help
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
  <div id="tab-help" class="tab-pane">
    <h2>Help &amp; Reference</h2>

    <div class="help-block">
      <h3>Quick Setup — AWS Bedrock</h3>
      <ol>
        <li>Go to the <strong>Provider</strong> tab and select <strong>AWS Bedrock</strong>.</li>
        <li>Enable Bedrock and select your <strong>AWS Profile</strong> and <strong>Region</strong>.</li>
        <li>Open the <strong>Models</strong> tab and confirm the inference profiles are available in your account.</li>
        <li>Click <strong>Save Settings</strong>.</li>
      </ol>
      <h3>Quick Setup — Local / Compatible API</h3>
      <ol>
        <li>Start your local server (Ollama, LM Studio, LiteLLM, etc.).</li>
        <li>Go to the <strong>Provider</strong> tab and select <strong>Local / Compatible API</strong>.</li>
        <li>Enter the <strong>Base URL</strong> without a trailing <code>/v1</code> (e.g. <code>http://localhost:11434</code> for Ollama, <code>http://localhost:8000</code> for vLLM). Claude Code appends <code>/v1/messages</code> automatically.</li>
        <li>Open the <strong>Models</strong> tab and enter model names for each tier.</li>
        <li>Click <strong>Save Settings</strong>.</li>
      </ol>
      <p>
        All settings are written to <code>~/.claude/settings.json</code> and shared between
        the Claude Code VS Code extension and the <code>claude</code> terminal CLI.
      </p>
    </div>

    <hr>

    <div class="help-block">
      <h3>Supported Authentication Methods</h3>
      <ul>
        <li><strong>AWS Profile</strong> — configured via <code>aws configure</code> or
            <code>~/.aws/config</code>. Select in the Bedrock tab.</li>
        <li><strong>AWS SSO</strong> — run <code>aws sso login --profile &lt;name&gt;</code>
            first, then select the profile.  Use the <em>Auth Refresh Command</em> field
            so Claude Code can re-authenticate automatically.</li>
        <li><strong>Environment variables</strong> — set
            <code>AWS_ACCESS_KEY_ID</code> + <code>AWS_SECRET_ACCESS_KEY</code> before
            launching VS Code.</li>
        <li><strong>Bedrock API Keys</strong> — set
            <code>AWS_BEARER_TOKEN_BEDROCK</code> in your shell environment.</li>
      </ul>
    </div>

    <hr>

    <div class="help-block">
      <h3>Model ID Reference</h3>
      <pre># Sonnet (primary model — cross-region inference)
global.anthropic.claude-sonnet-4-6          ← recommended
us.anthropic.claude-sonnet-4-6

# Haiku (small/fast — cross-region inference)
us.anthropic.claude-haiku-4-5-20251001-v1:0 ← recommended

# Opus (complex tasks — cross-region inference)
us.anthropic.claude-opus-4-6-v1             ← recommended

# Application inference profile (custom ARN)
arn:aws:bedrock:REGION:ACCOUNT:application-inference-profile/ID</pre>
      <p>
        <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html"
           target="_blank">Full list of Bedrock inference profiles ↗</a>
      </p>
    </div>

    <hr>

    <div class="help-block">
      <h3>VS Code Extension vs CLI</h3>
      <p>
        The Claude Code <strong>VS Code extension</strong> (<code>anthropic.claude-code</code>)
        and the <code>claude</code> <strong>terminal CLI</strong> both read
        <code>~/.claude/settings.json</code> — so settings saved here work for both.
      </p>
      <p>
        To configure the extension to hide the Anthropic login prompt (required when
        using Bedrock), this extension automatically sets
        <code>claudeCode.disableLoginPrompt = true</code> in VS Code settings when you
        enable Bedrock.
      </p>
      <p>
        To use the CLI, open the integrated terminal and run <code>claude</code>.
        Run <code>/ide</code> inside Claude Code to connect the CLI session to VS Code
        for diff views and diagnostics.
      </p>
    </div>

    <hr>

    <div class="help-block">
      <h3>MCP Servers</h3>
      <p>
        After adding an MCP server here and saving, activate it inside Claude Code by
        typing <code>/mcp</code> in the prompt box.  Some servers require authentication —
        follow the prompts shown in the terminal.
      </p>
      <p>Popular open-source MCP servers:</p>
      <ul>
        <li><code>@modelcontextprotocol/server-filesystem</code> — local file access</li>
        <li><code>@modelcontextprotocol/server-github</code> — GitHub API</li>
        <li><code>@modelcontextprotocol/server-postgres</code> — PostgreSQL queries</li>
        <li><code>@modelcontextprotocol/server-brave-search</code> — web search</li>
      </ul>
      <p>
        <a href="https://code.claude.com/docs/en/mcp" target="_blank">
          Full MCP documentation ↗</a>
      </p>
    </div>

    <hr>

    <div class="help-block">
      <h3>Useful Links</h3>
      <ul>
        <li><a href="https://code.claude.com/docs/en/amazon-bedrock" target="_blank">Claude Code on Amazon Bedrock ↗</a></li>
        <li><a href="https://code.claude.com/docs/en/vs-code" target="_blank">Claude Code in VS Code ↗</a></li>
        <li><a href="https://code.claude.com/docs/en/settings" target="_blank">Claude Code settings reference ↗</a></li>
        <li><a href="https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock" target="_blank">Anthropic: Claude on Amazon Bedrock ↗</a></li>
        <li><a href="https://console.aws.amazon.com/bedrock/home#/modelaccess" target="_blank">AWS Console: Bedrock Model Access ↗</a></li>
      </ul>
    </div>
  </div>

  <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       Sticky save bar
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
  <div class="save-bar">
    <button id="btn-save"      class="btn-primary">Save Settings</button>
    <button id="btn-reload"    class="btn-secondary">Reload</button>
    <button id="btn-open-file" class="btn-secondary">Open settings.json</button>
    <span class="save-status" id="save-status"></span>
  </div>

  <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       Webview script
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
  <script nonce="${nonce}">
    // eslint-disable-next-line no-undef
    const vscode = acquireVsCodeApi();

    // ── Model catalogue (injected at build time) ────────────────────────────
    const ALL_MODELS = ${allModels};

    // ── State ──────────────────────────────────────────────────────────────
    let state = {
      bedrockConfig: {
        provider: 'bedrock',
        enabled: false, awsProfile: '', awsRegion: 'us-east-1', awsAuthRefresh: '',
        disableLoginPrompt: false,
        localBaseUrl: '', localApiKey: ''
      },
      modelConfig: {
        primaryModel: 'global.anthropic.claude-sonnet-4-6',
        smallFastModel: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        opusModel: 'us.anthropic.claude-opus-4-6-v1',
        disablePromptCaching: false
      },
      userMcpServers: [],
      projectMcpServers: [],
      allowedDirectories: [],
      awsProfiles: [],
      hasWorkspace: false
    };

    let editingServerIdx = -1;
    let mcpScope = 'user'; // 'user' | 'project'
    let dirty = false;
    let currentProvider = 'bedrock'; // mirrors state.bedrockConfig.provider
    let discoveredLocalModels = []; // fetched from /models endpoint

    // ── Message handling ───────────────────────────────────────────────────
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'init') {
        state = msg.data;
        currentProvider = state.bedrockConfig.provider || 'bedrock';
        dirty = false;
        renderAll();
      } else if (msg.type === 'saved') {
        dirty = false;
        setStatus('Saved to ' + msg.settingsPath, 'ok');
      } else if (msg.type === 'error') {
        setStatus(msg.message, 'err');
      } else if (msg.type === 'directoryPicked') {
        state.allowedDirectories[msg.index] = msg.path;
        renderDirs();
      } else if (msg.type === 'localModels') {
        discoveredLocalModels = msg.models || [];
        rebuildLocalModelSelects(discoveredLocalModels);
        const btn = document.getElementById('btn-refresh-models');
        const icon = btn.querySelector('.refresh-icon');
        icon.classList.remove('spinning');
        btn.disabled = false;
        btn.title = 'Fetched ' + discoveredLocalModels.length + ' model(s)';
      } else if (msg.type === 'localModelsError') {
        const btn = document.getElementById('btn-refresh-models');
        const icon = btn.querySelector('.refresh-icon');
        icon.classList.remove('spinning');
        btn.disabled = false;
        btn.title = 'Error: ' + (msg.message || 'Unknown error');
        setStatus('Model fetch failed: ' + (msg.message || 'Unknown error'), 'err');
      }
    });

    // ── Tab switching (event delegation — no inline handlers) ──────────────
    document.querySelector('.tab-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) { return; }
      switchTab(btn);
    });

    function switchTab(btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    }

    // ── Render everything ─────────────────────────────────────────────────
    function renderAll() {
      renderProvider();
      renderModels();
      renderServers();
      renderDirs();
    }

    // ── Region-aware model helpers ─────────────────────────────────────────
    function getRegionPrefixes(region) {
      if (region.startsWith('us-')) { return new Set(['us', 'global', '']); }
      if (region.startsWith('eu-')) { return new Set(['eu', 'global', '']); }
      if (region.startsWith('ap-')) { return new Set(['ap', 'global', '']); }
      return new Set(['global', '']); // ca-, sa-, etc.
    }

    function rebuildModelSelect(selId, customId, models, region, savedValue) {
      const sel = document.getElementById(selId);
      const prefixes = getRegionPrefixes(region);
      sel.innerHTML = '';
      models.filter(m => prefixes.has(m.prefix)).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        sel.appendChild(opt);
      });
      const customOpt = document.createElement('option');
      customOpt.value = '_custom';
      customOpt.textContent = 'Custom model ID\u2026';
      sel.appendChild(customOpt);
      syncModelSelect(selId, customId, savedValue);
    }

    function rebuildAllModelSelects(region) {
      const mc = state.modelConfig;
      rebuildModelSelect('primary-model', 'primary-model-custom', ALL_MODELS.sonnet, region, mc.primaryModel);
      rebuildModelSelect('small-model',   'small-model-custom',   ALL_MODELS.haiku,  region, mc.smallFastModel);
      rebuildModelSelect('opus-model',    'opus-model-custom',    ALL_MODELS.opus,   region, mc.opusModel);
    }

    // ── Provider tab ───────────────────────────────────────────────────────
    function renderProvider() {
      const bc = state.bedrockConfig;
      currentProvider = bc.provider || 'bedrock';

      // Provider selector buttons
      document.querySelectorAll('.provider-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.provider === currentProvider);
      });

      // Show/hide provider-specific sections
      document.getElementById('provider-bedrock-section')
        .classList.toggle('hidden', currentProvider !== 'bedrock');
      document.getElementById('provider-local-section')
        .classList.toggle('hidden', currentProvider !== 'local');

      // Common fields
      document.getElementById('disable-login-prompt').checked = bc.disableLoginPrompt || false;

      if (currentProvider === 'bedrock') {
        document.getElementById('bedrock-enabled').checked = bc.enabled;
        setBedrockFieldsEnabled(bc.enabled);

        const profileSel = document.getElementById('aws-profile');
        profileSel.innerHTML = '<option value="">(default credential chain)</option>';
        for (const p of (state.awsProfiles || [])) {
          const opt = document.createElement('option');
          opt.value = p;
          opt.textContent = p;
          profileSel.appendChild(opt);
        }
        profileSel.value = bc.awsProfile || '';

        const region = bc.awsRegion || 'us-east-1';
        document.getElementById('aws-region').value = region;
        document.getElementById('aws-auth-refresh').value = bc.awsAuthRefresh || '';
      } else {
        document.getElementById('local-base-url').value = bc.localBaseUrl || '';
        document.getElementById('local-api-key').value  = bc.localApiKey  || '';
      }

      // Models tab must also reflect provider change
      renderModels();
    }

    function setBedrockFieldsEnabled(enabled) {
      document.getElementById('bedrock-fields').style.opacity = enabled ? '1' : '0.55';
    }

    // ── Models tab ─────────────────────────────────────────────────────────
    function renderModels() {
      const mc = state.modelConfig;
      document.getElementById('disable-caching').checked = mc.disablePromptCaching;

      const isBedrock = currentProvider === 'bedrock';
      document.getElementById('models-bedrock-section').classList.toggle('hidden', !isBedrock);
      document.getElementById('models-local-section').classList.toggle('hidden', isBedrock);

      if (isBedrock) {
        const region = state.bedrockConfig.awsRegion || 'us-east-1';
        rebuildAllModelSelects(region);
      } else {
        if (discoveredLocalModels.length > 0) {
          rebuildLocalModelSelects(discoveredLocalModels);
        }
        syncModelSelect('local-primary-model', 'local-primary-model-custom', mc.primaryModel   || '');
        syncModelSelect('local-small-model',   'local-small-model-custom',   mc.smallFastModel || '');
        syncModelSelect('local-opus-model',    'local-opus-model-custom',    mc.opusModel      || '');
      }
    }

    function rebuildLocalModelSelects(models) {
      ['local-primary-model', 'local-small-model', 'local-opus-model'].forEach(selId => {
        const sel = document.getElementById(selId);
        const prev = sel.value;
        sel.innerHTML = '<option value="_custom">— enter manually… —</option>';
        models.forEach(id => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id;
          sel.appendChild(opt);
        });
        sel.value = models.includes(prev) ? prev : '_custom';
        handleCustomSelect(sel, selId + '-custom');
      });
    }

    function syncModelSelect(selId, customId, value) {
      const sel = document.getElementById(selId);
      const custom = document.getElementById(customId);
      let found = false;
      for (const opt of sel.options) {
        if (opt.value === value) { found = true; break; }
      }
      if (found && value !== '_custom') {
        sel.value = value;
        custom.classList.add('hidden');
      } else {
        sel.value = '_custom';
        custom.classList.remove('hidden');
        custom.value = value || '';
      }
    }

    function handleCustomSelect(sel, customId) {
      const custom = document.getElementById(customId);
      if (sel.value === '_custom') {
        custom.classList.remove('hidden');
        custom.focus();
      } else {
        custom.classList.add('hidden');
      }
    }

    function getModelValue(selId, customId) {
      const sel = document.getElementById(selId);
      return sel.value === '_custom' ? document.getElementById(customId).value.trim() : sel.value;
    }

    function scopedServers() {
      return mcpScope === 'user' ? state.userMcpServers : state.projectMcpServers;
    }

    function renderScopeBar() {
      document.querySelectorAll('[data-scope]').forEach(b => {
        b.classList.toggle('active', b.dataset.scope === mcpScope);
      });
      const hint = document.getElementById('mcp-scope-hint');
      if (mcpScope === 'user') {
        hint.innerHTML = 'User-scope servers are stored in <code>~/.claude.json</code> and apply to every project.';
      } else {
        const hasWs = state.hasWorkspace;
        hint.innerHTML = hasWs
          ? 'Project-scope servers are stored in <code>.mcp.json</code> at the workspace root.'
          : '<strong>No workspace open.</strong> Open a folder to manage project-scope MCP servers.';
      }
    }

    // ── MCP Servers tab ────────────────────────────────────────────────────
    function renderServers() {
      renderScopeBar();
      const list = document.getElementById('server-list');
      list.innerHTML = '';

      const servers = scopedServers();
      if (!servers.length) {
        list.innerHTML = '<p class="empty-msg">No MCP servers configured. Add one below.</p>';
        return;
      }

      servers.forEach((srv, i) => {
        const detail = srv.type === 'stdio'
          ? [srv.command, ...(srv.args || [])].join(' ')
          : srv.url || '';

        const card = document.createElement('div');
        card.className = 'server-card';
        card.innerHTML =
          '<div class="server-card-header">' +
            '<div>' +
              '<span class="server-name">' + esc(srv.name) + '</span>' +
              '<span class="badge">' + esc(srv.type) + '</span>' +
            '</div>' +
            '<div class="card-actions">' +
              '<button class="btn-secondary btn-sm" data-edit-idx="' + i + '">Edit</button>' +
              '<button class="btn-danger btn-sm" data-delete-idx="' + i + '">Delete</button>' +
            '</div>' +
          '</div>' +
          '<div class="server-detail">' + esc(detail) + '</div>';
        list.appendChild(card);
      });
    }

    // MCP server card delegation
    document.getElementById('server-list').addEventListener('click', e => {
      const editBtn = e.target.closest('[data-edit-idx]');
      const delBtn  = e.target.closest('[data-delete-idx]');
      if (editBtn)  { startEditServer(parseInt(editBtn.dataset.editIdx, 10)); }
      if (delBtn)   { deleteServer(parseInt(delBtn.dataset.deleteIdx, 10)); }
    });

    function startAddServer() {
      editingServerIdx = -1;
      document.getElementById('server-form-title').textContent = 'Add MCP Server';
      document.getElementById('srv-name').value = '';
      document.getElementById('srv-type').value = 'http';
      document.getElementById('srv-url').value = '';
      document.getElementById('srv-command').value = '';
      document.getElementById('srv-args').value = '';
      document.getElementById('srv-env-list').innerHTML = '';
      onSrvTypeChange();
      document.getElementById('server-form').classList.remove('hidden');
      document.getElementById('add-server-btn').classList.add('hidden');
    }

    function startEditServer(idx) {
      editingServerIdx = idx;
      const srv = scopedServers()[idx];
      document.getElementById('server-form-title').textContent = 'Edit MCP Server';
      document.getElementById('srv-name').value = srv.name;
      document.getElementById('srv-type').value = srv.type;
      document.getElementById('srv-url').value = srv.url || '';
      document.getElementById('srv-command').value = srv.command || '';
      document.getElementById('srv-args').value = (srv.args || []).join('\\n');
      document.getElementById('srv-env-list').innerHTML = '';
      for (const [k, v] of Object.entries(srv.env || {})) { addEnvRow(k, v); }
      onSrvTypeChange();
      document.getElementById('server-form').classList.remove('hidden');
      document.getElementById('add-server-btn').classList.add('hidden');
    }

    function cancelServerForm() {
      document.getElementById('server-form').classList.add('hidden');
      document.getElementById('add-server-btn').classList.remove('hidden');
      editingServerIdx = -1;
    }

    function onSrvTypeChange() {
      const t = document.getElementById('srv-type').value;
      document.getElementById('srv-url-group').classList.toggle('hidden', t === 'stdio');
      document.getElementById('srv-stdio-group').classList.toggle('hidden', t !== 'stdio');
    }

    function addEnvRow(k, v) {
      k = k || ''; v = v || '';
      const row = document.createElement('div');
      row.className = 'env-row';
      row.innerHTML =
        '<input type="text" class="env-key" placeholder="KEY" value="' + esc(k) + '">' +
        '<input type="text" class="env-val" placeholder="value" value="' + esc(v) + '">' +
        '<button class="btn-danger btn-sm btn-remove-env">&#x2715;</button>';
      document.getElementById('srv-env-list').appendChild(row);
    }

    // env-row remove delegation
    document.getElementById('srv-env-list').addEventListener('click', e => {
      if (e.target.closest('.btn-remove-env')) { e.target.closest('.env-row').remove(); }
    });

    function commitServer() {
      const name = document.getElementById('srv-name').value.trim();
      if (!name) { alert('Server name is required.'); return; }

      const type = document.getElementById('srv-type').value;
      const srv = { name, type };

      if (type === 'stdio') {
        const cmd = document.getElementById('srv-command').value.trim();
        if (!cmd) { alert('Command is required for stdio servers.'); return; }
        srv.command = cmd;
        const argsRaw = document.getElementById('srv-args').value.trim();
        srv.args = argsRaw ? argsRaw.split('\\n').map(a => a.trim()).filter(Boolean) : [];
      } else {
        const url = document.getElementById('srv-url').value.trim();
        if (!url) { alert('URL is required for HTTP/SSE servers.'); return; }
        srv.url = url;
      }

      const envRows = document.querySelectorAll('#srv-env-list .env-row');
      if (envRows.length) {
        const envObj = {};
        envRows.forEach(row => {
          const k = row.querySelector('.env-key').value.trim();
          const v = row.querySelector('.env-val').value.trim();
          if (k) { envObj[k] = v; }
        });
        if (Object.keys(envObj).length) { srv.env = envObj; }
      }

      if (editingServerIdx >= 0) {
        scopedServers()[editingServerIdx] = srv;
      } else {
        scopedServers().push(srv);
      }
      cancelServerForm();
      renderServers();
    }

    function deleteServer(idx) {
      if (!confirm('Delete server "' + scopedServers()[idx].name + '"?')) { return; }
      scopedServers().splice(idx, 1);
      renderServers();
    }

    // ── Directories tab ────────────────────────────────────────────────────
    function renderDirs() {
      const list = document.getElementById('dirs-list');
      list.innerHTML = '';

      if (!state.allowedDirectories.length) {
        list.innerHTML = '<p class="empty-msg">No additional directories configured.</p>';
        return;
      }

      state.allowedDirectories.forEach((dir, i) => {
        const row = document.createElement('div');
        row.className = 'dir-row';
        row.innerHTML =
          '<input type="text" data-dir-idx="' + i + '" value="' + esc(dir) + '" placeholder="/absolute/path">' +
          '<button class="btn-secondary btn-sm" data-browse-idx="' + i + '">Browse</button>' +
          '<button class="btn-danger btn-sm"    data-remove-idx="' + i + '">&#x2715;</button>';
        list.appendChild(row);
      });
    }

    // Directory delegation
    document.getElementById('dirs-list').addEventListener('click', e => {
      const br = e.target.closest('[data-browse-idx]');
      const rm = e.target.closest('[data-remove-idx]');
      if (br) { browseDir(parseInt(br.dataset.browseIdx, 10)); }
      if (rm) { removeDir(parseInt(rm.dataset.removeIdx, 10)); }
    });

    document.getElementById('dirs-list').addEventListener('change', e => {
      const inp = e.target.closest('[data-dir-idx]');
      if (inp) { state.allowedDirectories[parseInt(inp.dataset.dirIdx, 10)] = inp.value; }
    });

    function addDir() {
      state.allowedDirectories.push('');
      renderDirs();
      const inputs = document.querySelectorAll('#dirs-list .dir-row input');
      if (inputs.length) { inputs[inputs.length - 1].focus(); }
    }

    function browseDir(idx) {
      if (idx < 0) {
        idx = state.allowedDirectories.length;
        state.allowedDirectories.push('');
        renderDirs();
      }
      vscode.postMessage({ type: 'pickDirectory', data: idx });
    }

    function removeDir(idx) {
      state.allowedDirectories.splice(idx, 1);
      renderDirs();
    }

    // ── Save ───────────────────────────────────────────────────────────────
    function saveAll() {
      const isBedrock = currentProvider === 'bedrock';

      state.bedrockConfig = {
        provider:            currentProvider,
        enabled:             isBedrock ? document.getElementById('bedrock-enabled').checked : false,
        awsProfile:          isBedrock ? document.getElementById('aws-profile').value : '',
        awsRegion:           isBedrock ? document.getElementById('aws-region').value : '',
        awsAuthRefresh:      isBedrock ? document.getElementById('aws-auth-refresh').value.trim() : '',
        disableLoginPrompt:  document.getElementById('disable-login-prompt').checked,
        localBaseUrl:        !isBedrock ? document.getElementById('local-base-url').value.trim() : '',
        localApiKey:         !isBedrock ? document.getElementById('local-api-key').value.trim() : '',
      };

      state.modelConfig = {
        primaryModel:         isBedrock
          ? getModelValue('primary-model', 'primary-model-custom')
          : getModelValue('local-primary-model', 'local-primary-model-custom'),
        smallFastModel:       isBedrock
          ? getModelValue('small-model',   'small-model-custom')
          : getModelValue('local-small-model',   'local-small-model-custom'),
        opusModel:            isBedrock
          ? getModelValue('opus-model',    'opus-model-custom')
          : getModelValue('local-opus-model',    'local-opus-model-custom'),
        disablePromptCaching: document.getElementById('disable-caching').checked
      };

      state.allowedDirectories = Array.from(
        document.querySelectorAll('#dirs-list .dir-row input[type="text"]')
      ).map(el => el.value.trim()).filter(Boolean);

      vscode.postMessage({ type: 'save', data: state });
      setStatus('Saving\u2026', '');
    }

    function reloadFromDisk() {
      vscode.postMessage({ type: 'reload' });
      setStatus('Reloading\u2026', '');
    }

    function fetchLocalModels() {
      const baseUrl = document.getElementById('local-base-url').value.trim();
      if (!baseUrl) {
        setStatus('Set the Local API Base URL first.', 'err');
        return;
      }
      const apiKey = document.getElementById('local-api-key').value.trim();
      const btn  = document.getElementById('btn-refresh-models');
      const icon = btn.querySelector('.refresh-icon');
      icon.classList.add('spinning');
      btn.disabled = true;
      btn.title = 'Fetching models\u2026';
      vscode.postMessage({ type: 'fetchLocalModels', data: { baseUrl, apiKey } });
    }

    function openFile() {
      vscode.postMessage({ type: 'openFile' });
    }

    function setStatus(msg, cls) {
      const el = document.getElementById('save-status');
      el.textContent = msg;
      el.className = 'save-status ' + cls;
      if (cls === 'ok') {
        setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 4000);
      }
    }

    // ── Utility ────────────────────────────────────────────────────────────
    function esc(str) {
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Dirty tracking ─────────────────────────────────────────────────────
    function markDirty() {
      if (!dirty) {
        dirty = true;
        vscode.postMessage({ type: 'dirty' });
      }
    }

    document.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input',  markDirty);
      el.addEventListener('change', markDirty);
    });

    // ── Attach remaining event listeners ───────────────────────────────────

    // Bedrock toggle
    document.getElementById('bedrock-enabled')
      .addEventListener('change', e => setBedrockFieldsEnabled(e.target.checked));

    // Toggle label click-through
    document.getElementById('lbl-bedrock-enabled')
      .addEventListener('click', () => document.getElementById('bedrock-enabled').click());
    document.getElementById('lbl-disable-caching')
      .addEventListener('click', () => document.getElementById('disable-caching').click());
    document.getElementById('lbl-disable-login-prompt')
      .addEventListener('click', () => document.getElementById('disable-login-prompt').click());

    // Provider selector
    document.querySelector('.provider-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-provider]');
      if (!btn) { return; }
      const newProvider = btn.dataset.provider;
      if (newProvider === currentProvider) { return; }
      currentProvider = newProvider;
      state.bedrockConfig.provider = newProvider;
      renderProvider();
      markDirty();
    });

    // MCP scope bar
    document.querySelector('.seg-bar[data-mcp-scope-bar]') && document.querySelector('.seg-bar[data-mcp-scope-bar]').addEventListener('click', e => {
      const btn = e.target.closest('[data-scope]');
      if (!btn) { return; }
      mcpScope = btn.dataset.scope;
      cancelServerForm();
      renderServers();
    });

    // Region change → rebuild Bedrock model selects
    document.getElementById('aws-region')
      .addEventListener('change', e => {
        state.bedrockConfig.awsRegion = e.target.value;
        if (currentProvider === 'bedrock') { rebuildAllModelSelects(e.target.value); }
      });

    // Model selects → custom input toggle
    ['primary-model', 'small-model', 'opus-model'].forEach(id => {
      document.getElementById(id)
        .addEventListener('change', function() { handleCustomSelect(this, id + '-custom'); });
    });

    // Refresh models button
    document.getElementById('btn-refresh-models').addEventListener('click', () => {
      if (currentProvider === 'bedrock') {
        const region = state.bedrockConfig.awsRegion || 'us-east-1';
        rebuildAllModelSelects(region);
      } else {
        fetchLocalModels();
      }
    });

    // Local model selects → custom input toggle
    ['local-primary-model', 'local-small-model', 'local-opus-model'].forEach(id => {
      document.getElementById(id)
        .addEventListener('change', function() { handleCustomSelect(this, id + '-custom'); });
    });

    // MCP server form
    document.getElementById('add-server-btn') .addEventListener('click', startAddServer);
    document.getElementById('btn-commit-server').addEventListener('click', commitServer);
    document.getElementById('btn-cancel-server').addEventListener('click', cancelServerForm);
    document.getElementById('srv-type')         .addEventListener('change', onSrvTypeChange);
    document.getElementById('btn-add-env')      .addEventListener('click', () => addEnvRow());

    // Directories
    document.getElementById('btn-add-dir')  .addEventListener('click', addDir);
    document.getElementById('btn-browse-dir').addEventListener('click', () => browseDir(-1));

    // Save bar
    document.getElementById('btn-save')      .addEventListener('click', saveAll);
    document.getElementById('btn-reload')    .addEventListener('click', reloadFromDisk);
    document.getElementById('btn-open-file') .addEventListener('click', openFile);

    // Signal ready so the extension sends initial data
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
