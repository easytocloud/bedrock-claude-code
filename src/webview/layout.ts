/**
 * Main view layout: scope cards and preset grid.
 * Renders the primary visible content of the settings panel.
 */
import { PanelState, Preset, ProviderProfile, McpServerGroup, DirectoryGroup } from '../types';
import { DEFAULT_PRESET_ID, DEFAULT_PROVIDER_ID } from '../profiles';
import { esc } from './components';

// ---------------------------------------------------------------------------
// Scope cards
// ---------------------------------------------------------------------------

function renderScopeCard(attrs: {
  scope: 'global' | 'workspace';
  title: string;
  subtitle: string;
  badgeText: string;
  badgeColor: string;
  presetId: string | undefined;
  presetMode: string;
  presets: Preset[];
}): string {
  const { scope, title, subtitle, badgeText, badgeColor, presetId, presetMode, presets } = attrs;

  // Build preset dropdown options
  const modeOptions = [
    scope === 'workspace'
      ? `<option value="inherit"${presetMode === 'inherit' ? ' selected' : ''}>Inherit from Global</option>`
      : '',
    `<option value="manual"${presetMode === 'manual' ? ' selected' : ''}>Configure manually</option>`,
    ...presets.map(p =>
      `<option value="preset:${esc(p.id)}"${presetMode === 'preset' && presetId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`
    ),
  ].filter(Boolean).join('');

  return `
    <div class="scope-card" data-scope="${scope}">
      <div class="scope-header" data-action="toggle-scope">
        <div class="scope-indicator ${scope}"></div>
        <div class="scope-title-area">
          <div class="scope-title">
            ${esc(title)}
            <span class="scope-badge ${badgeColor}">${esc(badgeText)}</span>
          </div>
          <div class="scope-subtitle">${esc(subtitle)}</div>
        </div>
        <span class="scope-chevron">&#9662;</span>
      </div>
      <div class="scope-body">
        <div class="scope-preset-row">
          <label>Preset:</label>
          <select data-scope-preset="${scope}">${modeOptions}</select>
        </div>
        <div class="bb-chips" data-scope-blocks="${scope}">
          <!-- Populated by JS based on active preset -->
        </div>
      </div>
    </div>`;
}

