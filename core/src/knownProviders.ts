// Curated catalogue of well-known providers selectable from the unified
// provider dropdown in the provider drawer. The catalogue is the single
// source of truth for default URL, locked scheme/path, auth handling, and
// UI labelling — both the webview and the resolver read from it so a
// hand-edited profile store still resolves to the right env vars.

export type KnownProviderId =
  | 'bedrock'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'omlx'
  | 'vllm'
  | 'sglang'
  | 'litellm'
  | 'custom';

/** Credential modes the Authentication card chooser can offer. 'op' (1Password
 *  reference) is never listed in a catalog entry's `credentialModes` — it's
 *  appended by the UI for every non-empty `credentialModes` list, but only
 *  when the `op` CLI is actually available. */
export type CredentialMode = 'none' | 'apikey' | 'authtoken';

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
  /** Credential modes this provider's server actually validates, in display
   *  order — drives which Authentication cards are shown. Undefined means no
   *  Authentication section at all (Bedrock is AWS-native; Ollama's local
   *  server has no credential mechanism to configure). */
  credentialModes?: CredentialMode[];
  /** Which mode is pre-selected when this preset is first chosen. */
  defaultCredentialMode?: CredentialMode;
  /** Optional info-box copy shown above the Authentication cards, e.g.
   *  OpenRouter's "uses a Bearer token generated at openrouter.ai/keys". */
  credentialInfo?: string;
}

/** Anthropic direct API isn't a KNOWN_PROVIDERS catalog entry (it's the
 *  dropdown's first/default option, not a 3rd-party preset) but needs the
 *  same credential-mode shape so the webview can build its Authentication
 *  cards with one code path for every provider. */
export const ANTHROPIC_CREDENTIAL: Pick<KnownProvider, 'credentialModes' | 'defaultCredentialMode'> = {
  credentialModes: ['apikey'],
  defaultCredentialMode: 'apikey',
};

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
    credentialModes: ['authtoken'],
    defaultCredentialMode: 'authtoken',
    credentialInfo: 'OpenRouter uses a Bearer token generated at openrouter.ai/keys.',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    type: 'proxy',
    defaultUrl: 'http://localhost:11434',
    scheme: 'http',
    path: '',
    // Local Ollama has no credential mechanism at all — not even a "none"
    // card is shown; the Authentication section is hidden entirely.
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    type: 'proxy',
    defaultUrl: 'http://localhost:1234',
    scheme: 'http',
    path: '',
    // Optional "Require Authentication" toggle (LM Studio >= 0.4.0) validates
    // Authorization: Bearer <token> only — no x-api-key support.
    credentialModes: ['none', 'authtoken'],
    defaultCredentialMode: 'none',
  },
  {
    id: 'omlx',
    label: 'oMLX',
    type: 'proxy',
    defaultUrl: 'http://localhost:8000',
    scheme: 'http',
    path: '',
    // jundot/omlx natively accepts both x-api-key and Authorization: Bearer
    // (the latter added for Anthropic SDK compatibility) — the only local
    // proxy where both credential styles are genuinely valid.
    credentialModes: ['none', 'apikey', 'authtoken'],
    defaultCredentialMode: 'none',
  },
  {
    id: 'vllm',
    label: 'vLLM',
    type: 'proxy',
    defaultUrl: 'http://localhost:8000',
    scheme: 'http',
    path: '',
    // --api-key is validated as Authorization: Bearer <key> despite the flag name.
    credentialModes: ['none', 'authtoken'],
    defaultCredentialMode: 'none',
  },
  {
    id: 'sglang',
    label: 'SGLang',
    type: 'proxy',
    defaultUrl: 'http://localhost:30000',
    scheme: 'http',
    path: '',
    // --api-key is opt-in (off by default) and validated as
    // Authorization: Bearer <key> — same shape as vLLM.
    credentialModes: ['none', 'authtoken'],
    defaultCredentialMode: 'none',
  },
  {
    id: 'litellm',
    label: 'LiteLLM',
    type: 'proxy',
    defaultUrl: 'http://localhost:4000',
    scheme: 'http',
    path: '',
    // LITELLM_MASTER_KEY is validated as Authorization: Bearer <master-key>.
    credentialModes: ['none', 'authtoken'],
    defaultCredentialMode: 'none',
  },
  {
    id: 'custom',
    label: 'Other / Custom…',
    type: 'proxy',
    // Unknown target — offer every mode.
    credentialModes: ['none', 'apikey', 'authtoken'],
    defaultCredentialMode: 'none',
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
 *   lmstudio,  "http://mybox:1234"     → "http://mybox:1234"
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
