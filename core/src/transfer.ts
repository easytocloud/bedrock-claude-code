import { ProfileStore, ProviderProfile } from './types';
import { generateId } from './profiles';

// ---------------------------------------------------------------------------
// Credential scrubbing — real keys must never leave the machine on export.
// Shared by the VS Code export command and the CLI `export` command.
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

export const PLACEHOLDER = '<REPLACE_ME>';

const SAFE_VALUES = new Set<string | undefined>([
  '', 'foobar', 'placeholder', 'dummy', 'local', 'Optional',
  'your-key-here', 'xxx', undefined,
]);

/** Scrub known credential patterns from a string value. */
export function scrubValue(value: string | undefined): string | undefined {
  if (!value || SAFE_VALUES.has(value)) { return value; }
  // op:// references are 1Password pointers, not secrets — keep them.
  if (value.startsWith('op://')) { return value; }
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
    proxyCredential: scrubValue(provider.proxyCredential),
    proxyApiKey: scrubValue(provider.proxyApiKey),
    proxyAuthToken: scrubValue(provider.proxyAuthToken),
    awsAuthRefresh: provider.awsAuthRefresh, // command, not a secret
  };
}

/** Scrub all credentials from a profile store for safe export. */
export function scrubStore(store: ProfileStore): ProfileStore {
  return {
    ...store,
    providers: store.providers.map(scrubProvider),
  };
}

/** Names of providers whose credentials are placeholders that need replacing. */
export function providersNeedingCredentials(store: ProfileStore): string[] {
  return store.providers
    .filter(p =>
      p.anthropicApiKey === PLACEHOLDER ||
      p.proxyCredential === PLACEHOLDER ||
      p.proxyApiKey === PLACEHOLDER ||
      p.proxyAuthToken === PLACEHOLDER
    )
    .map(p => p.name);
}

// ---------------------------------------------------------------------------
// Import — parse + validate + merge. Shared by extension and CLI.
// ---------------------------------------------------------------------------

/** Parse and validate raw JSON into a ProfileStore. Throws on malformed input. */
export function parseIncomingStore(raw: string): ProfileStore {
  const incoming = JSON.parse(raw) as ProfileStore;
  if (!incoming.version || !incoming.providers || !incoming.presets) {
    throw new Error('Not a valid profile store');
  }
  return incoming;
}

/**
 * Merge an incoming store into a base store, re-generating all IDs to avoid
 * collisions and remapping preset → provider/group references. Mutates and
 * returns `base`.
 */
export function mergeIncomingStore(base: ProfileStore, incoming: ProfileStore): ProfileStore {
  const idMap = new Map<string, string>(); // old ID → new ID

  for (const provider of incoming.providers) {
    const newId = generateId();
    idMap.set(provider.id, newId);
    base.providers.push({ ...provider, id: newId });
  }

  for (const group of incoming.mcpGroups) {
    const newId = generateId();
    idMap.set(group.id, newId);
    base.mcpGroups.push({ ...group, id: newId });
  }

  for (const group of incoming.directoryGroups) {
    const newId = generateId();
    idMap.set(group.id, newId);
    base.directoryGroups.push({ ...group, id: newId });
  }

  for (const preset of incoming.presets) {
    const newId = generateId();
    base.presets.push({
      ...preset,
      id: newId,
      providerId: idMap.get(preset.providerId) ?? preset.providerId,
      mcpGroupIds: preset.mcpGroupIds.map(id => idMap.get(id) ?? id),
      directoryGroupIds: preset.directoryGroupIds.map(id => idMap.get(id) ?? id),
    });
  }

  return base;
}
