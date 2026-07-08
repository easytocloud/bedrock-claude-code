import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  readProfileStore,
  writeProfileStore,
  applyAllScopes,
  ensureOnboardingComplete,
  ProfileStore,
  ProviderProfile,
  Preset,
  ScopeAssignment,
} from '@easytocloud/claude-personae-core';
import { refreshStatusBar, refreshOpenPanel } from './statusBar';

export const PRESETS_VIEW_ID = 'bedrock-claude-code.presetsView';

// ---------------------------------------------------------------------------
// Sidebar state — a compact, render-ready projection of the profile store
// ---------------------------------------------------------------------------

interface ChipSpec {
  /** SVG filename in media/provider-icons/ — falls back to the monogram label */
  icon?: string;
  label: string;
  bg: string;
  fg: string;
}

interface SidebarPresetItem {
  id: string;
  name: string;
  subtitle: string;
  chip: ChipSpec;
}

interface SidebarSelected {
  mode: 'preset' | 'manual' | 'none';
  presetId?: string;
  name: string;
  subtitle?: string;
  meta?: string;
  chip?: ChipSpec;
  /** e.g. "Inherited from Global" — shown under the card when relevant */
  scopeNote?: string;
}

interface SidebarState {
  hasWorkspace: boolean;
  workspaceName?: string;
  selected: SidebarSelected;
  /** Workspace has an explicit preset/manual — offer "Inherit from Global" */
  canInherit: boolean;
  presets: SidebarPresetItem[];
}

type ProxyFlavor = NonNullable<ProviderProfile['proxyPreset']>;

/**
 * Work out which known provider a proxy really is. `proxyPreset` is only set
 * on records created since v0.3.21 and stays 'custom' when the user picked
 * Custom despite pointing at a known service — so fall back to recognizable
 * URLs, default ports, and finally the provider/preset names.
 */
function inferProxyFlavor(provider: ProviderProfile, presetName?: string): ProxyFlavor {
  if (provider.proxyPreset && provider.proxyPreset !== 'custom') {
    return provider.proxyPreset;
  }

  const url = (provider.proxyBaseUrl ?? '').toLowerCase();
  if (url.includes('openrouter.ai')) { return 'openrouter'; }
  if (url.includes('bedrock') || url.includes('amazonaws.com')) { return 'bedrock'; }
  if (/:11434(?:\/|$)/.test(url)) { return 'ollama'; }   // Ollama default port
  if (/:1234(?:\/|$)/.test(url)) { return 'lmstudio'; }  // LM Studio default port
  if (/:8000(?:\/|$)/.test(url)) { return 'vllm'; }      // vLLM default port
  if (/:4000(?:\/|$)/.test(url)) { return 'litellm'; }   // LiteLLM default port

  const names = `${provider.name} ${presetName ?? ''}`.toLowerCase();
  if (names.includes('openrouter')) { return 'openrouter'; }
  if (names.includes('vllm')) { return 'vllm'; }
  if (names.includes('ollama')) { return 'ollama'; }
  if (names.includes('lm studio') || names.includes('lmstudio')) { return 'lmstudio'; }
  if (names.includes('litellm')) { return 'litellm'; }
  if (names.includes('omlx')) { return 'omlx'; }
  if (names.includes('bedrock')) { return 'bedrock'; }

  return 'custom';
}

const BEDROCK_CHIP: ChipSpec = {
  // AWS Machine Learning category gradient behind the official Bedrock glyph
  icon: 'bedrock.svg',
  label: '✦',
  bg: 'linear-gradient(135deg, #56C0A7 0%, #055F4E 100%)',
  fg: '#ffffff',
};

function chipForProvider(provider: ProviderProfile | undefined, presetName?: string): ChipSpec {
  if (!provider) {
    return { label: '?', bg: '#6B7280', fg: '#ffffff' };
  }
  if (provider.type === 'anthropic') {
    return { icon: 'anthropic.svg', label: 'A', bg: '#D97757', fg: '#ffffff' };
  }
  if (provider.type === 'bedrock') {
    return BEDROCK_CHIP;
  }
  switch (inferProxyFlavor(provider, presetName)) {
    case 'bedrock': return BEDROCK_CHIP;
    case 'openrouter': return { icon: 'openrouter.svg', label: 'OR', bg: '#101828', fg: '#ffffff' };
    case 'ollama': return { icon: 'ollama.svg', label: 'OL', bg: '#F4F4F5', fg: '#18181B' };
    case 'lmstudio': return { icon: 'lmstudio.svg', label: 'LM', bg: '#4F46E5', fg: '#ffffff' };
    case 'omlx': return { label: 'MX', bg: '#0EA5E9', fg: '#ffffff' };
    case 'vllm': return { icon: 'vllm.svg', label: 'VL', bg: '#334155', fg: '#ffffff' };
    case 'litellm': return { label: 'LL', bg: '#10B981', fg: '#ffffff' };
    // Custom — our own layered-squares logo on the extension's banner color
    default: return { icon: 'custom.svg', label: 'C', bg: '#1a1a2e', fg: '#ffffff' };
  }
}

