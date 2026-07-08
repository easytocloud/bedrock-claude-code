/**
 * Main view layout: scope cards and preset grid.
 * Renders the primary visible content of the settings panel.
 */
import { PanelState, Preset, ProviderProfile, McpServerGroup, DirectoryGroup, KNOWN_PROVIDERS } from '@easytocloud/claude-personae-core';
import { DEFAULT_PRESET_ID } from '@easytocloud/claude-personae-core';
import { esc } from './components';
import { chipForProvider, ChipSpec } from '../providerIcons';

// Brand tile for a provider — mirrors providerTileHtml() in media/webview.js.
// Colors come from flavor-* classes in styles.ts (inline style attributes are
// blocked by the webview CSP).
function providerTileHtml(chip: ChipSpec, iconBase: string): string {
  const inner = chip.icon
    ? `<img src="${esc(iconBase)}/${esc(chip.icon)}" alt="" />`
    : esc(chip.label);
  return `<span class="provider-tile flavor-${esc(chip.flavor)}" aria-hidden="true">${inner}</span>`;
}

// ---------------------------------------------------------------------------
// Scope card — Global only. Per-workspace assignment lives in the sidebar
// (and the status bar quick-switch); workspaces inherit Global by default.
// ---------------------------------------------------------------------------

export function renderScopeCards(state: PanelState): string {
  const { store } = state;

  const globalPresetId = store.globalScope.presetId;
  const globalMode = store.globalScope.mode;

  const badgeText = globalMode === 'preset'
    ? (store.presets.find(p => p.id === globalPresetId)?.name ?? 'None')
    : globalMode === 'manual' ? 'Manual' : 'None';

  const modeOptions = [
    `<option value="manual"${globalMode === 'manual' ? ' selected' : ''}>Configure manually</option>`,
    ...store.presets.map(p =>
      `<option value="preset:${esc(p.id)}"${globalMode === 'preset' && globalPresetId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`
    ),
  ].join('');

  return `
    <div class="scope-section">
    <div class="scope-card collapsed" data-scope="global">
      <div class="scope-header" data-action="toggle-scope" role="button" tabindex="0" aria-expanded="false" aria-label="Toggle Global Scope">
        <div class="scope-indicator global"></div>
        <div class="scope-title-area">
          <div class="scope-title">
            Global Scope
            <span class="scope-badge blue">${esc(badgeText)}</span>
          </div>
          <div class="scope-subtitle">~/.claude/settings.json — the default for every VS Code Workspace; switch per workspace from the sidebar</div>
        </div>
        <div class="panel-toggle"><span></span><span></span><span></span></div>
      </div>
      <div class="scope-body">
        <div class="scope-preset-row">
          <label>Preset:</label>
          <select data-scope-preset="global">${modeOptions}</select>
        </div>
        <div class="bb-chips" data-scope-blocks="global">
          <!-- Populated by JS based on active preset -->
        </div>
      </div>
    </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Setup blocks (provider / MCP / directories summary inside scope cards)
// These are rendered by JavaScript in the webview since they depend on
// the dynamically selected preset. This function renders the static template.
// ---------------------------------------------------------------------------

export function renderSetupBlockTemplate(): string {
  // The actual content is populated by webview JS via updateScopeBlocks()
  return '';
}

// ---------------------------------------------------------------------------
// Preset grid
// ---------------------------------------------------------------------------

function renderPresetCard(
  preset: Preset,
  providers: ProviderProfile[],
  mcpGroups: McpServerGroup[],
  dirGroups: DirectoryGroup[],
  iconBase: string,
): string {
  const provider = providers.find(p => p.id === preset.providerId);
  const providerLabel = provider ? `${provider.type} · ${provider.name}` : 'No provider';

  const mcpNames = preset.mcpGroupIds
    .map(id => mcpGroups.find(g => g.id === id)?.name)
    .filter(Boolean) as string[];
  const dirNames = preset.directoryGroupIds
    .map(id => dirGroups.find(g => g.id === id)?.name)
    .filter(Boolean) as string[];

  const isDefault = preset.id === DEFAULT_PRESET_ID;

  return `
    <div class="preset-card card card-red" data-action="edit-preset" data-id="${esc(preset.id)}">
      <div class="preset-card-header">
        ${providerTileHtml(chipForProvider(provider, preset.name), iconBase)}
        <span class="preset-card-name">${esc(preset.name)}</span>
        ${isDefault ? '<span class="preset-card-default">Default</span>' : ''}
      </div>
      <div class="preset-card-section">
        <span class="preset-tag orange">${esc(providerLabel)}</span>
      </div>
      ${mcpNames.length ? `<div class="preset-card-section">
        ${mcpNames.map(n => `<span class="preset-tag purple">${esc(n)}</span>`).join('')}
      </div>` : ''}
      ${dirNames.length ? `<div class="preset-card-section">
        ${dirNames.map(n => `<span class="preset-tag green">${esc(n)}</span>`).join('')}
      </div>` : ''}
    </div>`;
}

export function renderPresetGrid(state: PanelState, iconBase: string): string {
  const { store } = state;
  const count = store.presets.length;

  let html = `
    <div class="canvas-heading">Presets</div>
    <div class="canvas-hint">A Preset combines one Provider with optional MCP Server Groups and Directory Groups into a reusable configuration. Set the Global default above; pick a different Preset per VS Code Workspace from the sidebar.</div>

    <div class="panel-section collapsed" data-panel="presets">
      <div class="panel-header" data-action="toggle-panel" role="button" tabindex="0" aria-expanded="false">
        <div class="panel-indicator red"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            Presets
            <span class="panel-badge red">${count}</span>
          </div>
          <div class="panel-subtitle">Reusable configurations to assign to Scopes.</div>
        </div>
        <div class="panel-toggle"><span></span><span></span><span></span></div>
      </div>
      <div class="panel-body">
        <div class="preset-grid" data-grid="presets">`;

  for (const preset of store.presets) {
    html += renderPresetCard(preset, store.providers, store.mcpGroups, store.directoryGroups, iconBase);
  }

  // Dashed "new" card
  html += `
          <div class="preset-card card card-new card-red" data-action="new-preset">+ New Preset</div>`;

  html += `
        </div>
      </div>
    </div>`;

  return html;
}

// ---------------------------------------------------------------------------
// Building Blocks section (providers, MCP groups, directory groups)
// ---------------------------------------------------------------------------

function providerTypeLabel(p: ProviderProfile): string {
  if (p.type === 'bedrock' && p.awsProfile) { return `${p.type} · ${p.awsProfile}`; }
  if (p.type === 'proxy') {
    const known = p.proxyPreset
      ? KNOWN_PROVIDERS.find(k => k.id === p.proxyPreset && k.id !== 'custom')
      : undefined;
    if (known) { return `${known.label}${p.proxyBaseUrl ? ' · ' + p.proxyBaseUrl : ''}`; }
    if (p.proxyBaseUrl) { return p.proxyBaseUrl; }
  }
  return p.type;
}

// Generic chip renderer — mirrors renderChipHtml() in media/webview.js.
// items: Array of { text, spacer? }; tile: optional leading brand tile HTML
function renderChip(
  color: string, action: string, id: string,
  name: string, items: { text: string; spacer?: boolean }[],
  tile = ''
): string {
  const itemHtml = items
    .map(i => `<span class="bb-chip-detail${i.spacer ? ' bb-chip-spacer' : ''}">${esc(i.text)}</span>`)
    .join('');
  return `
    <div class="bb-chip card card-${color}" data-action="${action}" data-id="${esc(id)}">
      ${tile}
      <div class="bb-chip-text">
        <span class="bb-chip-name">${esc(name)}</span>
        ${itemHtml}
      </div>
    </div>`;
}

function renderProviderChip(p: ProviderProfile, iconBase: string): string {
  return renderChip('orange', 'edit-provider', p.id, p.name, [
    { text: providerTypeLabel(p) },
    { text: p.smallFastModel || '—', spacer: true },
    { text: p.primaryModel || '—' },
    { text: p.opusModel || '—' },
  ], providerTileHtml(chipForProvider(p), iconBase));
}

function renderMcpGroupChip(g: McpServerGroup): string {
  return renderChip('purple', 'edit-mcp-group', g.id, g.name,
    g.servers.map(s => ({ text: s.name })));
}

function renderDirGroupChip(g: DirectoryGroup): string {
  return renderChip('green', 'edit-dir-group', g.id, g.name,
    g.directories.map(d => ({ text: d })));
}

export function renderBuildingBlocks(state: PanelState, iconBase: string): string {
  const { store } = state;
  const provCount = store.providers.length;
  const mcpCount = store.mcpGroups.length;
  const dirCount = store.directoryGroups.length;

  return `
    <div class="canvas-heading">Building Blocks</div>
    <div class="canvas-hint">Create and manage the Building Blocks that make up Presets: Providers, MCP Server Groups, and Directory Groups.</div>

    <!-- Providers panel -->
    <div class="panel-section collapsed" data-panel="providers">
      <div class="panel-header" data-action="toggle-panel" role="button" tabindex="0" aria-expanded="false">
        <div class="panel-indicator orange"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            Providers
            <span class="panel-badge orange">${provCount}</span>
          </div>
          <div class="panel-subtitle">API backends — Anthropic, AWS Bedrock, or Local / Other.</div>
        </div>
        <div class="panel-toggle"><span></span><span></span><span></span></div>
      </div>
      <div class="panel-body">
        <div class="bb-chips" data-chips="providers">
          ${store.providers.map(p => renderProviderChip(p, iconBase)).join('')}
          <div class="bb-chip card card-new card-orange" data-action="new-provider-standalone">+ New Provider</div>
        </div>
      </div>
    </div>

    <!-- MCP Server Groups panel -->
    <div class="panel-section collapsed" data-panel="mcp-groups">
      <div class="panel-header" data-action="toggle-panel" role="button" tabindex="0" aria-expanded="false">
        <div class="panel-indicator purple"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            MCP Server Groups
            <span class="panel-badge purple">${mcpCount}</span>
          </div>
          <div class="panel-subtitle">Named collections of MCP servers to include in Presets.</div>
        </div>
        <div class="panel-toggle"><span></span><span></span><span></span></div>
      </div>
      <div class="panel-body">
        <div class="bb-chips" data-chips="mcp-groups">
          ${store.mcpGroups.map(g => renderMcpGroupChip(g)).join('')}
          <div class="bb-chip card card-new card-purple" data-action="new-mcp-group-standalone">+ New MCP Server Group</div>
        </div>
      </div>
    </div>

    <!-- Directory Groups panel -->
    <div class="panel-section collapsed" data-panel="dir-groups">
      <div class="panel-header" data-action="toggle-panel" role="button" tabindex="0" aria-expanded="false">
        <div class="panel-indicator green"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            Directory Groups
            <span class="panel-badge green">${dirCount}</span>
          </div>
          <div class="panel-subtitle">Additional directories Claude Code is allowed to access.</div>
        </div>
        <div class="panel-toggle"><span></span><span></span><span></span></div>
      </div>
      <div class="panel-body">
        <div class="bb-chips" data-chips="dir-groups">
          ${store.directoryGroups.map(g => renderDirGroupChip(g)).join('')}
          <div class="bb-chip card card-new card-green" data-action="new-dir-group-standalone">+ New Directory Group</div>
        </div>
      </div>
    </div>`;
}
