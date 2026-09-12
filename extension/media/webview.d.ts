/**
 * Ambient types for the webview's browser-side globals.
 *
 * `webview.js` is deliberately plain JS with no build step — it used to live
 * inside a template literal, which caused repeated escaping bugs (see v0.3.0
 * in CHANGELOG.md). This file gives an editor real types for the globals the
 * extension host injects, without introducing a compile step or changing how
 * the script loads.
 *
 * Scope is deliberate: the injected data and the VS Code bridge. Full
 * `// @ts-check` on webview.js is NOT enabled — a probe run produced ~176
 * errors that were almost entirely `document.querySelector()` returning
 * `Element` where the code knows it holds an `HTMLInputElement` (81 × `.value`,
 * 34 × `.dataset`, …). Silencing those means casting through working code, and
 * the probe surfaced no actual defects. Revisit if the file ever gains a build
 * step.
 *
 * These interfaces mirror `core/src/models.ts` and `core/src/knownProviders.ts`.
 * Keep them in sync — nothing enforces it automatically.
 */

/** Mirrors `ModelEntry` in core/src/models.ts. */
interface WebviewModelEntry {
  /** Geo prefix: 'global' | 'us' | 'eu' | 'apac' | 'jp' | 'au' | 'mantle' | '' */
  prefix: string;
  id: string;
  label: string;
  /** Added at runtime by the Bedrock fetch when the model requires provider data share. */
  pds?: boolean;
}

/** Mirrors `CredentialMode` in core/src/knownProviders.ts. */
type WebviewCredentialMode = 'none' | 'apikey' | 'authtoken';

/** Mirrors `KnownProvider` in core/src/knownProviders.ts. */
interface WebviewKnownProvider {
  id: string;
  label: string;
  type: 'bedrock' | 'proxy';
  defaultUrl?: string;
  scheme?: 'http' | 'https';
  path?: string;
  /** Undefined means no Authentication section at all (e.g. Ollama). */
  credentialModes?: WebviewCredentialMode[];
  defaultCredentialMode?: WebviewCredentialMode;
  credentialInfo?: string;
}

/**
 * Injected by `buildScriptData()` in `extension/src/webview/script.ts` as an
 * inline `<script>` that runs before `webview.js`. That function is the only
 * writer — keep this in sync with it.
 */
interface WebviewData {
  DEFAULT_PROVIDER_ID: string;
  DEFAULT_PRESET_ID: string;
  HAIKU_MODELS: WebviewModelEntry[];
  SONNET_MODELS: WebviewModelEntry[];
  OPUS_MODELS: WebviewModelEntry[];
  ANTHROPIC_DEFAULTS: { sonnet: string; haiku: string; opus: string };
  KNOWN_PROVIDERS: WebviewKnownProvider[];
}

interface Window {
  __DATA__: WebviewData;
  /** Base URI for provider icon assets, resolved via `asWebviewUri`. */
  __ICON_BASE__: string;
}

/**
 * `state.opCliAvailable` (read from the `init` message's `PanelState` payload,
 * not `window.__DATA__` — it's computed once per panel session in panel.ts's
 * `_checkOpCli()`, not static catalog data) gates whether the "1Password
 * reference" Authentication card is offered. See core/src/types.ts PanelState.
 */

/** Provided by the VS Code webview host. */
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
