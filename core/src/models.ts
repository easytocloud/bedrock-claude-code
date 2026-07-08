// ---------------------------------------------------------------------------
// Known Bedrock inference profile IDs (as of Feb 2026)
// Also used for Anthropic Direct API model selection.
// ---------------------------------------------------------------------------

export interface ModelEntry {
  /** Geo prefix: 'global' | 'us' | 'eu' | 'apac' | 'jp' | 'au' | '' (regional — always shown) */
  prefix: string;
  /** Full model identifier */
  id: string;
  /** Human-friendly label */
  label: string;
}

export const HAIKU_MODELS: ModelEntry[] = [
  { prefix: 'global', id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5 — Global' },
  { prefix: 'us',     id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',     label: 'Claude Haiku 4.5 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',     label: 'Claude Haiku 4.5 — EU Cross-Region' },
  { prefix: 'jp',     id: 'jp.anthropic.claude-haiku-4-5-20251001-v1:0',     label: 'Claude Haiku 4.5 — Japan Cross-Region' },
  { prefix: 'au',     id: 'au.anthropic.claude-haiku-4-5-20251001-v1:0',     label: 'Claude Haiku 4.5 — Australia Cross-Region' },
];

export const SONNET_MODELS: ModelEntry[] = [
  { prefix: 'global', id: 'global.anthropic.claude-sonnet-5',                label: 'Claude Sonnet 5 — Global' },
  { prefix: 'us',     id: 'us.anthropic.claude-sonnet-5',                    label: 'Claude Sonnet 5 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-sonnet-5',                    label: 'Claude Sonnet 5 — EU Cross-Region' },
];

export const OPUS_MODELS: ModelEntry[] = [
  { prefix: 'global', id: 'global.anthropic.claude-opus-4-8',                label: 'Claude Opus 4.8 — Global' },
  { prefix: 'us',     id: 'us.anthropic.claude-opus-4-8',                    label: 'Claude Opus 4.8 — US Cross-Region' },
  { prefix: 'eu',     id: 'eu.anthropic.claude-opus-4-8',                    label: 'Claude Opus 4.8 — EU Cross-Region' },
  { prefix: 'jp',     id: 'jp.anthropic.claude-opus-4-8',                    label: 'Claude Opus 4.8 — Japan Cross-Region' },
  { prefix: 'au',     id: 'au.anthropic.claude-opus-4-8',                    label: 'Claude Opus 4.8 — Australia Cross-Region' },
];

/** Default model IDs for Anthropic Direct API (no region prefix needed) */
export const ANTHROPIC_DEFAULTS = {
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-8',
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
  if (region.startsWith('ap-')) { return ['apac', 'jp', 'au', 'global', '']; }
  return ['global', ''];
}

/** Filter a model list to only those matching the region prefixes. */
export function filterModelsByRegion(models: ModelEntry[], region: string): ModelEntry[] {
  const prefixes = getRegionPrefixes(region);
  return models.filter(m => prefixes.includes(m.prefix));
}

/**
 * Model families whose Bedrock terms require sharing inference data with the
 * model provider (data-retention allowed_modes == ["provider_data_share"]):
 * prompts and completions leave the AWS boundary and are retained by the
 * provider (currently up to 30 days, for trust & safety). All other Bedrock
 * models keep data inside AWS.
 *
 * Curated list because allowed_modes is only queryable via the bedrock-mantle
 * API (Bedrock API key), not the SigV4 CLI used for model fetching.
 */
export const PROVIDER_DATA_SHARE_PATTERNS = ['fable', 'mythos'];

export function requiresProviderDataShare(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return PROVIDER_DATA_SHARE_PATTERNS.some(p => id.includes(p));
}

/** Environment variable keys managed by this extension. */
export const MANAGED_ENV_KEYS = new Set([
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_PROFILE',
  'AWS_REGION',
  'AWS_CONFIG_FILE',
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
  'DISABLE_AUTOUPDATER',
]);
