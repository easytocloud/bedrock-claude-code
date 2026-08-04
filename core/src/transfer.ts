import { ProfileStore, ProviderProfile } from './types';

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
  const scrubbed: ProfileStore = {
    ...store,
    providers: store.providers.map(scrubProvider),
  };
  // Machine-local state: which MCP server names we wrote into this machine's
  // ~/.claude.json. Meaningless (and misleading) on another machine.
  delete scrubbed.mcpOwnership;
  return scrubbed;
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
  // Older exports and hand-written stores can omit the group arrays entirely.
  // Default them so consumers can iterate without guarding every access —
  // previously `mergeIncomingStore` threw a raw TypeError on such a file.
  incoming.mcpGroups ??= [];
  incoming.directoryGroups ??= [];
  incoming.presets = incoming.presets.map(preset => ({
    ...preset,
    mcpGroupIds: preset.mcpGroupIds ?? [],
    directoryGroupIds: preset.directoryGroupIds ?? [],
  }));
  return incoming;
}

/** Insert `incoming` or overwrite the entry with the same ID. */
function upsertById<T extends { id: string }>(list: T[], incoming: T): 'added' | 'updated' {
  const idx = list.findIndex(e => e.id === incoming.id);
  if (idx >= 0) { list[idx] = incoming; return 'updated'; }
  list.push(incoming);
  return 'added';
}

/**
 * Keep the existing credential when the incoming one is a scrubbed
 * placeholder (or absent) — a merge must never destroy working credentials.
 * Real incoming values (including op:// references, which survive scrubbing)
 * do overwrite.
 */
function preserveCredential(
  incoming: string | undefined,
  existing: string | undefined
): string | undefined {
  if (incoming === PLACEHOLDER || incoming === undefined || incoming === '') {
    return existing ?? incoming;
  }
  return incoming;
}

export interface MergeResult {
  added: number;
  updated: number;
}

// ---------------------------------------------------------------------------
// Referential integrity
// ---------------------------------------------------------------------------

/** A preset reference that points at something the store doesn't contain. */
export interface BrokenReference {
  presetId: string;
  presetName: string;
  kind: 'provider' | 'mcpGroup' | 'directoryGroup';
  missingId: string;
}

/**
 * Find preset references that don't resolve against the store.
 *
 * A preset can outlive the things it points at: an import may bring presets
 * without their provider, or a `--mode replace` may write a store that was
 * hand-edited. `resolvePreset` guards with `if (provider)` and produces a
 * config with no backend rather than throwing, so a broken reference is
 * otherwise invisible until Claude Code quietly uses the wrong backend.
 */
export function findBrokenReferences(store: ProfileStore): BrokenReference[] {
  // Tolerate stores missing these arrays: `validate` reads from disk, where a
  // hand-edited or older file may legitimately omit them. Reporting broken
  // references matters more than insisting on a complete shape.
  const providerIds = new Set((store.providers ?? []).map(p => p.id));
  const mcpGroupIds = new Set((store.mcpGroups ?? []).map(g => g.id));
  const dirGroupIds = new Set((store.directoryGroups ?? []).map(g => g.id));
  const broken: BrokenReference[] = [];

  for (const preset of store.presets ?? []) {
    const at = { presetId: preset.id, presetName: preset.name };
    if (preset.providerId && !providerIds.has(preset.providerId)) {
      broken.push({ ...at, kind: 'provider', missingId: preset.providerId });
    }
    for (const id of preset.mcpGroupIds ?? []) {
      if (!mcpGroupIds.has(id)) {
        broken.push({ ...at, kind: 'mcpGroup', missingId: id });
      }
    }
    for (const id of preset.directoryGroupIds ?? []) {
      if (!dirGroupIds.has(id)) {
        broken.push({ ...at, kind: 'directoryGroup', missingId: id });
      }
    }
  }
  return broken;
}

/** Human-readable one-liner per broken reference, for CLI output and dialogs. */
export function describeBrokenReference(ref: BrokenReference): string {
  const label = {
    provider: 'provider',
    mcpGroup: 'MCP server group',
    directoryGroup: 'directory group',
  }[ref.kind];
  return `preset "${ref.presetName}" references a ${label} that no longer exists (${ref.missingId})`;
}

/**
 * Merge an incoming store into a base store with upsert semantics: entries
 * whose UUID already exists locally are overwritten in place (same lineage —
 * an update from the original source); unknown UUIDs are added as-is. IDs are
 * never regenerated, so re-importing the same export is idempotent and
 * cross-references stay intact. Existing entries absent from the import are
 * left alone (merge never deletes — use replace for that). Scope assignments
 * and mcpOwnership are machine-local and not merged. Mutates and returns
 * `base`; per-kind counts are written to `result` when provided.
 */
export function mergeIncomingStore(
  base: ProfileStore,
  incoming: ProfileStore,
  result?: MergeResult
): ProfileStore {
  const tally: MergeResult = { added: 0, updated: 0 };
  const count = (outcome: 'added' | 'updated') => { tally[outcome]++; };

  for (const provider of incoming.providers) {
    const existing = base.providers.find(p => p.id === provider.id);
    count(upsertById(base.providers, {
      ...provider,
      anthropicApiKey: preserveCredential(provider.anthropicApiKey, existing?.anthropicApiKey),
      proxyCredential: preserveCredential(provider.proxyCredential, existing?.proxyCredential),
      proxyApiKey: preserveCredential(provider.proxyApiKey, existing?.proxyApiKey),
      proxyAuthToken: preserveCredential(provider.proxyAuthToken, existing?.proxyAuthToken),
    }));
  }

  for (const group of incoming.mcpGroups) {
    count(upsertById(base.mcpGroups, group));
  }

  for (const group of incoming.directoryGroups) {
    count(upsertById(base.directoryGroups, group));
  }

  for (const preset of incoming.presets) {
    count(upsertById(base.presets, preset));
  }

  if (result) { Object.assign(result, tally); }
  return base;
}
