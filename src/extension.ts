import * as vscode from 'vscode';
import { ClaudeCodeSettingsPanel } from './panel';
import { getClaudeSettingsPath } from './claudeSettings';
import { createStatusBar } from './statusBar';
import { exportPresets, importPresets } from './importExport';

export function activate(context: vscode.ExtensionContext): void {
  // Status bar — preset quick-switcher and scope indicator
  createStatusBar(context);

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
