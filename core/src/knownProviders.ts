// Curated catalogue of well-known providers selectable from the "3rd party"
// dropdown in the provider drawer. The catalogue is the single source of truth
// for default URL, locked scheme/path, auth handling, and UI labelling — both
// the webview and the resolver read from it so a hand-edited profile store
// still resolves to the right env vars.

export type KnownProviderId =
  | 'bedrock'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'omlx'
  | 'vllm'
  | 'litellm'
  | 'custom';

export interface KnownProvider {
  id: KnownProviderId;
  label: string;
  type: 'bedrock' | 'proxy';
  // Pre-filled into the URL field when the user picks this preset.
  defaultUrl?: string;
  // Locked parts of the URL — host and port stay editable; scheme + path
  // snap back on blur via normalizeKnownUrl().
  scheme?: 'http' | 'https';
  path?: string;
  // Auth mode written to settings.json. 'none' means no credential field is
  // shown in the UI; resolver writes a placeholder ANTHROPIC_AUTH_TOKEN so
  // Claude Code does not fall back to its OAuth flow.
  authMode?: 'apikey' | 'authtoken' | 'none';
  // UI label for the credential field. Deliberately user-facing terminology
  // (e.g. "OpenRouter API key") — never references AUTH_TOKEN or Bearer.
  credentialLabel?: string;
  // Whether the credential is mandatory for a working setup.
  credentialRequired?: boolean;
}

export const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    type: 'bedrock',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    type: 'proxy',
    defaultUrl: 'https://openrouter.ai/api',
    scheme: 'https',
    path: '/api',
    authMode: 'authtoken',
    credentialLabel: 'OpenRouter API key',
    credentialRequired: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    type: 'proxy',
    defaultUrl: 'http://localhost:11434',
    scheme: 'http',
    path: '',
    authMode: 'none',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    type: 'proxy',
    defaultUrl: 'http://localhost:1234/v1',
    scheme: 'http',
    path: '/v1',
    authMode: 'none',
  },
  {
    id: 'omlx',
    label: 'oMLX',
    type: 'proxy',
    defaultUrl: 'http://localhost:8000',
    scheme: 'http',
    path: '',
    authMode: 'authtoken',
    credentialLabel: 'oMLX API key (optional)',
    credentialRequired: false,
  },
  {
    id: 'vllm',
    label: 'vLLM',
    type: 'proxy',
    defaultUrl: 'http://localhost:8000/v1',
    scheme: 'http',
    path: '/v1',
    authMode: 'authtoken',
    credentialLabel: 'API key (optional)',
    credentialRequired: false,
  },
  {
    id: 'litellm',
    label: 'LiteLLM',
    type: 'proxy',
    defaultUrl: 'http://localhost:4000',
    scheme: 'http',
    path: '',
    authMode: 'authtoken',
    credentialLabel: 'API key (optional)',
    credentialRequired: false,
  },
  {
    id: 'custom',
    label: 'Other / Custom…',
    type: 'proxy',
  },
];

export function knownProvider(id: string | undefined): KnownProvider | undefined {
  if (!id) { return undefined; }
  return KNOWN_PROVIDERS.find(p => p.id === id);
}

/**
 * Coerce a user-typed URL to the known preset's scheme + path while keeping
 * the host and port the user entered. Lets users point Ollama/LM Studio at
 * another machine or non-default port without breaking the path contract.
 *
 * Examples:
 *   openrouter, "openrouter.ai/v1"     → "https://openrouter.ai/api"
 *   ollama,    "192.168.1.50:11434"    → "http://192.168.1.50:11434"
 *   lmstudio,  "http://mybox:1234"     → "http://mybox:1234/v1"
 *   custom,    anything                → returned unchanged
 */
export function normalizeKnownUrl(p: KnownProvider, raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) { return p.defaultUrl ?? ''; }
  // Custom: don't touch the URL.
  if (p.id === 'custom' || !p.scheme) { return trimmed; }

  // Strip any scheme the user typed; we'll re-apply the locked one.
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  // Drop trailing slashes so we don't double-append the path.
  const noTrailingSlash = withoutScheme.replace(/\/+$/, '');
  // Split host[:port] from any path the user appended; we discard the path.
  const slashIdx = noTrailingSlash.indexOf('/');
  const hostPort = slashIdx === -1 ? noTrailingSlash : noTrailingSlash.slice(0, slashIdx);
  if (!hostPort) { return p.defaultUrl ?? ''; }

  return `${p.scheme}://${hostPort}${p.path ?? ''}`;
}