export function renderScopeCards(state: PanelState): string {
  const { store } = state;

  // Global scope
  const globalPresetId = store.globalScope.presetId;
  const globalMode = store.globalScope.mode;

  // Workspace scope
  const wsScope = state.workspacePath
    ? (store.workspaceScopes[state.workspacePath] ?? { mode: 'inherit' })
    : { mode: 'inherit' as const };

  let html = '<div class="scope-section">';

  // Global card
  html += renderScopeCard({
    scope: 'global',
    title: 'Global Scope',
    subtitle: '~/.claude/settings.json',
    badgeText: globalMode === 'preset'
      ? (store.presets.find(p => p.id === globalPresetId)?.name ?? 'None')
      : globalMode === 'manual' ? 'Manual' : 'None',
    badgeColor: 'blue',
    presetId: globalPresetId,
    presetMode: globalMode,
    presets: store.presets,
  });

  // Workspace card (only if workspace is open)
  if (state.hasWorkspace) {
    const wsPresetId = wsScope.presetId;
    html += renderScopeCard({
      scope: 'workspace',
      title: 'Workspace Scope',
      subtitle: `${state.workspaceName ?? state.workspacePath ?? ''} · .claude/settings.json`,
      badgeText: wsScope.mode === 'preset'
        ? (store.presets.find(p => p.id === wsPresetId)?.name ?? 'None')
        : wsScope.mode === 'inherit' ? 'Inherited' : 'Manual',
      badgeColor: 'orange',
      presetId: wsPresetId,
      presetMode: wsScope.mode,
      presets: store.presets,
    });
  }

  html += '</div>';
  return html;
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
    <div class="preset-card" data-action="edit-preset" data-id="${esc(preset.id)}">
      <div class="preset-card-header">
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

export function renderPresetGrid(state: PanelState): string {
  const { store } = state;
  const count = store.presets.length;

  let html = `
    <div class="panel-section" data-panel="presets">
      <div class="panel-header" data-action="toggle-panel">
        <div class="panel-indicator red"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            Presets
            <span class="panel-badge red">${count}</span>
          </div>
          <div class="panel-subtitle">A preset bundles a provider, MCP servers, and directories into a reusable configuration.</div>
        </div>
        <span class="panel-chevron">&#9662;</span>
      </div>
      <div class="panel-body">
        <div class="preset-grid" data-grid="presets">`;

  for (const preset of store.presets) {
    html += renderPresetCard(preset, store.providers, store.mcpGroups, store.directoryGroups);
  }

  // Dashed "new" card
  html += `
          <div class="preset-card preset-card-new" data-action="new-preset">+ New Preset</div>`;

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
  if (p.type === 'proxy' && p.proxyBaseUrl) { return p.proxyBaseUrl; }
  return p.type;
}

function renderProviderChip(p: ProviderProfile): string {
  return `
    <div class="bb-chip orange" data-action="edit-provider" data-id="${esc(p.id)}">
      <div class="bb-chip-text">
        <span class="bb-chip-name">${esc(p.name)}</span>
        <span class="bb-chip-detail">${esc(providerTypeLabel(p))}</span>
        <span class="bb-chip-detail bb-chip-spacer">${esc(p.smallFastModel || '—')}</span>
        <span class="bb-chip-detail">${esc(p.primaryModel || '—')}</span>
        <span class="bb-chip-detail">${esc(p.opusModel || '—')}</span>
      </div>
    </div>`;
}

function renderMcpGroupChip(g: McpServerGroup): string {
  return `
    <div class="bb-chip purple" data-action="edit-mcp-group" data-id="${esc(g.id)}">
      <div class="bb-chip-text">
        <span class="bb-chip-name">${esc(g.name)}</span>
        ${g.servers.map(s => `<span class="bb-chip-detail">${esc(s.name)}</span>`).join('')}
      </div>
    </div>`;
}

function renderDirGroupChip(g: DirectoryGroup): string {
  return `
    <div class="bb-chip green" data-action="edit-dir-group" data-id="${esc(g.id)}">
      <div class="bb-chip-text">
        <span class="bb-chip-name">${esc(g.name)}</span>
        ${g.directories.map(d => `<span class="bb-chip-detail">${esc(d)}</span>`).join('')}
      </div>
    </div>`;
}

export function renderBuildingBlocks(state: PanelState): string {
  const { store } = state;
  const provCount = store.providers.length;
  const mcpCount = store.mcpGroups.length;
  const dirCount = store.directoryGroups.length;

  return `
    <div class="canvas-heading">Building Blocks</div>
    <div class="canvas-hint">Create and manage providers, MCP server groups, and directory groups. Use them in presets above.</div>

    <!-- Providers panel -->
    <div class="panel-section" data-panel="providers">
      <div class="panel-header" data-action="toggle-panel">
        <div class="panel-indicator orange"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            Providers
            <span class="panel-badge orange">${provCount}</span>
          </div>
          <div class="panel-subtitle">API backends — Anthropic, AWS Bedrock, or custom proxy endpoints.</div>
        </div>
        <span class="panel-chevron">&#9662;</span>
      </div>
      <div class="panel-body">
        <div class="bb-chips" data-chips="providers">
          ${store.providers.map(p => renderProviderChip(p)).join('')}
          <div class="bb-chip bb-chip-new" data-action="new-provider-standalone">+ New Provider</div>
        </div>
      </div>
    </div>

    <!-- MCP Server Groups panel -->
    <div class="panel-section" data-panel="mcp-groups">
      <div class="panel-header" data-action="toggle-panel">
        <div class="panel-indicator purple"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            MCP Server Groups
            <span class="panel-badge purple">${mcpCount}</span>
          </div>
          <div class="panel-subtitle">Named collections of MCP servers to attach to presets.</div>
        </div>
        <span class="panel-chevron">&#9662;</span>
      </div>
      <div class="panel-body">
        <div class="bb-chips" data-chips="mcp-groups">
          ${store.mcpGroups.map(g => renderMcpGroupChip(g)).join('')}
          <div class="bb-chip bb-chip-new" data-action="new-mcp-group-standalone">+ New Group</div>
        </div>
      </div>
    </div>

    <!-- Directory Groups panel -->
    <div class="panel-section" data-panel="dir-groups">
      <div class="panel-header" data-action="toggle-panel">
        <div class="panel-indicator green"></div>
        <div class="panel-title-area">
          <div class="panel-title">
            Directory Groups
            <span class="panel-badge green">${dirCount}</span>
          </div>
          <div class="panel-subtitle">Additional directories Claude Code is allowed to access.</div>
        </div>
        <span class="panel-chevron">&#9662;</span>
      </div>
      <div class="panel-body">
        <div class="bb-chips" data-chips="dir-groups">
          ${store.directoryGroups.map(g => renderDirGroupChip(g)).join('')}
          <div class="bb-chip bb-chip-new" data-action="new-dir-group-standalone">+ New Group</div>
        </div>
      </div>
    </div>`;
}