function subtitleForProvider(provider: ProviderProfile | undefined): string {
  if (!provider) { return ''; }
  if (provider.type === 'bedrock') { return provider.primaryModel || ''; }
  if (provider.type === 'anthropic') { return 'api.anthropic.com'; }
  return provider.proxyBaseUrl || provider.primaryModel || '';
}

function metaForPreset(preset: Preset, store: ProfileStore): string | undefined {
  const parts: string[] = [];

  const serverCount = preset.mcpGroupIds.reduce((sum, gid) => {
    const group = store.mcpGroups.find(g => g.id === gid);
    return sum + (group ? group.servers.length : 0);
  }, 0);
  if (serverCount > 0) {
    parts.push(`MCPs: ${serverCount} server${serverCount === 1 ? '' : 's'}`);
  }

  const dirNames = preset.directoryGroupIds
    .map(gid => store.directoryGroups.find(g => g.id === gid)?.name)
    .filter((n): n is string => !!n);
  if (dirNames.length > 0) {
    parts.push(`Access: ${dirNames.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('  •  ') : undefined;
}

function selectedFromScope(
  scope: ScopeAssignment | undefined,
  store: ProfileStore,
  scopeNote?: string
): SidebarSelected {
  if (scope?.mode === 'preset' && scope.presetId) {
    const preset = store.presets.find(p => p.id === scope.presetId);
    if (preset) {
      const provider = store.providers.find(p => p.id === preset.providerId);
      return {
        mode: 'preset',
        presetId: preset.id,
        name: preset.name,
        subtitle: subtitleForProvider(provider),
        meta: metaForPreset(preset, store),
        chip: chipForProvider(provider, preset.name),
        scopeNote,
      };
    }
  }
  if (scope?.mode === 'manual') {
    return {
      mode: 'manual',
      name: 'Manual',
      subtitle: 'You manage the config files yourself',
      scopeNote,
    };
  }
  return {
    mode: 'none',
    name: 'No preset selected',
    subtitle: 'Pick one below, or create a new one',
    scopeNote,
  };
}

function buildSidebarState(): SidebarState {
  const store = readProfileStore();
  const folder = vscode.workspace.workspaceFolders?.[0];
  const workspaceRoot = folder?.uri.fsPath;
  const wsScope = workspaceRoot ? store.workspaceScopes[workspaceRoot] : undefined;

  let selected: SidebarSelected;
  let canInherit = false;

  if (workspaceRoot) {
    if (wsScope?.mode === 'preset' || wsScope?.mode === 'manual') {
      selected = selectedFromScope(wsScope, store);
      canInherit = true;
    } else {
      // Inherit (explicit or unconfigured) — the global preset is effective here
      selected = selectedFromScope(store.globalScope, store, 'Inherited from Global');
    }
  } else {
    selected = selectedFromScope(store.globalScope, store, 'Global scope');
  }

  const presets: SidebarPresetItem[] = store.presets
    .filter(p => p.id !== selected.presetId)
    .map(p => {
      const provider = store.providers.find(pr => pr.id === p.providerId);
      return {
        id: p.id,
        name: p.name,
        subtitle: subtitleForProvider(provider),
        chip: chipForProvider(provider, p.name),
      };
    });

  return {
    hasWorkspace: !!workspaceRoot,
    workspaceName: folder?.name,
    selected,
    canInherit,
    presets,
  };
}

// ---------------------------------------------------------------------------
// Webview view provider
// ---------------------------------------------------------------------------

export class PresetsSidebarProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, 'media')],
    };
    view.webview.html = this._buildHtml(view.webview);

    view.webview.onDidReceiveMessage(
      (msg: { type: string; presetId?: string }) => this._handleMessage(msg)
    );
    view.onDidDispose(() => {
      if (this._view === view) { this._view = undefined; }
    });
  }

  /** Re-send state to the webview (no-op when the view isn't open). */
  public refresh(): void {
    this._view?.webview.postMessage({ type: 'state', data: buildSidebarState() });
  }

  private async _handleMessage(msg: { type: string; presetId?: string }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.refresh();
        break;

      case 'selectPreset':
        if (msg.presetId) { await this._selectPreset(msg.presetId); }
        break;

      case 'inherit':
        await this._applyWorkspaceScope({ mode: 'inherit' });
        break;

      case 'createPreset':
      case 'openPanel':
        vscode.commands.executeCommand('bedrock-claude-code.openSettings');
        break;
    }
  }

  private async _selectPreset(presetId: string): Promise<void> {
    const store = readProfileStore();
    const preset = store.presets.find(p => p.id === presetId);
    if (!preset) { return; }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (workspaceRoot) {
      store.workspaceScopes[workspaceRoot] = { mode: 'preset', presetId };
    } else {
      // No workspace open — this changes the global scope, so confirm first
      const confirm = await vscode.window.showWarningMessage(
        `Change global preset to "${preset.name}"? This affects all workspaces set to Inherit.`,
        { modal: true },
        'Change'
      );
      if (confirm !== 'Change') { return; }
      store.globalScope = { mode: 'preset', presetId };
    }

    this._writeAndApply(store, workspaceRoot);
    vscode.window.showInformationMessage(
      workspaceRoot
        ? `VS Code Workspace preset set to: ${preset.name}`
        : `Global preset set to: ${preset.name}`
    );
  }

  private async _applyWorkspaceScope(assignment: ScopeAssignment): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { return; }

    const store = readProfileStore();
    store.workspaceScopes[workspaceRoot] = assignment;
    this._writeAndApply(store, workspaceRoot);
    vscode.window.showInformationMessage('VS Code Workspace now inherits the global preset.');
  }

  private _writeAndApply(store: ProfileStore, workspaceRoot: string | undefined): void {
    writeProfileStore(store);
    ensureOnboardingComplete();
    applyAllScopes(store, workspaceRoot);
    refreshStatusBar(); // also refreshes this sidebar via the hook
    refreshOpenPanel();
  }

  private _buildHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'sidebar.js')
    ).toString();
    const iconBase = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'provider-icons')
    ).toString();
    // <-escape so preset names can't break out of the inline script
    const stateJson = JSON.stringify(buildSidebarState()).replace(/</g, '\\u003c');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};" />
  <style nonce="${nonce}">${SIDEBAR_STYLES}</style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__ICON_BASE__ = ${JSON.stringify(iconBase)};
    window.__SIDEBAR_DATA__ = ${stateJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// Styles — theme-aware via VS Code CSS variables, card look from the mockup
// ---------------------------------------------------------------------------

const SIDEBAR_STYLES = /* css */ `
  * { box-sizing: border-box; }
  body {
    padding: 4px 12px 16px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
    background: transparent;
  }

  .section-label {
    margin: 16px 2px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  .section-label:first-child { margin-top: 10px; }

  /* ── Selected card ── */
  .selected-card {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--vscode-focusBorder) 55%, transparent);
    background: color-mix(in srgb, var(--vscode-focusBorder) 10%, var(--vscode-sideBar-background, transparent));
  }
  .selected-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .selected-row .chip {
    width: 38px;
    height: 38px;
    border-radius: 9px;
  }
  .selected-row .chip .chip-icon {
    width: 22px;
    height: 22px;
  }
  .selected-text { min-width: 0; }
  .selected-name {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .selected-sub {
    margin-top: 6px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .selected-meta {
    margin-top: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .scope-note {
    margin-top: 8px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.85;
  }

  .inherit-link {
    display: inline-block;
    margin: 8px 2px 0;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 12px;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
  }
  .inherit-link:hover { text-decoration: underline; }

  /* ── Preset rows ── */
  .preset-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin-bottom: 6px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .preset-row:hover {
    background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
    border-color: color-mix(in srgb, var(--vscode-focusBorder) 40%, transparent);
  }
  .chip {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
  }
  .chip-icon {
    width: 18px;
    height: 18px;
    display: block;
  }
  .row-text { min-width: 0; }
  .row-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-sub {
    margin-top: 2px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-hint {
    padding: 4px 2px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  /* ── Create button ── */
  .create-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--vscode-foreground) 15%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: inherit;
    cursor: pointer;
  }
  .create-btn:hover {
    background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
  }
  .create-plus {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
    font-size: 15px;
    font-weight: 400;
  }
`;
