import * as vscode from 'vscode';
import { ClaudeCodeSettingsPanel } from './panel';
import { getClaudeSettingsPath } from './claudeSettings';

export function activate(context: vscode.ExtensionContext): void {
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
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
