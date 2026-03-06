import * as vscode from 'vscode';
import { readProfileStore, writeProfileStore, generateId, ensureDefaults } from './profiles';
import { ProfileStore, ProviderProfile } from './types';
import { refreshStatusBar } from './statusBar';

// ---------------------------------------------------------------------------
// Credential patterns — real keys must never leave the machine
// ---------------------------------------------------------------------------

const CREDENTIAL_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /sk-or-[a-zA-Z0-9_-]{20,}/g,
  /sk-proj-[a-zA-Z0-9_-]{20,}/g,
  /sk-live-[a-zA-Z0-9_-]{20,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /ghp_[a-zA-Z0-9]{36,}/g,
  /gho_[a-zA-Z0-9]{36,}/g,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
  /xoxb-[a-zA-Z0-9-]+/g,
  /xoxp-[a-zA-Z0-9-]+/g,
];

const PLACEHOLDER = '<REPLACE_ME>';

const SAFE_VALUES = new Set([
  '', 'foobar', 'placeholder', 'dummy', 'local', 'Optional',
  'your-key-here', 'xxx', undefined,
]);

/** Scrub known credential patterns from a string value. */
function scrubValue(value: string | undefined): string | undefined {
  if (!value || SAFE_VALUES.has(value)) { return value; }
  let scrubbed = value;
  for (const pattern of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    scrubbed = scrubbed.replace(pattern, PLACEHOLDER);
  }
  // If it still looks like a real key (long alphanumeric string), replace it
  if (scrubbed === value && value.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(value)) {
    return PLACEHOLDER;
  }
  return scrubbed;
}

/** Deep-scrub a provider profile of all credential-like fields. */
function scrubProvider(provider: ProviderProfile): ProviderProfile {
  return {
    ...provider,
    anthropicApiKey: scrubValue(provider.anthropicApiKey),
    proxyApiKey: scrubValue(provider.proxyApiKey),
    proxyAuthToken: scrubValue(provider.proxyAuthToken),
    awsAuthRefresh: provider.awsAuthRefresh, // command, not a secret
  };
}

/** Scrub all credentials from a profile store for safe export. */
function scrubStore(store: ProfileStore): ProfileStore {
  return {
    ...store,
    providers: store.providers.map(scrubProvider),
  };
}

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

    incoming = JSON.parse(raw) as ProfileStore;
    if (!incoming.version || !incoming.providers || !incoming.presets) {
      throw new Error('Not a valid profile store');
    }
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
  const store = readProfileStore();
  const idMap = new Map<string, string>(); // old ID → new ID

  for (const provider of incoming.providers) {
    const newId = generateId();
    idMap.set(provider.id, newId);
    store.providers.push({ ...provider, id: newId });
  }

  for (const group of incoming.mcpGroups) {
    const newId = generateId();
    idMap.set(group.id, newId);
    store.mcpGroups.push({ ...group, id: newId });
  }

  for (const group of incoming.directoryGroups) {
    const newId = generateId();
    idMap.set(group.id, newId);
    store.directoryGroups.push({ ...group, id: newId });
  }

  for (const preset of incoming.presets) {
    const newId = generateId();
    store.presets.push({
      ...preset,
      id: newId,
      providerId: idMap.get(preset.providerId) ?? preset.providerId,
      mcpGroupIds: preset.mcpGroupIds.map(id => idMap.get(id) ?? id),
      directoryGroupIds: preset.directoryGroupIds.map(id => idMap.get(id) ?? id),
    });
  }

  writeProfileStore(store);
  refreshStatusBar();

  // Check for placeholder credentials that need replacing
  const placeholders = store.providers.filter(p =>
    p.anthropicApiKey === PLACEHOLDER ||
    p.proxyApiKey === PLACEHOLDER ||
    p.proxyAuthToken === PLACEHOLDER
  );
  if (placeholders.length > 0) {
    const names = placeholders.map(p => p.name).join(', ');
    vscode.window.showWarningMessage(
      `Imported successfully. These providers have placeholder credentials that need replacing: ${names}`
    );
  } else {
    vscode.window.showInformationMessage(
      `Imported ${incoming.presets.length} preset(s), ${incoming.providers.length} provider(s), ` +
      `${incoming.mcpGroups.length} MCP group(s), ${incoming.directoryGroups.length} directory group(s).`
    );
  }
}
