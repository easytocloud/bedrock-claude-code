import * as vscode from 'vscode';
import { ClaudeCodeSettingsPanel } from './panel';
import { getClaudeSettingsPath } from '@easytocloud/claude-personae-core';
import { createStatusBar, setSidebarRefreshHook } from './statusBar';
import { exportPresets, importPresets } from './importExport';
import { PresetsSidebarProvider, PRESETS_VIEW_ID } from './sidebar';

export function activate(context: vscode.ExtensionContext): void {
  // Status bar — preset quick-switcher and scope indicator
  createStatusBar(context);

  // Activity bar sidebar — compact preset switcher
  const sidebar = new PresetsSidebarProvider(context);
  setSidebarRefreshHook(() => sidebar.refresh());
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PRESETS_VIEW_ID, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => sidebar.refresh()),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bedrock-claude-code.openSettings', () => {
      ClaudeCodeSettingsPanel.createOrShow(context);
    }),

    vscode.commands.registerCommand('bedrock-claude-code.openSettingsFile', async () => {
      const settingsPath = getClaudeSettingsPath();
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(settingsPath));
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(
          `Could not open ${settingsPath}. Use "Open Claude Code Bedrock Settings" to create it first.`
        );
      }
    }),

    vscode.commands.registerCommand('bedrock-claude-code.exportPresets', exportPresets),
    vscode.commands.registerCommand('bedrock-claude-code.importPresets', importPresets),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
