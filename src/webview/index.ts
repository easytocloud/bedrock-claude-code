/**
 * Top-level HTML builder for the Claude Code Settings webview.
 * Composes styles, layout, drawers, and script into a single HTML document.
 */

import { PanelState } from '../types';
import { buildStyles } from './styles';
import { renderScopeCards, renderPresetGrid, renderBuildingBlocks } from './layout';
import { renderAllDrawers } from './drawers';
import { buildScriptData } from './script';

export function buildHtml(state: PanelState, nonce: string, cspSource: string, scriptUri: string): string {
  const styles = buildStyles();
  const scopeCards = renderScopeCards(state);
  const presetGrid = renderPresetGrid(state);
  const buildingBlocks = renderBuildingBlocks(state);
  const drawers = renderAllDrawers();
  const dataScript = buildScriptData();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}' ${cspSource};" />
  <title>Claude Code Settings</title>
  <style nonce="${nonce}">${styles}</style>
</head>
<body>
  <div class="app">
    <!-- Header -->
    <div class="header">
      <div class="header-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="var(--blue)"/>
          <path d="M7 8h10M7 12h7M7 16h10" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <h1>Claude Code Settings</h1>
      </div>
      <button class="btn btn-secondary btn-sm" data-action="reload">Reload</button>
      <button class="btn btn-secondary btn-sm" data-action="open-file">Open File</button>
      <button class="btn btn-primary btn-sm" data-action="save-all">Save All</button>
    </div>

    <!-- Scope Cards -->
    ${scopeCards}

    <!-- Preset Grid -->
    ${presetGrid}

    <!-- Building Blocks -->
    ${buildingBlocks}
  </div>

  <!-- Save Toast -->
  <div class="save-toast" id="save-toast">Settings saved</div>

  <!-- Drawers -->
  ${drawers}

  <!-- Data injection (extension-side constants) -->
  <script nonce="${nonce}">${dataScript}</script>
  <!-- Main webview script (loaded from separate file) -->
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
