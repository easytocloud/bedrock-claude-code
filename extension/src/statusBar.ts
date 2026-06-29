import * as vscode from 'vscode';
import { readProfileStore, writeProfileStore } from '@easytocloud/claude-personae-core';
import { applyAllScopes } from '@easytocloud/claude-personae-core';
import { ensureOnboardingComplete } from '@easytocloud/claude-personae-core';
import { ScopeAssignment } from '@easytocloud/claude-personae-core';

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

  // Status bar shows the most relevant scope
  if (wsScope && wsScope.mode === 'preset' && wsScope.presetId) {
    // Workspace has its own preset
    const name = presetLabel(wsScope, store.presets);
    statusBarItem.text = `$(sparkle) ${name}`;
    statusBarItem.tooltip = `Global: ${globalPresetName}\nVS Code Workspace: ${name}\n\nClick to switch presets`;
  } else if (wsScope && wsScope.mode === 'manual') {
    statusBarItem.text = `$(sparkle) Manual`;
    statusBarItem.tooltip = `Global: ${globalPresetName}\nVS Code Workspace: Manual\n\nClick to switch presets`;
  } else if (wsScope && wsScope.mode === 'inherit') {
    // Workspace explicitly inherits — show link icon to indicate delegation
    statusBarItem.text = `$(link) ${globalPresetName}`;
    statusBarItem.tooltip = `Global: ${globalPresetName}\nVS Code Workspace: Inherited from Global\n\nClick to override for this VS Code Workspace`;
  } else {
    // No workspace scope configured — show global with hollow indicator
    statusBarItem.text = workspaceRoot
      ? `$(sparkle) ${globalPresetName}`
      : `$(sparkle) ${globalPresetName}`;
    statusBarItem.tooltip = workspaceRoot
      ? `Global: ${globalPresetName}\nVS Code Workspace: Not configured — click to set`
      : `Global: ${globalPresetName}\n\nClick to switch presets`;
  }

  statusBarItem.show();
}

// ---------------------------------------------------------------------------
// Quick-switch via quick-pick
// ---------------------------------------------------------------------------

interface ScopeQuickPickItem extends vscode.QuickPickItem {
  scope?: 'global' | 'workspace';
  mode?: 'preset' | 'manual' | 'inherit' | 'gateway';
  presetId?: string;
}

async function quickSwitch(): Promise<void> {
  const store = readProfileStore();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const wsName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'VS Code Workspace';
  const wsScope = workspaceRoot ? store.workspaceScopes[workspaceRoot] : undefined;

  // Workspace has an explicit preset or is manual — global is not the active concern
  const wsIsExplicit = wsScope?.mode === 'preset' || wsScope?.mode === 'manual';

  const items: ScopeQuickPickItem[] = [];

  // ── Workspace section first (only if a workspace is open) ──
  if (workspaceRoot) {
    items.push({ label: `VS Code Workspace: ${wsName}`, kind: vscode.QuickPickItemKind.Separator });

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
        description: provider ? `${provider.type} · ${provider.name}` : '',
        scope: 'workspace',
        mode: 'preset',
        presetId: preset.id,
      });
    }

    items.push({
      label: `${wsScope?.mode === 'manual' ? '$(check) ' : '     '}Manual`,
      description: 'Manage VS Code Workspace config files yourself',
      scope: 'workspace',
      mode: 'manual',
    });
  }

  // ── Global section ──
  // When workspace has its own preset/manual, collapse to a single gateway item.
  // When workspace is inherit/unconfigured, show all global options (user is thinking globally).
  if (wsIsExplicit) {
    items.push({ label: 'Global Scope', kind: vscode.QuickPickItemKind.Separator });
    items.push({
      label: '$(globe) Change Global Scope…',
      description: 'Affects all workspaces set to Inherit — opens a second picker',
      scope: 'global',
      mode: 'gateway',
    });
  } else {
    items.push({ label: 'Global Scope — affects all inherited workspaces', kind: vscode.QuickPickItemKind.Separator });

    for (const preset of store.presets) {
      const isCurrent = store.globalScope.mode === 'preset' && store.globalScope.presetId === preset.id;
      const provider = store.providers.find(p => p.id === preset.providerId);
      items.push({
        label: `${isCurrent ? '$(check) ' : '     '}${preset.name}`,
        description: provider ? `${provider.type} · ${provider.name}` : '',
        scope: 'global',
        mode: 'preset',
        presetId: preset.id,
      });
    }

    items.push({
      label: `${store.globalScope.mode === 'manual' ? '$(check) ' : '     '}Manual`,
      description: 'Manage global config files yourself',
      scope: 'global',
      mode: 'manual',
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: workspaceRoot
      ? `Switch preset — VS Code Workspace (${wsName}) or Global`
      : 'Switch preset — Global scope',
    matchOnDescription: true,
  });

  if (!pick || !pick.scope || !pick.mode) { return; }

  // Gateway item: open a second quick-pick for global scope
  if (pick.mode === 'gateway') {
    await quickSwitchGlobal(store, workspaceRoot);
    return;
  }

  if (pick.scope === 'global') {
    await applyGlobalSwitch(store, pick, workspaceRoot);
    return;
  }

  // Workspace switch — no confirmation needed
  if (!workspaceRoot) { return; }
  const newAssignment: ScopeAssignment = pick.mode === 'preset'
    ? { mode: 'preset', presetId: pick.presetId }
    : { mode: pick.mode as 'manual' | 'inherit' };

  store.workspaceScopes[workspaceRoot] = newAssignment;
  writeProfileStore(store);
  ensureOnboardingComplete();
  applyAllScopes(store, workspaceRoot);
  refreshStatusBar();
  if (ClaudeCodeSettingsPanel_refresh) { ClaudeCodeSettingsPanel_refresh(); }

  const presetName = pick.mode === 'preset'
    ? store.presets.find(p => p.id === pick.presetId)?.name ?? 'Unknown'
    : pick.mode === 'inherit' ? 'Inherit from Global' : 'Manual';
  vscode.window.showInformationMessage(`VS Code Workspace preset set to: ${presetName}`);
}

