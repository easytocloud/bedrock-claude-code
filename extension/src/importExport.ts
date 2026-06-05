import * as vscode from 'vscode';
import {
  readProfileStore,
  writeProfileStore,
  ensureDefaults,
  ProfileStore,
  scrubStore,
  PLACEHOLDER,
  parseIncomingStore,
  mergeIncomingStore,
  providersNeedingCredentials,
} from '@easytocloud/claude-personae-core';
import { refreshStatusBar } from './statusBar';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportPresets(): Promise<void> {
  const store = readProfileStore();
  const scrubbed = scrubStore(store);
  const content = JSON.stringify(scrubbed, null, 2) + '\n';
  const hasPlaceholders = content.includes(PLACEHOLDER);

  const dest = await vscode.window.showQuickPick(
    [
      { label: '$(file) Save to file', description: 'Save dialog (remote filesystem in SSH sessions)', value: 'file' as const },
      { label: '$(clippy) Copy to clipboard', description: 'Paste on any machine — works across local/remote', value: 'clipboard' as const },
    ],
    { placeHolder: 'Where to export?' }
  );
  if (!dest) { return; }

  if (dest.value === 'clipboard') {
    await vscode.env.clipboard.writeText(content);
    const msg = hasPlaceholders
      ? `Copied to clipboard. Credentials were replaced with ${PLACEHOLDER}.`
      : 'Copied to clipboard.';
    vscode.window.showInformationMessage(msg);
    return;
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('claude-code-presets.json'),
    filters: { 'JSON': ['json'] },
    title: 'Export Claude Code Presets',
  });
  if (!uri) { return; }

  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

  if (hasPlaceholders) {
    vscode.window.showWarningMessage(
      `Exported to ${uri.fsPath}. Credentials were replaced with ${PLACEHOLDER} — recipients must fill in their own.`
    );
  } else {
    vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export async function importPresets(): Promise<void> {
  const source = await vscode.window.showQuickPick(
    [
      { label: '$(file) Load from file', description: 'Open dialog (remote filesystem in SSH sessions)', value: 'file' as const },
      { label: '$(clippy) Paste from clipboard', description: 'Paste JSON copied from another machine', value: 'clipboard' as const },
    ],
    { placeHolder: 'Where to import from?' }
  );
  if (!source) { return; }

  let incoming: ProfileStore;
  try {
    let raw: string;
    if (source.value === 'clipboard') {
      raw = await vscode.env.clipboard.readText();
      if (!raw.trim()) { throw new Error('Clipboard is empty'); }
    } else {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] },
        title: 'Import Claude Code Presets',
      });
      if (!uris || uris.length === 0) { return; }
      raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    }

    incoming = parseIncomingStore(raw);
  } catch (err) {
    vscode.window.showErrorMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const mode = await vscode.window.showQuickPick(
    [
      { label: 'Merge', description: 'Add imported items alongside existing ones', value: 'merge' as const },
      { label: 'Replace', description: 'Replace all settings with imported file', value: 'replace' as const },
    ],
    { placeHolder: 'How should imported presets be combined with existing ones?' }
  );
  if (!mode) { return; }

  if (mode.value === 'replace') {
    const store = ensureDefaults(incoming);
    writeProfileStore(store);
    refreshStatusBar();
    vscode.window.showInformationMessage('Presets replaced from import.');
    return;
  }

  // Merge: add incoming items with fresh IDs to avoid collisions
  const store = mergeIncomingStore(readProfileStore(), incoming);
  writeProfileStore(store);
  refreshStatusBar();

  const placeholders = providersNeedingCredentials(store);
  if (placeholders.length > 0) {
    vscode.window.showWarningMessage(
      `Imported successfully. These providers have placeholder credentials that need replacing: ${placeholders.join(', ')}`
    );
  } else {
    vscode.window.showInformationMessage(
      `Imported ${incoming.presets.length} preset(s), ${incoming.providers.length} provider(s), ` +
      `${incoming.mcpGroups.length} MCP group(s), ${incoming.directoryGroups.length} directory group(s).`
    );
  }
}
