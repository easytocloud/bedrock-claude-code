import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { ProfileStore, ProviderProfile, Preset } from './types';
import { ANTHROPIC_DEFAULTS } from './models';

/** Well-known IDs for the built-in Default preset and provider. */
export const DEFAULT_PROVIDER_ID = '__default_anthropic__';
export const DEFAULT_PRESET_ID = '__default__';

/** Returns the path to ~/.claude/coder-profiles.json */
export function getProfileStorePath(): string {
  return path.join(os.homedir(), '.claude', 'coder-profiles.json');
}

/** Generates a UUID v4 identifier. */
export function generateId(): string {
  return crypto.randomUUID();
}

/** The built-in Anthropic provider (always present). */
function defaultProvider(existing?: ProviderProfile): ProviderProfile {
  return {
    id: DEFAULT_PROVIDER_ID,
    name: 'Anthropic',
    type: 'anthropic',
    // Preserve user's API key if they've set one
    anthropicApiKey: existing?.anthropicApiKey ?? undefined,
    primaryModel: ANTHROPIC_DEFAULTS.sonnet,
    smallFastModel: ANTHROPIC_DEFAULTS.haiku,
    opusModel: ANTHROPIC_DEFAULTS.opus,
  };
}

/** The built-in Default preset (always present). */
function defaultPreset(): Preset {
  return {
    id: DEFAULT_PRESET_ID,
    name: 'Default',
    providerId: DEFAULT_PROVIDER_ID,
    mcpGroupIds: [],
    directoryGroupIds: [],
  };
}

/**
 * Ensures the store always contains the built-in Default provider and preset.
 * Preserves the user's API key on the default provider if already set.
 */
export function ensureDefaults(store: ProfileStore): ProfileStore {
  // Ensure default provider exists (preserve API key)
  const existingProvider = store.providers.find(p => p.id === DEFAULT_PROVIDER_ID);
  if (existingProvider) {
    // Reset immutable fields but keep API key
    existingProvider.name = 'Anthropic';
    existingProvider.type = 'anthropic';
    existingProvider.primaryModel = ANTHROPIC_DEFAULTS.sonnet;
    existingProvider.smallFastModel = ANTHROPIC_DEFAULTS.haiku;
    existingProvider.opusModel = ANTHROPIC_DEFAULTS.opus;
  } else {
    store.providers.unshift(defaultProvider());
  }

  // Ensure default preset exists
  const existingPreset = store.presets.find(p => p.id === DEFAULT_PRESET_ID);
  if (existingPreset) {
    existingPreset.name = 'Default';
    existingPreset.providerId = DEFAULT_PROVIDER_ID;
  } else {
    store.presets.unshift(defaultPreset());
  }

  return store;
}

/** Returns a default empty ProfileStore with built-in defaults. */
export function createEmptyStore(): ProfileStore {
  return ensureDefaults({
    version: 1,
    providers: [],
    mcpGroups: [],
    directoryGroups: [],
    presets: [],
    globalScope: { mode: 'preset', presetId: DEFAULT_PRESET_ID },
    workspaceScopes: {},
  });
}

/** Reads and parses ~/.claude/coder-profiles.json. Returns empty store if missing or unreadable. */
export function readProfileStore(): ProfileStore {
  const filePath = getProfileStorePath();

  if (!fs.existsSync(filePath)) {
    return createEmptyStore();
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const store = parsed as ProfileStore;
      // Migrate v0.2.0 projectScopes → workspaceScopes
      const obj = parsed as Record<string, unknown>;
      if (obj['projectScopes'] && !store.workspaceScopes) {
        store.workspaceScopes = obj['projectScopes'] as Record<string, import('./types').ScopeAssignment>;
        delete obj['projectScopes'];
      }
      if (!store.workspaceScopes) {
        store.workspaceScopes = {};
      }
      if (store.version === 1) {
        return ensureDefaults(store);
      }
    }
    return createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}

/** Writes the profile store to ~/.claude/coder-profiles.json, creating the directory if needed. */
export function writeProfileStore(store: ProfileStore): void {
  const filePath = getProfileStorePath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + '\n', 'utf8');
}
