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

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('claude-code-presets.json'),
    filters: { 'JSON': ['json'] },
    title: 'Export Claude Code Presets',
  });
  if (!uri) { return; }

  const content = JSON.stringify(scrubbed, null, 2) + '\n';

  // Check if any placeholders were inserted
  const hasPlaceholders = content.includes(PLACEHOLDER);

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
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'JSON': ['json'] },
    title: 'Import Claude Code Presets',
  });
  if (!uris || uris.length === 0) { return; }

  let incoming: ProfileStore;
  try {
    const raw = await vscode.workspace.fs.readFile(uris[0]);
    incoming = JSON.parse(Buffer.from(raw).toString('utf8')) as ProfileStore;
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
