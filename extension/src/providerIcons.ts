import { ProviderProfile } from '@easytocloud/claude-personae-core';

// ---------------------------------------------------------------------------
// Provider brand tiles — shared by the sidebar view and the main panel.
// The browser-side equivalents live in media/sidebar.js (consumes ChipSpec
// as data) and media/webview.js (mirrors inferProxyFlavor / the tile map,
// same pattern as the other layout.ts ↔ webview.js render helpers).
// ---------------------------------------------------------------------------

export interface ChipSpec {
  /** Stable id used for CSS classes (flavor-<id>) in the panel */
  flavor: string;
  /** SVG filename in media/provider-icons/ — falls back to the monogram label */
  icon?: string;
  label: string;
  bg: string;
  fg: string;
}

export type ProxyFlavor = NonNullable<ProviderProfile['proxyPreset']>;

/**
 * Work out which known provider a proxy really is. `proxyPreset` is only set
 * on records created since v0.3.21 and stays 'custom' when the user picked
 * Custom despite pointing at a known service — so fall back to recognizable
 * URLs, default ports, and finally the provider/preset names.
 */
export function inferProxyFlavor(provider: ProviderProfile, presetName?: string): ProxyFlavor {
  if (provider.proxyPreset && provider.proxyPreset !== 'custom') {
    return provider.proxyPreset;
  }

  const url = (provider.proxyBaseUrl ?? '').toLowerCase();
  if (url.includes('openrouter.ai')) { return 'openrouter'; }
  if (url.includes('bedrock') || url.includes('amazonaws.com')) { return 'bedrock'; }
  if (/:11434(?:\/|$)/.test(url)) { return 'ollama'; }   // Ollama default port
  if (/:1234(?:\/|$)/.test(url)) { return 'lmstudio'; }  // LM Studio default port
  if (/:8000(?:\/|$)/.test(url)) { return 'vllm'; }      // vLLM default port (also oMLX's — ambiguous, vLLM wins)
  if (/:30000(?:\/|$)/.test(url)) { return 'sglang'; }   // SGLang default port
  if (/:4000(?:\/|$)/.test(url)) { return 'litellm'; }   // LiteLLM default port

  const names = `${provider.name} ${presetName ?? ''}`.toLowerCase();
  if (names.includes('openrouter')) { return 'openrouter'; }
  if (names.includes('sglang')) { return 'sglang'; }
  if (names.includes('vllm')) { return 'vllm'; }
  if (names.includes('ollama')) { return 'ollama'; }
  if (names.includes('lm studio') || names.includes('lmstudio')) { return 'lmstudio'; }
  if (names.includes('litellm')) { return 'litellm'; }
  if (names.includes('omlx')) { return 'omlx'; }
  if (names.includes('bedrock')) { return 'bedrock'; }

  return 'custom';
}

const CHIPS: Record<string, ChipSpec> = {
  unknown: { flavor: 'unknown', label: '?', bg: '#6B7280', fg: '#ffffff' },
  anthropic: { flavor: 'anthropic', icon: 'anthropic.svg', label: 'A', bg: '#D97757', fg: '#ffffff' },
  bedrock: {
    // AWS Machine Learning category gradient behind the official Bedrock glyph
    flavor: 'bedrock',
    icon: 'bedrock.svg',
    label: '✦',
    bg: 'linear-gradient(135deg, #56C0A7 0%, #055F4E 100%)',
    fg: '#ffffff',
  },
  openrouter: { flavor: 'openrouter', icon: 'openrouter.svg', label: 'OR', bg: '#101828', fg: '#C8FF00' },
  ollama: { flavor: 'ollama', icon: 'ollama.svg', label: 'OL', bg: '#F4F4F5', fg: '#18181B' },
  lmstudio: { flavor: 'lmstudio', icon: 'lmstudio.svg', label: 'LM', bg: '#4F46E5', fg: '#ffffff' },
  omlx: { flavor: 'omlx', icon: 'omlx.svg', label: 'MX', bg: '#0EA5E9', fg: '#ffffff' },
  vllm: { flavor: 'vllm', icon: 'vllm.svg', label: 'VL', bg: '#334155', fg: '#ffffff' },
  // SGLang's icon (raster — their source SVG is a flattened design-tool
  // export with duplicate/off-canvas copies and an embedded raster glyph,
  // too fragile to hand-edit reliably) is already colored brand red-orange
  // on a light fill — a dark neutral backdrop, not another color, so the
  // mark reads cleanly.
  sglang: { flavor: 'sglang', icon: 'sglang.png', label: 'SG', bg: '#1E1B1A', fg: '#ffffff' },
  // LiteLLM's mark is their bullet-train icon (raster — no vector source
  // available) in white/blue/orange; a dark neutral backdrop lets it read
  // clearly without fighting a colored chip.
  litellm: { flavor: 'litellm', icon: 'litellm.png', label: 'LL', bg: '#1E293B', fg: '#ffffff' },
  // Custom — our own layered-squares logo on the extension's banner color
  custom: { flavor: 'custom', icon: 'custom.svg', label: 'C', bg: '#1a1a2e', fg: '#ffffff' },
};

export function chipForProvider(provider: ProviderProfile | undefined, presetName?: string): ChipSpec {
  if (!provider) { return CHIPS.unknown; }
  if (provider.type === 'anthropic') { return CHIPS.anthropic; }
  if (provider.type === 'bedrock') { return CHIPS.bedrock; }
  return CHIPS[inferProxyFlavor(provider, presetName)] ?? CHIPS.custom;
}
