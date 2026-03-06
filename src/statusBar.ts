import * as vscode from 'vscode';
import { readProfileStore, writeProfileStore } from './profiles';
import { applyAllScopes } from './resolver';
import { ensureOnboardingComplete } from './claudeJson';
import { ScopeAssignment } from './types';

// ---------------------------------------------------------------------------
// Status bar item — shows active preset and scope, click to quick-switch
// ---------------------------------------------------------------------------

let statusBarItem: vscode.StatusBarItem;

export function createStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50 // priority — lower = further right
  );
  statusBarItem.command = 'bedrock-claude-code.quickSwitch';
  context.subscriptions.push(statusBarItem);

  // Register the quick-switch command
  context.subscriptions.push(
    vscode.commands.registerCommand('bedrock-claude-code.quickSwitch', () => quickSwitch())
  );

  // Initial render
  refreshStatusBar();

  // Re-render when workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => refreshStatusBar())
  );
}

/** Call this after saving the store to update the status bar. */
export function refreshStatusBar(): void {
  if (!statusBarItem) { return; }

  const store = readProfileStore();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Determine the effective scope for display
  const globalScope = store.globalScope;
  const wsScope = workspaceRoot ? store.workspaceScopes[workspaceRoot] : undefined;

  const globalPresetName = presetLabel(globalScope, store.presets);
  const wsPresetName = wsScope ? scopeLabel(wsScope, store.presets) : undefined;

  // Status bar shows the most relevant scope
  if (wsScope && wsScope.mode === 'preset' && wsScope.presetId) {
    // Workspace has its own preset
    const name = presetLabel(wsScope, store.presets);
    statusBarItem.text = `$(symbol-event) ${name}`;
    statusBarItem.tooltip = `Global: ${globalPresetName}\nWorkspace: ${name}\n\nClick to switch presets`;
  } else if (wsScope && wsScope.mode === 'manual') {
    statusBarItem.text = `$(symbol-event) Manual`;
    statusBarItem.tooltip = `Global: ${globalPresetName}\nWorkspace: Manual\n\nClick to switch presets`;
  } else if (wsScope && wsScope.mode === 'inherit') {
    statusBarItem.text = `$(symbol-event) ${globalPresetName}`;
    statusBarItem.tooltip = `Global: ${globalPresetName}\nWorkspace: Inherited\n\nClick to switch presets`;
  } else {
    // No workspace or no workspace scope set
    statusBarItem.text = `$(symbol-event) ${globalPresetName}`;
    statusBarItem.tooltip = workspaceRoot
      ? `Global: ${globalPresetName}\nWorkspace: Not set\n\nClick to switch presets`
      : `Global: ${globalPresetName}\n\nClick to switch presets`;
  }

  statusBarItem.show();
}

// ---------------------------------------------------------------------------
// Quick-switch via quick-pick
// ---------------------------------------------------------------------------

interface ScopeQuickPickItem extends vscode.QuickPickItem {
  scope?: 'global' | 'workspace';
  mode?: 'preset' | 'manual' | 'inherit';
  presetId?: string;
}

async function quickSwitch(): Promise<void> {
  const store = readProfileStore();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const wsScope = workspaceRoot ? store.workspaceScopes[workspaceRoot] : undefined;

  const items: ScopeQuickPickItem[] = [];

  // ── Global section ──
  items.push({ label: 'Global Scope', kind: vscode.QuickPickItemKind.Separator });

  for (const preset of store.presets) {
    const isCurrent = store.globalScope.mode === 'preset' && store.globalScope.presetId === preset.id;
    const provider = store.providers.find(p => p.id === preset.providerId);
    items.push({
      label: `${isCurrent ? '$(check) ' : '     '}${preset.name}`,
      description: provider ? provider.name : '',
      scope: 'global',
      mode: 'preset',
      presetId: preset.id,
    });
  }
  items.push({
    label: `${store.globalScope.mode === 'manual' ? '$(check) ' : '     '}Manual`,
    description: 'Manage config files yourself',
    scope: 'global',
    mode: 'manual',
  });

  // ── Workspace section (only if a workspace is open) ──
  if (workspaceRoot) {
    const wsName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'Workspace';
    items.push({ label: `Workspace: ${wsName}`, kind: vscode.QuickPickItemKind.Separator });

    items.push({
      label: `${wsScope?.mode === 'inherit' ? '$(check) ' : '     '}Inherit from Global`,
      description: 'Use the global preset',
      scope: 'workspace',
      mode: 'inherit',
    });

    for (const preset of store.presets) {
      const isCurrent = wsScope?.mode === 'preset' && wsScope?.presetId === preset.id;
      const provider = store.providers.find(p => p.id === preset.providerId);
      items.push({
        label: `${isCurrent ? '$(check) ' : '     '}${preset.name}`,
        description: provider ? provider.name : '',
        scope: 'workspace',
        mode: 'preset',
        presetId: preset.id,
      });
    }
    items.push({
      label: `${wsScope?.mode === 'manual' ? '$(check) ' : '     '}Manual`,
      description: 'Manage workspace config files yourself',
      scope: 'workspace',
      mode: 'manual',
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Switch preset scope',
    matchOnDescription: true,
  });

  if (!pick || !pick.scope || !pick.mode) { return; }

  // Apply the selection
  const newAssignment: ScopeAssignment = pick.mode === 'preset'
    ? { mode: 'preset', presetId: pick.presetId }
    : { mode: pick.mode as 'manual' | 'inherit' };

  if (pick.scope === 'global') {
    store.globalScope = newAssignment;
  } else if (workspaceRoot) {
    store.workspaceScopes[workspaceRoot] = newAssignment;
  }

  // Save and apply
  writeProfileStore(store);
  ensureOnboardingComplete();
  applyAllScopes(store, workspaceRoot);
  refreshStatusBar();

  // Notify the settings panel if it's open
  if (ClaudeCodeSettingsPanel_refresh) {
    ClaudeCodeSettingsPanel_refresh();
  }

  const scopeName = pick.scope === 'global' ? 'Global' : 'Workspace';
  const presetName = pick.mode === 'preset'
    ? store.presets.find(p => p.id === pick.presetId)?.name ?? 'Unknown'
    : pick.mode === 'inherit' ? 'Inherit' : 'Manual';
  vscode.window.showInformationMessage(`${scopeName} scope set to: ${presetName}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function presetLabel(scope: ScopeAssignment, presets: { id: string; name: string }[]): string {
  if (scope.mode === 'preset' && scope.presetId) {
    return presets.find(p => p.id === scope.presetId)?.name ?? 'Unknown';
  }
  return scope.mode === 'manual' ? 'Manual' : 'Not set';
}

function scopeLabel(scope: ScopeAssignment, presets: { id: string; name: string }[]): string {
  if (scope.mode === 'inherit') { return 'Inherit'; }
  return presetLabel(scope, presets);
}

// ---------------------------------------------------------------------------
// Panel refresh hook — set by panel.ts so quick-switch can update it
// ---------------------------------------------------------------------------

let ClaudeCodeSettingsPanel_refresh: (() => void) | undefined;

export function setRefreshHook(fn: () => void): void {
  ClaudeCodeSettingsPanel_refresh = fn;
}
