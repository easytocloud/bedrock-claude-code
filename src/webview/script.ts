/**
 * Provides the data-injection snippet for the webview.
 * The bulk of the webview JavaScript now lives in media/webview.js,
 * loaded as a separate file via <script src="...">.  This module
 * serializes the extension-side constants into a small inline script
 * that sets window.__DATA__ before the main script runs.
 */

import { HAIKU_MODELS, SONNET_MODELS, OPUS_MODELS, ANTHROPIC_DEFAULTS } from '../models';
import { DEFAULT_PROVIDER_ID, DEFAULT_PRESET_ID } from '../profiles';

export { esc } from './components';

export function buildScriptData(): string {
  return `window.__DATA__ = ${JSON.stringify({
    DEFAULT_PROVIDER_ID,
    DEFAULT_PRESET_ID,
    HAIKU_MODELS,
    SONNET_MODELS,
    OPUS_MODELS,
    ANTHROPIC_DEFAULTS,
  })};`;
}
