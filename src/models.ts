// ---------------------------------------------------------------------------
// Known Bedrock inference profile IDs (as of Feb 2026)
// Also used for Anthropic Direct API model selection.
// ---------------------------------------------------------------------------

export interface ModelEntry {
  /** Region prefix: 'global' | 'us' | 'eu' | 'ap' | '' (regional — always shown) */
  prefix: string;
  /** Full model identifier */
  id: string;
  /** Human-friendly label */
  label: string;
}

export const HAIKU_MODELS: ModelEntry[] = [
  { prefix: 'us',     id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',  label: 'Claude Haiku 4.5 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',  label: 'Claude Haiku 4.5 — EU Cross-Region' },
  { prefix: 'ap',     id: 'ap.anthropic.claude-haiku-4-5-20251001-v1:0',  label: 'Claude Haiku 4.5 — AP Cross-Region' },
  { prefix: '',       id: 'anthropic.claude-3-5-haiku-20241022-v1:0',      label: 'Claude Haiku 3.5 — Regional' },
  { prefix: '',       id: 'anthropic.claude-3-haiku-20240307-v1:0',        label: 'Claude Haiku 3 — Regional' },
];

export const SONNET_MODELS: ModelEntry[] = [
  { prefix: 'global', id: 'global.anthropic.claude-sonnet-4-6',             label: 'Claude Sonnet 4.6 — Global' },
  { prefix: 'us',     id: 'us.anthropic.claude-sonnet-4-6',                 label: 'Claude Sonnet 4.6 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-sonnet-4-6',                 label: 'Claude Sonnet 4.6 — EU Cross-Region' },
  { prefix: 'us',     id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',   label: 'Claude Sonnet 4.5 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0',   label: 'Claude Sonnet 4.5 — EU Cross-Region' },
  { prefix: '',       id: 'anthropic.claude-sonnet-4-20250514-v1:0',        label: 'Claude Sonnet 4 — Regional' },
  { prefix: '',       id: 'anthropic.claude-3-7-sonnet-20250219-v1:0',      label: 'Claude Sonnet 3.7 — Regional' },
];

export const OPUS_MODELS: ModelEntry[] = [
  { prefix: 'us',     id: 'us.anthropic.claude-opus-4-6-v1',               label: 'Claude Opus 4.6 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-opus-4-6-v1',               label: 'Claude Opus 4.6 — EU Cross-Region' },
  { prefix: '',       id: 'anthropic.claude-opus-4-20250514-v1:0',          label: 'Claude Opus 4 — Regional' },
  { prefix: '',       id: 'anthropic.claude-opus-4-5-20251101-v1:0',        label: 'Claude Opus 4.5 — Regional' },
];

/** Default model IDs for Anthropic Direct API (no region prefix needed) */
export const ANTHROPIC_DEFAULTS = {
  sonnet: 'claude-sonnet-4-6-20250514',
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-6-20250514',
};

export const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
  'ap-south-1', 'sa-east-1',
];

/**
 * Returns the model-ID prefixes that should be visible for a given AWS region.
 * Regional models (prefix '') are always included.
 */
export function getRegionPrefixes(region: string): string[] {
  if (region.startsWith('us-')) { return ['us', 'global', '']; }
  if (region.startsWith('eu-')) { return ['eu', 'global', '']; }
  if (region.startsWith('ap-')) { return ['ap', 'global', '']; }
  return ['global', ''];
}

/** Filter a model list to only those matching the region prefixes. */
export function filterModelsByRegion(models: ModelEntry[], region: string): ModelEntry[] {
  const prefixes = getRegionPrefixes(region);
  return models.filter(m => prefixes.includes(m.prefix));
}

/** Environment variable keys managed by this extension. */
export const MANAGED_ENV_KEYS = new Set([
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_PROFILE',
  'AWS_REGION',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_MODEL',                       // old name — cleared on save
  'ANTHROPIC_SMALL_FAST_MODEL',            // deprecated — cleared on save
  'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION', // cleared on save
  'DISABLE_PROMPT_CACHING',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
]);
