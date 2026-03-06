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
        <svg width="28" height="28" viewBox="0 0 256 256">
          <rect width="256" height="256" rx="40" fill="#1a1a2e"/>
          <rect x="-50" y="-50" width="100" height="100" rx="7" ry="7" fill="#4ec970" transform="matrix(0.84,0.38,-0.84,0.38,128,144)" opacity="0.78"/>
          <rect x="-50" y="-50" width="100" height="100" rx="7" ry="7" fill="#b48eda" transform="matrix(0.72,0.32,-0.72,0.32,128,114)" opacity="0.78"/>
          <rect x="-50" y="-50" width="100" height="100" rx="7" ry="7" fill="#e8973e" transform="matrix(0.60,0.27,-0.60,0.27,128,86)" opacity="0.82"/>
          <rect x="-50" y="-50" width="100" height="100" rx="7" ry="7" fill="#d97857" transform="matrix(0.40,0.18,-0.40,0.18,128,60)" opacity="0.88"/>
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