async function quickSwitchGlobal(
  store: ReturnType<typeof readProfileStore>,
  workspaceRoot: string | undefined
): Promise<void> {
  const globalItems: ScopeQuickPickItem[] = [];

  globalItems.push({ label: 'Global Scope — affects all inherited workspaces', kind: vscode.QuickPickItemKind.Separator });

  for (const preset of store.presets) {
    const isCurrent = store.globalScope.mode === 'preset' && store.globalScope.presetId === preset.id;
    const provider = store.providers.find(p => p.id === preset.providerId);
    globalItems.push({
      label: `${isCurrent ? '$(check) ' : '     '}${preset.name}`,
      description: provider ? `${provider.type} · ${provider.name}` : '',
      scope: 'global',
      mode: 'preset',
      presetId: preset.id,
    });
  }

  globalItems.push({
    label: `${store.globalScope.mode === 'manual' ? '$(check) ' : '     '}Manual`,
    description: 'Manage global config files yourself',
    scope: 'global',
    mode: 'manual',
  });

  const pick = await vscode.window.showQuickPick(globalItems, {
    placeHolder: 'Change Global Scope — affects all workspaces set to Inherit',
    matchOnDescription: true,
  });

  if (!pick || !pick.scope || !pick.mode) { return; }
  await applyGlobalSwitch(store, pick, workspaceRoot);
}

async function applyGlobalSwitch(
  store: ReturnType<typeof readProfileStore>,
  pick: ScopeQuickPickItem,
  workspaceRoot: string | undefined
): Promise<void> {
  const presetName = pick.mode === 'preset'
    ? store.presets.find(p => p.id === pick.presetId)?.name ?? 'Unknown'
    : 'Manual';

  const confirm = await vscode.window.showWarningMessage(
    `Change global preset to "${presetName}"? This affects all workspaces set to Inherit.`,
    { modal: true },
    'Change'
  );
  if (confirm !== 'Change') { return; }

  const newAssignment: ScopeAssignment = pick.mode === 'preset'
    ? { mode: 'preset', presetId: pick.presetId }
    : { mode: 'manual' };

  store.globalScope = newAssignment;
  writeProfileStore(store);
  ensureOnboardingComplete();
  applyAllScopes(store, workspaceRoot);
  refreshStatusBar();
  if (ClaudeCodeSettingsPanel_refresh) { ClaudeCodeSettingsPanel_refresh(); }

  vscode.window.showInformationMessage(`Global preset set to: ${presetName}`);
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

// ---------------------------------------------------------------------------
// Panel refresh hook — set by panel.ts so quick-switch can update it
// ---------------------------------------------------------------------------

let ClaudeCodeSettingsPanel_refresh: (() => void) | undefined;

export function setRefreshHook(fn: () => void): void {
  ClaudeCodeSettingsPanel_refresh = fn;
}
