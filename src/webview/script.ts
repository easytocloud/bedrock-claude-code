/**
 * Webview-side JavaScript for the Claude Code Settings panel.
 * Runs inside the VS Code webview sandbox.
 *
 * This is returned as a string template that gets embedded in a <script> tag.
 */

import { HAIKU_MODELS, SONNET_MODELS, OPUS_MODELS, ANTHROPIC_DEFAULTS } from '../models';
import { DEFAULT_PROVIDER_ID, DEFAULT_PRESET_ID } from '../profiles';
import { esc } from './components';

export function buildScript(nonce: string): string {
  // Serialize model catalogs into the webview script
  const haikuJson = JSON.stringify(HAIKU_MODELS);
  const sonnetJson = JSON.stringify(SONNET_MODELS);
  const opusJson = JSON.stringify(OPUS_MODELS);
  const defaultsJson = JSON.stringify(ANTHROPIC_DEFAULTS);

  return /* js */ `
(function() {
  const vscode = acquireVsCodeApi();

  // ─── Well-known IDs for immutable defaults ─────────────────────
  const DEFAULT_PROVIDER_ID = ${JSON.stringify(DEFAULT_PROVIDER_ID)};
  const DEFAULT_PRESET_ID = ${JSON.stringify(DEFAULT_PRESET_ID)};

  // ─── Model catalogs (injected from extension) ──────────────────
  const HAIKU_MODELS = ${haikuJson};
  const SONNET_MODELS = ${sonnetJson};
  const OPUS_MODELS = ${opusJson};
  const ANTHROPIC_DEFAULTS = ${defaultsJson};

  // ─── State ─────────────────────────────────────────────────────
  let state = null;  // PanelState
  let dirty = false;
  let drawerStack = [];
  let editingPresetId = null;
  let editingProviderId = null;
  let editingMcpGroupId = null;
  let editingMcpServerIndex = -1;  // index within group, -1 = new
  let editingDirGroupId = null;

  // Temp storage for items added to not-yet-saved groups
  let pendingServers = [];  // servers for a new MCP group (before first save)
  let pendingDirs = [];     // directories for a new directory group (before first save)

  // ─── Helpers ───────────────────────────────────────────────────
  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      vscode.postMessage({ type: 'dirty' });
    }
  }

  // ─── Region prefix filtering ──────────────────────────────────
  function getRegionPrefixes(region) {
    if (!region) return ['global', ''];
    if (region.startsWith('us-')) return ['us', 'global', ''];
    if (region.startsWith('eu-')) return ['eu', 'global', ''];
    if (region.startsWith('ap-')) return ['ap', 'global', ''];
    return ['global', ''];
  }

  function filterModels(models, region) {
    const prefixes = getRegionPrefixes(region);
    return models.filter(m => prefixes.includes(m.prefix));
  }

  // ─── Drawer system ─────────────────────────────────────────────
  function openDrawer(id) {
    const drawer = document.getElementById('drawer-' + id);
    const backdrop = document.getElementById('drawer-backdrop');
    if (!drawer || !backdrop) return;

    drawerStack.push(id);
    drawer.classList.add('open');
    backdrop.classList.add('open');

    // Auto-focus first autofocus input
    setTimeout(() => {
      const af = drawer.querySelector('[autofocus]') || drawer.querySelector('input:not([type=hidden])');
      if (af) af.focus();
    }, 300);
  }

  function closeTopDrawer() {
    if (drawerStack.length === 0) return;
    const id = drawerStack.pop();
    const drawer = document.getElementById('drawer-' + id);
    if (drawer) drawer.classList.remove('open');

    if (drawerStack.length === 0) {
      const backdrop = document.getElementById('drawer-backdrop');
      if (backdrop) backdrop.classList.remove('open');
    }
  }

  function closeAllDrawers() {
    while (drawerStack.length > 0) {
      closeTopDrawer();
    }
  }

  // ─── Scope card toggle ─────────────────────────────────────────
  function toggleScope(header) {
    const card = header.closest('.scope-card');
    if (card) card.classList.toggle('collapsed');
  }

  // ─── Shared chip renderers (used by scope blocks AND building block panels) ──
  function providerTypeLabel(p) {
    if (p.type === 'bedrock' && p.awsProfile) return p.type + ' \u00b7 ' + p.awsProfile;
    if (p.type === 'proxy' && p.proxyBaseUrl) return p.proxyBaseUrl;
    return p.type;
  }

  function renderProviderChipHtml(p) {
    return \`<div class="bb-chip orange" data-action="edit-provider" data-id="\${escHtml(p.id)}">
      <div class="bb-chip-text">
        <span class="bb-chip-name">\${escHtml(p.name)}</span>
        <span class="bb-chip-detail">\${escHtml(providerTypeLabel(p))}</span>
        <span class="bb-chip-detail bb-chip-spacer">\${escHtml(p.smallFastModel || '—')}</span>
        <span class="bb-chip-detail">\${escHtml(p.primaryModel || '—')}</span>
        <span class="bb-chip-detail">\${escHtml(p.opusModel || '—')}</span>
      </div>
    </div>\`;
  }

  function renderMcpGroupChipHtml(g) {
    return \`<div class="bb-chip purple" data-action="edit-mcp-group" data-id="\${escHtml(g.id)}">
      <div class="bb-chip-text">
        <span class="bb-chip-name">\${escHtml(g.name)}</span>
        \${g.servers.map(s => '<span class="bb-chip-detail">' + escHtml(s.name) + '</span>').join('')}
      </div>
    </div>\`;
  }

  function renderDirGroupChipHtml(g) {
    return \`<div class="bb-chip green" data-action="edit-dir-group" data-id="\${escHtml(g.id)}">
      <div class="bb-chip-text">
        <span class="bb-chip-name">\${escHtml(g.name)}</span>
        \${g.directories.map(d => '<span class="bb-chip-detail">' + escHtml(d) + '</span>').join('')}
      </div>
    </div>\`;
  }

  // ─── Update scope badges ─────────────────────────────────────
  function updateScopeBadges() {
    const store = state.store;

    function badgeTextFor(assignment) {
      if (assignment.mode === 'preset' && assignment.presetId) {
        const p = store.presets.find(pr => pr.id === assignment.presetId);
        return p ? p.name : 'None';
      }
      if (assignment.mode === 'inherit') return 'Inherited';
      if (assignment.mode === 'manual') return 'Manual';
      return 'None';
    }

    const globalBadge = document.querySelector('[data-scope="global"] .scope-badge');
    if (globalBadge) globalBadge.textContent = badgeTextFor(store.globalScope);

    const wsBadge = document.querySelector('[data-scope="workspace"] .scope-badge');
    if (wsBadge) {
      const wsScope = (state.workspacePath && store.workspaceScopes[state.workspacePath]) || { mode: 'inherit' };
      wsBadge.textContent = badgeTextFor(wsScope);
    }
  }

  // ─── Populate scope blocks ─────────────────────────────────────
  function renderPresetChips(presetId) {
    const store = state.store;
    const preset = store.presets.find(p => p.id === presetId);
    if (!preset) return '';

    let html = '';
    const provider = store.providers.find(p => p.id === preset.providerId);
    if (provider) html += renderProviderChipHtml(provider);
    for (const id of preset.mcpGroupIds) {
      const g = store.mcpGroups.find(mg => mg.id === id);
      if (g) html += renderMcpGroupChipHtml(g);
    }
    for (const id of preset.directoryGroupIds) {
      const g = store.directoryGroups.find(dg => dg.id === id);
      if (g) html += renderDirGroupChipHtml(g);
    }
    return html;
  }

  function updateScopeBlocks(scope) {
    const container = document.querySelector('[data-scope-blocks="' + scope + '"]');
    if (!container || !state) return;

    const store = state.store;
    let assignment;
    if (scope === 'global') {
      assignment = store.globalScope;
    } else {
      assignment = (state.workspacePath && store.workspaceScopes[state.workspacePath]) || { mode: 'inherit' };
    }

    if (assignment.mode === 'inherit') {
      // Show the global preset's tiles but dimmed
      const globalPresetId = store.globalScope.mode === 'preset' ? store.globalScope.presetId : null;
      const chips = globalPresetId ? renderPresetChips(globalPresetId) : '';
      if (chips) {
        container.innerHTML = '<div class="bb-chips-inherited">' + chips + '</div>';
      } else {
        container.innerHTML = '<div class="empty-state">No global preset configured.</div>';
      }
      return;
    }
    if (assignment.mode === 'manual') {
      container.innerHTML = '<div class="empty-state">Manually configured. Edit settings files directly.</div>';
      return;
    }

    const chips = assignment.presetId ? renderPresetChips(assignment.presetId) : '';
    container.innerHTML = chips || '<div class="empty-state">No preset selected.</div>';
  }

  // ─── Populate preset drawer ────────────────────────────────────
  function openPresetDrawer(presetId) {
    const store = state.store;
    const isNew = !presetId;
    const preset = isNew ? null : store.presets.find(p => p.id === presetId);

    editingPresetId = isNew ? null : presetId;

    document.getElementById('preset-drawer-title').textContent = isNew ? 'New Preset' : escHtml(preset.name);
    document.getElementById('preset-name').value = preset ? preset.name : '';

    // Provider dropdown
    const provSel = document.getElementById('preset-provider');
    provSel.innerHTML = '<option value="">— Select a provider —</option>';
    for (const p of store.providers) {
      const icon = p.type === 'anthropic' ? '☁️' : p.type === 'bedrock' ? '🔶' : '🔗';
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = icon + ' ' + p.name;
      if (preset && preset.providerId === p.id) opt.selected = true;
      provSel.appendChild(opt);
    }
    updateProviderPreview();

    // MCP group checkboxes
    const mcpContainer = document.getElementById('preset-mcp-groups');
    mcpContainer.innerHTML = '';
    for (const g of store.mcpGroups) {
      const checked = preset ? preset.mcpGroupIds.includes(g.id) : false;
      const serverNames = g.servers.map(s => s.name).join(', ') || '(no servers)';
      mcpContainer.innerHTML += \`
        <label class="check-item">
          <input type="checkbox" data-mcp-group="\${escHtml(g.id)}" \${checked ? 'checked' : ''} />
          <div>
            <div class="check-item-label">\${escHtml(g.name)}</div>
            <div class="check-item-hint">\${escHtml(serverNames)}</div>
          </div>
          <span class="spacer"></span>
          <button class="btn-icon btn-sm" data-action="edit-mcp-group" data-id="\${escHtml(g.id)}">✏️</button>
        </label>\`;
    }

    // Directory group checkboxes
    const dirContainer = document.getElementById('preset-dir-groups');
    dirContainer.innerHTML = '';
    for (const g of store.directoryGroups) {
      const checked = preset ? preset.directoryGroupIds.includes(g.id) : false;
      const dirNames = g.directories.join(', ') || '(no directories)';
      dirContainer.innerHTML += \`
        <label class="check-item">
          <input type="checkbox" data-dir-group="\${escHtml(g.id)}" \${checked ? 'checked' : ''} />
          <div>
            <div class="check-item-label">\${escHtml(g.name)}</div>
            <div class="check-item-hint">\${escHtml(dirNames)}</div>
          </div>
          <span class="spacer"></span>
          <button class="btn-icon btn-sm" data-action="edit-dir-group" data-id="\${escHtml(g.id)}">✏️</button>
        </label>\`;
    }

    // Default preset: lock name and provider, hide delete/duplicate
    const isDefault = presetId === DEFAULT_PRESET_ID;
    const nameInput = document.getElementById('preset-name');
    if (nameInput) {
      nameInput.disabled = isDefault;
      if (isDefault) nameInput.title = 'The Default preset cannot be renamed';
    }
    const provSelEl = document.getElementById('preset-provider');
    if (provSelEl) {
      provSelEl.disabled = isDefault;
      if (isDefault) provSelEl.title = 'The Default preset always uses Anthropic';
    }

    // Show/hide delete button
    const deleteBtn = document.querySelector('[data-action="delete-preset"]');
    if (deleteBtn) deleteBtn.style.display = (isNew || isDefault) ? 'none' : '';

    const dupBtn = document.querySelector('[data-action="duplicate-preset"]');
    if (dupBtn) dupBtn.style.display = isDefault ? 'none' : '';

    const saveBtn = document.querySelector('[data-action="save-preset"]');
    if (saveBtn) saveBtn.textContent = isNew ? 'Create Preset' : 'Done';

    openDrawer('preset');
  }

  function updateProviderPreview() {
    const sel = document.getElementById('preset-provider');
    const preview = document.getElementById('preset-provider-preview');
    if (!sel || !preview) return;

    const providerId = sel.value;
    const provider = state.store.providers.find(p => p.id === providerId);

    if (!provider) {
      preview.style.display = 'none';
      return;
    }

    preview.style.display = '';
    preview.innerHTML = \`
      <div class="provider-preview-row"><span class="provider-preview-label">Sonnet:</span> \${escHtml(provider.primaryModel)}</div>
      <div class="provider-preview-row"><span class="provider-preview-label">Haiku:</span> \${escHtml(provider.smallFastModel)}</div>
      <div class="provider-preview-row"><span class="provider-preview-label">Opus:</span> \${escHtml(provider.opusModel)}</div>\`;
  }

  // ─── Populate provider drawer ──────────────────────────────────
  function openProviderDrawer(providerId) {
    const store = state.store;
    const isNew = !providerId;
    const provider = isNew ? null : store.providers.find(p => p.id === providerId);

    editingProviderId = isNew ? null : providerId;

    document.getElementById('provider-drawer-title').textContent = isNew ? 'New Provider' : escHtml(provider.name);
    document.getElementById('provider-name').value = provider ? provider.name : '';

    // Set type selector
    const typeVal = provider ? provider.type : '';
    document.querySelectorAll('[data-seg="provider-type"]').forEach(btn => {
      btn.classList.toggle('sel', btn.dataset.val === typeVal);
    });

    // Fill fields
    if (provider) {
      document.getElementById('provider-anthropic-key').value = provider.anthropicApiKey || '';
      document.getElementById('provider-proxy-url').value = provider.proxyBaseUrl || '';
      document.getElementById('provider-proxy-key').value = provider.proxyApiKey || '';
      document.getElementById('provider-aws-refresh').value = provider.awsAuthRefresh || '';
    } else {
      document.getElementById('provider-anthropic-key').value = '';
      document.getElementById('provider-proxy-url').value = '';
      document.getElementById('provider-proxy-key').value = '';
      document.getElementById('provider-aws-refresh').value = '';
    }

    // AWS profiles dropdown
    const awsProfileSel = document.getElementById('provider-aws-profile');
    awsProfileSel.innerHTML = '';
    for (const p of (state.awsProfiles || ['default'])) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      if (provider && provider.awsProfile === p) opt.selected = true;
      awsProfileSel.appendChild(opt);
    }

    // AWS region
    const regionSel = document.getElementById('provider-aws-region');
    if (provider && provider.awsRegion) {
      regionSel.value = provider.awsRegion;
    }

    // Prompt caching toggle
    const cachingToggle = document.querySelector('[data-toggle="provider-disable-caching"]');
    if (cachingToggle) {
      cachingToggle.classList.toggle('on', !!(provider && provider.disablePromptCaching));
    }

    // Default provider: lock name, type, and models — only API key is editable
    const isDefaultProv = providerId === DEFAULT_PROVIDER_ID;
    const provNameInput = document.getElementById('provider-name');
    if (provNameInput) {
      provNameInput.disabled = isDefaultProv;
      if (isDefaultProv) provNameInput.title = 'The default Anthropic provider cannot be renamed';
    }
    // Disable type selector for default provider
    document.querySelectorAll('[data-seg="provider-type"]').forEach(btn => {
      btn.disabled = isDefaultProv;
    });

    // Show/hide delete button
    const deleteBtn = document.querySelector('[data-action="delete-provider"]');
    if (deleteBtn) deleteBtn.style.display = (isNew || isDefaultProv) ? 'none' : '';

    const dupProvBtn = document.querySelector('[data-action="duplicate-provider"]');
    if (dupProvBtn) dupProvBtn.style.display = isDefaultProv ? 'none' : '';

    const saveBtn = document.querySelector('[data-action="save-provider"]');
    if (saveBtn) saveBtn.textContent = isNew ? 'Create Provider' : 'Done';

    showProviderSections(typeVal);
    if (typeVal) rebuildModelSelects(typeVal, provider);

    // Disable model selects for default provider (they're fixed to Anthropic defaults)
    if (isDefaultProv) {
      ['provider-model-sonnet', 'provider-model-haiku', 'provider-model-opus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
      });
      const cachingToggleEl = document.querySelector('[data-toggle="provider-disable-caching"]');
      if (cachingToggleEl) cachingToggleEl.style.pointerEvents = 'none';
    }

    openDrawer('provider');
  }

  function showProviderSections(type) {
    document.getElementById('provider-section-anthropic').style.display = type === 'anthropic' ? '' : 'none';
    document.getElementById('provider-section-bedrock').style.display = type === 'bedrock' ? '' : 'none';
    document.getElementById('provider-section-proxy').style.display = type === 'proxy' ? '' : 'none';
    document.getElementById('provider-models-section').style.display = type ? '' : 'none';
    document.getElementById('provider-models-info').style.display = type === 'bedrock' ? '' : 'none';
  }

  function rebuildModelSelects(type, provider) {
    const region = document.getElementById('provider-aws-region').value;

    if (type === 'bedrock') {
      populateModelSelect('provider-model-sonnet', filterModels(SONNET_MODELS, region), provider?.primaryModel, true);
      populateModelSelect('provider-model-haiku', filterModels(HAIKU_MODELS, region), provider?.smallFastModel, true);
      populateModelSelect('provider-model-opus', filterModels(OPUS_MODELS, region), provider?.opusModel, true);
    } else if (type === 'anthropic') {
      populateModelSelect('provider-model-sonnet', [], provider?.primaryModel || ANTHROPIC_DEFAULTS.sonnet, false);
      populateModelSelect('provider-model-haiku', [], provider?.smallFastModel || ANTHROPIC_DEFAULTS.haiku, false);
      populateModelSelect('provider-model-opus', [], provider?.opusModel || ANTHROPIC_DEFAULTS.opus, false);
    } else if (type === 'proxy') {
      populateModelSelect('provider-model-sonnet', [], provider?.primaryModel || '', false);
      populateModelSelect('provider-model-haiku', [], provider?.smallFastModel || '', false);
      populateModelSelect('provider-model-opus', [], provider?.opusModel || '', false);
    }
  }

  function populateModelSelect(selectId, models, currentValue, showDropdown) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    if (showDropdown && models.length > 0) {
      // Replace with select dropdown
      const selectEl = document.createElement('select');
      selectEl.id = selectId;

      let found = false;
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === currentValue) { opt.selected = true; found = true; }
        selectEl.appendChild(opt);
      }
      // Custom option
      const customOpt = document.createElement('option');
      customOpt.value = '_custom';
      customOpt.textContent = '✏️ Custom model ID...';
      if (!found && currentValue) {
        customOpt.value = currentValue;
        customOpt.textContent = currentValue + ' (custom)';
        customOpt.selected = true;
      }
      selectEl.appendChild(customOpt);

      sel.replaceWith(selectEl);
    } else {
      // Replace with text input
      const input = document.createElement('input');
      input.type = 'text';
      input.id = selectId;
      input.value = currentValue || '';
      input.placeholder = 'Enter model ID';
      sel.replaceWith(input);
    }
  }

  // ─── Populate MCP group drawer ─────────────────────────────────
  function openMcpGroupDrawer(groupId) {
    const store = state.store;
    const isNew = !groupId;
    const group = isNew ? null : store.mcpGroups.find(g => g.id === groupId);

    editingMcpGroupId = isNew ? null : groupId;
    if (isNew) pendingServers = [];

    document.getElementById('mcp-group-drawer-title').textContent = isNew ? 'New MCP Server Group' : escHtml(group.name);
    document.getElementById('mcp-group-name').value = group ? group.name : '';

    renderMcpServerList(group ? group.servers : pendingServers);

    const deleteBtn = document.querySelector('[data-action="delete-mcp-group"]');
    if (deleteBtn) deleteBtn.style.display = isNew ? 'none' : '';

    const saveBtn = document.querySelector('[data-action="save-mcp-group"]');
    if (saveBtn) saveBtn.textContent = isNew ? 'Create Group' : 'Done';

    openDrawer('mcp-group');
  }

  function renderMcpServerList(servers) {
    const container = document.getElementById('mcp-group-servers');
    if (!container) return;

    if (servers.length === 0) {
      container.innerHTML = '<div class="empty-state">No servers yet. Add your first server below.</div>';
      return;
    }

    container.innerHTML = servers.map((s, i) => \`
      <div class="item-row" data-server-index="\${i}">
        <div class="item-row-info">
          <div class="item-row-name">\${escHtml(s.name)}</div>
          <div class="item-row-detail">\${escHtml(s.type)} · \${escHtml(s.url || s.command || '')}</div>
        </div>
        <div class="item-row-actions">
          <button class="btn-icon btn-sm" data-action="edit-mcp-server-item" data-index="\${i}">✏️</button>
          <button class="btn-icon btn-sm" data-action="remove-mcp-server-item" data-index="\${i}">&times;</button>
        </div>
      </div>\`).join('');
  }

  // ─── Populate MCP server drawer ────────────────────────────────
  function openMcpServerDrawer(server, index) {
    editingMcpServerIndex = index;
    const isNew = index < 0;

    document.getElementById('mcp-server-drawer-title').textContent = isNew ? 'Add MCP Server' : 'Edit MCP Server';
    document.getElementById('mcp-server-name').value = server ? server.name : '';
    document.getElementById('mcp-server-url').value = server ? (server.url || '') : '';
    document.getElementById('mcp-server-command').value = server ? (server.command || '') : '';
    document.getElementById('mcp-server-args').value = server ? (server.args || []).join('\\n') : '';

    const transport = server ? server.type : 'http';
    document.querySelectorAll('[data-seg="mcp-transport"]').forEach(btn => {
      btn.classList.toggle('sel', btn.dataset.val === transport);
    });
    showMcpTransportSection(transport);

    // Env vars
    renderMcpEnvVars(server ? (server.env || {}) : {});

    openDrawer('mcp-server');
  }

  function showMcpTransportSection(transport) {
    document.getElementById('mcp-transport-url').style.display = (transport === 'http' || transport === 'sse') ? '' : 'none';
    document.getElementById('mcp-transport-stdio').style.display = transport === 'stdio' ? '' : 'none';
  }

  function renderMcpEnvVars(env) {
    const container = document.getElementById('mcp-server-env');
    if (!container) return;

    const entries = Object.entries(env);
    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state">No variables configured.</div>';
      return;
    }

    container.innerHTML = entries.map(([key, val], i) => \`
      <div class="item-row" data-env-index="\${i}">
        <div class="item-row-info">
          <input type="text" value="\${escHtml(key)}" placeholder="KEY" style="width:40%;display:inline-block;margin-right:4px" data-env-key="\${i}" />
          <input type="text" value="\${escHtml(val)}" placeholder="value" style="width:55%;display:inline-block" data-env-val="\${i}" />
        </div>
        <button class="btn-icon btn-sm" data-action="remove-mcp-env-var" data-index="\${i}">&times;</button>
      </div>\`).join('');
  }

  // ─── Populate directory group drawer ───────────────────────────
  function openDirGroupDrawer(groupId) {
    const store = state.store;
    const isNew = !groupId;
    const group = isNew ? null : store.directoryGroups.find(g => g.id === groupId);

    editingDirGroupId = isNew ? null : groupId;
    if (isNew) pendingDirs = [];

    document.getElementById('dir-group-drawer-title').textContent = isNew ? 'New Directory Group' : escHtml(group.name);
    document.getElementById('dir-group-name').value = group ? group.name : '';

    renderDirectoryList(group ? group.directories : pendingDirs);

    const deleteBtn = document.querySelector('[data-action="delete-dir-group"]');
    if (deleteBtn) deleteBtn.style.display = isNew ? 'none' : '';

    const saveBtn = document.querySelector('[data-action="save-dir-group"]');
    if (saveBtn) saveBtn.textContent = isNew ? 'Create Group' : 'Done';

    openDrawer('dir-group');
  }

  function renderDirectoryList(dirs) {
    const container = document.getElementById('dir-group-dirs');
    if (!container) return;

    if (dirs.length === 0) {
      container.innerHTML = '<div class="empty-state">No directories yet.</div>';
      return;
    }

    container.innerHTML = dirs.map((d, i) => \`
      <div class="item-row" data-dir-index="\${i}">
        <div class="item-row-info">
          <input type="text" class="dir-path-input" value="\${escHtml(d)}" data-dir-path="\${i}" placeholder="/path/to/directory" />
        </div>
        <div class="item-row-actions">
          <button class="btn-icon btn-sm" data-action="browse-directory" data-index="\${i}" title="Browse">📁</button>
          <button class="btn-icon btn-sm" data-action="remove-directory" data-index="\${i}">&times;</button>
        </div>
      </div>\`).join('');
  }

  // ─── Save functions ────────────────────────────────────────────
  function savePresetFromDrawer() {
    const store = state.store;
    const name = document.getElementById('preset-name').value.trim();
    if (!name) { showToast('Preset name is required', true); return; }

    const providerId = document.getElementById('preset-provider').value;
    if (!providerId) { showToast('Please select a provider', true); return; }
    const mcpGroupIds = Array.from(document.querySelectorAll('[data-mcp-group]:checked')).map(el => el.dataset.mcpGroup);
    const dirGroupIds = Array.from(document.querySelectorAll('[data-dir-group]:checked')).map(el => el.dataset.dirGroup);

    if (editingPresetId) {
      const preset = store.presets.find(p => p.id === editingPresetId);
      if (preset) {
        preset.name = name;
        preset.providerId = providerId;
        preset.mcpGroupIds = mcpGroupIds;
        preset.directoryGroupIds = dirGroupIds;
      }
    } else {
      store.presets.push({
        id: generateId(),
        name,
        providerId,
        mcpGroupIds,
        directoryGroupIds: dirGroupIds,
      });
    }

    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function saveProviderFromDrawer() {
    const store = state.store;

    // Default provider: only the API key is editable
    if (editingProviderId === DEFAULT_PROVIDER_ID) {
      const provider = store.providers.find(p => p.id === DEFAULT_PROVIDER_ID);
      if (provider) {
        provider.anthropicApiKey = document.getElementById('provider-anthropic-key').value || undefined;
      }
      markDirty();
      closeTopDrawer();
      refreshUI();
      return;
    }

    const name = document.getElementById('provider-name').value.trim();
    if (!name) { showToast('Provider name is required', true); return; }

    const selBtn = document.querySelector('[data-seg="provider-type"].sel');
    const type = selBtn ? selBtn.dataset.val : '';
    if (!type) { showToast('Please select a provider type', true); return; }

    if (type === 'bedrock' && !document.getElementById('provider-aws-profile').value.trim()) {
      showToast('AWS profile is required for Bedrock', true); return;
    }
    if (type === 'proxy' && !document.getElementById('provider-proxy-url').value.trim()) {
      showToast('Base URL is required for proxy providers', true); return;
    }

    const providerData = {
      name,
      type,
      anthropicApiKey: document.getElementById('provider-anthropic-key').value || undefined,
      awsProfile: document.getElementById('provider-aws-profile').value || undefined,
      awsRegion: document.getElementById('provider-aws-region').value || undefined,
      awsAuthRefresh: document.getElementById('provider-aws-refresh').value || undefined,
      proxyBaseUrl: document.getElementById('provider-proxy-url').value || undefined,
      proxyApiKey: document.getElementById('provider-proxy-key').value || undefined,
      primaryModel: getModelValue('provider-model-sonnet'),
      smallFastModel: getModelValue('provider-model-haiku'),
      opusModel: getModelValue('provider-model-opus'),
      disablePromptCaching: document.querySelector('[data-toggle="provider-disable-caching"]')?.classList.contains('on') || false,
    };

    if (editingProviderId) {
      const provider = store.providers.find(p => p.id === editingProviderId);
      if (provider) {
        Object.assign(provider, providerData);
      }
    } else {
      store.providers.push({
        id: generateId(),
        ...providerData,
      });
    }

    markDirty();
    closeTopDrawer();
    refreshUI();

    // If preset drawer is still open, refresh its provider dropdown
    if (drawerStack.length > 0 && drawerStack[drawerStack.length - 1] === 'preset') {
      openPresetDrawer(editingPresetId);
      // Reopen won't push to stack since it's already there — need to handle differently
    }
  }

  function getModelValue(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return '';
    return el.value || '';
  }

  function saveMcpGroupFromDrawer() {
    const store = state.store;
    const name = document.getElementById('mcp-group-name').value.trim();
    if (!name) { showToast('Group name is required', true); return; }

    // Collect servers from the current list (they were stored in a temp array)
    const servers = collectMcpServersFromDOM();

    if (editingMcpGroupId) {
      const group = store.mcpGroups.find(g => g.id === editingMcpGroupId);
      if (group) {
        group.name = name;
        group.servers = servers;
      }
    } else {
      store.mcpGroups.push({
        id: generateId(),
        name,
        servers,
      });
    }

    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function collectMcpServersFromDOM() {
    const group = editingMcpGroupId
      ? state.store.mcpGroups.find(g => g.id === editingMcpGroupId)
      : null;
    return group ? [...group.servers] : [...pendingServers];
  }

  function saveMcpServerFromDrawer() {
    const name = document.getElementById('mcp-server-name').value.trim();
    if (!name) { showToast('Server name is required', true); return; }

    const transportBtn = document.querySelector('[data-seg="mcp-transport"].sel');
    const type = transportBtn ? transportBtn.dataset.val : 'http';

    if ((type === 'http' || type === 'sse') && !document.getElementById('mcp-server-url').value.trim()) {
      showToast('URL is required for HTTP/SSE servers', true); return;
    }
    if (type === 'stdio' && !document.getElementById('mcp-server-command').value.trim()) {
      showToast('Command is required for stdio servers', true); return;
    }

    // For stdio: split command field if it contains spaces (e.g. "npx -y @pkg" → command="npx", args=["-y","@pkg",...])
    let command;
    let args;
    if (type === 'stdio') {
      const rawCmd = document.getElementById('mcp-server-command').value.trim();
      const parts = rawCmd.split(/\\s+/);
      command = parts[0] || rawCmd;
      const extraArgs = parts.slice(1);
      const textareaArgs = document.getElementById('mcp-server-args').value.split('\\n').map(s => s.trim()).filter(Boolean);
      args = [...extraArgs, ...textareaArgs];
      if (args.length === 0) args = undefined;
    }

    const server = {
      name,
      type,
      url: (type === 'http' || type === 'sse') ? document.getElementById('mcp-server-url').value : undefined,
      command,
      args,
      env: collectMcpEnvFromDOM(),
    };

    // Find the group we're editing servers for (or use pending list for new groups)
    const group = editingMcpGroupId
      ? state.store.mcpGroups.find(g => g.id === editingMcpGroupId)
      : null;
    const serverList = group ? group.servers : pendingServers;

    if (editingMcpServerIndex >= 0 && editingMcpServerIndex < serverList.length) {
      serverList[editingMcpServerIndex] = server;
    } else {
      serverList.push(server);
    }
    if (group) markDirty();

    closeTopDrawer();
    renderMcpServerList(serverList);
  }

  function collectMcpEnvFromDOM() {
    const env = {};
    document.querySelectorAll('[data-env-key]').forEach(el => {
      const idx = el.dataset.envKey;
      const valEl = document.querySelector('[data-env-val="' + idx + '"]');
      if (el.value && valEl) {
        env[el.value] = valEl.value;
      }
    });
    return Object.keys(env).length > 0 ? env : undefined;
  }

  function saveDirGroupFromDrawer() {
    const store = state.store;
    const name = document.getElementById('dir-group-name').value.trim();
    if (!name) { showToast('Group name is required', true); return; }

    const dirs = collectDirsFromDOM();

    if (editingDirGroupId) {
      const group = store.directoryGroups.find(g => g.id === editingDirGroupId);
      if (group) {
        group.name = name;
        group.directories = dirs;
      }
    } else {
      store.directoryGroups.push({
        id: generateId(),
        name,
        directories: dirs,
      });
    }

    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function collectDirsFromDOM() {
    const dirs = [];
    document.querySelectorAll('.dir-path-input').forEach(input => {
      const val = input.value.trim();
      if (val) dirs.push(val);
    });
    return dirs;
  }

  // ─── Delete functions ──────────────────────────────────────────
  function deletePreset() {
    if (!editingPresetId || editingPresetId === DEFAULT_PRESET_ID) return;
    const store = state.store;
    store.presets = store.presets.filter(p => p.id !== editingPresetId);

    // Clear scope references
    if (store.globalScope.presetId === editingPresetId) {
      store.globalScope = { mode: 'manual' };
    }
    for (const [key, scope] of Object.entries(store.workspaceScopes)) {
      if (scope.presetId === editingPresetId) {
        store.workspaceScopes[key] = { mode: 'inherit' };
      }
    }

    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function deleteProvider() {
    if (!editingProviderId || editingProviderId === DEFAULT_PROVIDER_ID) return;
    const store = state.store;
    store.providers = store.providers.filter(p => p.id !== editingProviderId);
    // Clear references in presets
    for (const preset of store.presets) {
      if (preset.providerId === editingProviderId) {
        preset.providerId = '';
      }
    }
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function deleteMcpGroup() {
    if (!editingMcpGroupId) return;
    const store = state.store;
    store.mcpGroups = store.mcpGroups.filter(g => g.id !== editingMcpGroupId);
    for (const preset of store.presets) {
      preset.mcpGroupIds = preset.mcpGroupIds.filter(id => id !== editingMcpGroupId);
    }
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function deleteDirGroup() {
    if (!editingDirGroupId) return;
    const store = state.store;
    store.directoryGroups = store.directoryGroups.filter(g => g.id !== editingDirGroupId);
    for (const preset of store.presets) {
      preset.directoryGroupIds = preset.directoryGroupIds.filter(id => id !== editingDirGroupId);
    }
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  // ─── Duplicate functions ───────────────────────────────────────
  function duplicatePreset() {
    if (!editingPresetId) return;
    const original = state.store.presets.find(p => p.id === editingPresetId);
    if (!original) return;
    state.store.presets.push({
      ...JSON.parse(JSON.stringify(original)),
      id: generateId(),
      name: original.name + ' (copy)',
    });
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function duplicateProvider() {
    if (!editingProviderId) return;
    const original = state.store.providers.find(p => p.id === editingProviderId);
    if (!original) return;
    state.store.providers.push({
      ...JSON.parse(JSON.stringify(original)),
      id: generateId(),
      name: original.name + ' (copy)',
    });
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function duplicateMcpGroup() {
    if (!editingMcpGroupId) return;
    const original = state.store.mcpGroups.find(g => g.id === editingMcpGroupId);
    if (!original) return;
    state.store.mcpGroups.push({
      ...JSON.parse(JSON.stringify(original)),
      id: generateId(),
      name: original.name + ' (copy)',
    });
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function duplicateDirGroup() {
    if (!editingDirGroupId) return;
    const original = state.store.directoryGroups.find(g => g.id === editingDirGroupId);
    if (!original) return;
    state.store.directoryGroups.push({
      ...JSON.parse(JSON.stringify(original)),
      id: generateId(),
      name: original.name + ' (copy)',
    });
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  // ─── Scope preset change ──────────────────────────────────────
  function handleScopePresetChange(scope, value) {
    const store = state.store;

    let assignment;
    if (value === 'inherit') {
      assignment = { mode: 'inherit' };
    } else if (value === 'manual') {
      assignment = { mode: 'manual' };
    } else if (value.startsWith('preset:')) {
      assignment = { mode: 'preset', presetId: value.slice(7) };
    } else {
      return;
    }

    if (scope === 'global') {
      store.globalScope = assignment;
    } else if (state.workspacePath) {
      store.workspaceScopes[state.workspacePath] = assignment;
    }

    markDirty();
    updateScopeBadges();
    updateScopeBlocks(scope);
    // If global changed, workspace scope may inherit from it
    if (scope === 'global') {
      updateScopeBlocks('workspace');
    }
  }

  // ─── Full UI refresh ──────────────────────────────────────────
  function refreshUI() {
    renderPresetGrid();
    renderBuildingBlockChips();
    updatePanelBadges();
    updateScopeBadges();
    updateScopeBlocks('global');
    if (state.hasWorkspace) {
      updateScopeBlocks('workspace');
    }
    updateScopeDropdown('global');
    if (state.hasWorkspace) {
      updateScopeDropdown('workspace');
    }
  }

  function renderPresetGrid() {
    const grid = document.querySelector('[data-grid="presets"]');
    if (!grid) return;

    const store = state.store;
    let html = '';

    for (const preset of store.presets) {
      const provider = store.providers.find(p => p.id === preset.providerId);
      const providerLabel = provider ? provider.type + ' · ' + provider.name : 'No provider';
      const isDefault = preset.id === DEFAULT_PRESET_ID;

      const mcpNames = preset.mcpGroupIds
        .map(id => store.mcpGroups.find(g => g.id === id))
        .filter(Boolean)
        .map(g => g.name);
      const dirNames = preset.directoryGroupIds
        .map(id => store.directoryGroups.find(g => g.id === id))
        .filter(Boolean)
        .map(g => g.name);

      let mcpSection = mcpNames.length
        ? '<div class="preset-card-section">' + mcpNames.map(n => '<span class="preset-tag purple">' + escHtml(n) + '</span>').join('') + '</div>'
        : '';
      let dirSection = dirNames.length
        ? '<div class="preset-card-section">' + dirNames.map(n => '<span class="preset-tag green">' + escHtml(n) + '</span>').join('') + '</div>'
        : '';

      html += \`
        <div class="preset-card" data-action="edit-preset" data-id="\${escHtml(preset.id)}">
          <div class="preset-card-header">
            <span class="preset-card-name">\${escHtml(preset.name)}</span>
            \${isDefault ? '<span class="preset-card-default">Default</span>' : ''}
          </div>
          <div class="preset-card-section">
            <span class="preset-tag orange">\${escHtml(providerLabel)}</span>
          </div>
          \${mcpSection}
          \${dirSection}
        </div>\`;
    }

    // Dashed "new" card
    html += '<div class="preset-card preset-card-new" data-action="new-preset">+ New Preset</div>';

    grid.innerHTML = html;
  }

  function renderBuildingBlockChips() {
    const store = state.store;

    // Providers
    const provChips = document.querySelector('[data-chips="providers"]');
    if (provChips) {
      let html = store.providers.map(p => renderProviderChipHtml(p)).join('');
      html += '<div class="bb-chip bb-chip-new" data-action="new-provider-standalone">+ New Provider</div>';
      provChips.innerHTML = html;
    }

    // MCP groups
    const mcpChips = document.querySelector('[data-chips="mcp-groups"]');
    if (mcpChips) {
      let html = store.mcpGroups.map(g => renderMcpGroupChipHtml(g)).join('');
      html += '<div class="bb-chip bb-chip-new" data-action="new-mcp-group-standalone">+ New Group</div>';
      mcpChips.innerHTML = html;
    }

    // Directory groups
    const dirChips = document.querySelector('[data-chips="dir-groups"]');
    if (dirChips) {
      let html = store.directoryGroups.map(g => renderDirGroupChipHtml(g)).join('');
      html += '<div class="bb-chip bb-chip-new" data-action="new-dir-group-standalone">+ New Group</div>';
      dirChips.innerHTML = html;
    }
  }

  function updatePanelBadges() {
    const store = state.store;
    // Update count badges in panel headers
    const badges = {
      'presets': store.presets.length,
      'providers': store.providers.length,
      'mcp-groups': store.mcpGroups.length,
      'dir-groups': store.directoryGroups.length,
    };
    for (const [panel, count] of Object.entries(badges)) {
      const section = document.querySelector('[data-panel="' + panel + '"]');
      if (section) {
        const badge = section.querySelector('.panel-badge');
        if (badge) badge.textContent = String(count);
      }
    }
  }

  function updateScopeDropdown(scope) {
    const sel = document.querySelector('[data-scope-preset="' + scope + '"]');
    if (!sel) return;

    const store = state.store;
    const assignment = scope === 'global'
      ? store.globalScope
      : (state.workspacePath && store.workspaceScopes[state.workspacePath]) || { mode: 'inherit' };

    let html = '';
    if (scope === 'workspace') {
      html += '<option value="inherit"' + (assignment.mode === 'inherit' ? ' selected' : '') + '>Inherit from Global</option>';
    }
    html += '<option value="manual"' + (assignment.mode === 'manual' ? ' selected' : '') + '>Configure manually</option>';

    for (const p of store.presets) {
      const selected = assignment.mode === 'preset' && assignment.presetId === p.id;
      html += '<option value="preset:' + escHtml(p.id) + '"' + (selected ? ' selected' : '') + '>' + escHtml(p.name) + '</option>';
    }

    sel.innerHTML = html;
  }

  // ─── Event delegation ─────────────────────────────────────────
  document.addEventListener('click', function(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    switch (action) {
      case 'toggle-scope':
        toggleScope(target);
        break;
      case 'toggle-panel': {
        const panel = target.closest('.panel-section');
        if (panel) panel.classList.toggle('collapsed');
        break;
      }
      case 'close-drawer':
        closeTopDrawer();
        break;
      case 'edit-preset':
      case 'edit-preset-mcp':
      case 'edit-preset-dirs':
        openPresetDrawer(id);
        break;
      case 'new-preset':
        openPresetDrawer(null);
        break;
      case 'save-preset':
        savePresetFromDrawer();
        break;
      case 'delete-preset':
        deletePreset();
        break;
      case 'duplicate-preset':
        duplicatePreset();
        break;
      case 'edit-provider':
        openProviderDrawer(id);
        break;
      case 'new-provider-from-preset':
      case 'new-provider-standalone':
        openProviderDrawer(null);
        break;
      case 'save-provider':
        saveProviderFromDrawer();
        break;
      case 'delete-provider':
        deleteProvider();
        break;
      case 'duplicate-provider':
        duplicateProvider();
        break;
      case 'edit-mcp-group':
        openMcpGroupDrawer(id);
        break;
      case 'new-mcp-group-from-preset':
      case 'new-mcp-group-standalone':
        openMcpGroupDrawer(null);
        break;
      case 'save-mcp-group':
        saveMcpGroupFromDrawer();
        break;
      case 'delete-mcp-group':
        deleteMcpGroup();
        break;
      case 'duplicate-mcp-group':
        duplicateMcpGroup();
        break;
      case 'add-mcp-server':
        openMcpServerDrawer(null, -1);
        break;
      case 'edit-mcp-server-item': {
        const idx = parseInt(target.dataset.index, 10);
        const group = editingMcpGroupId ? state.store.mcpGroups.find(g => g.id === editingMcpGroupId) : null;
        const srvList = group ? group.servers : pendingServers;
        if (srvList[idx]) {
          openMcpServerDrawer(srvList[idx], idx);
        }
        break;
      }
      case 'remove-mcp-server-item': {
        const idx = parseInt(target.dataset.index, 10);
        const group = editingMcpGroupId ? state.store.mcpGroups.find(g => g.id === editingMcpGroupId) : null;
        const srvList = group ? group.servers : pendingServers;
        srvList.splice(idx, 1);
        renderMcpServerList(srvList);
        if (group) markDirty();
        break;
      }
      case 'save-mcp-server':
        saveMcpServerFromDrawer();
        break;
      case 'edit-dir-group':
        openDirGroupDrawer(id);
        break;
      case 'new-dir-group-from-preset':
      case 'new-dir-group-standalone':
        openDirGroupDrawer(null);
        break;
      case 'save-dir-group':
        saveDirGroupFromDrawer();
        break;
      case 'delete-dir-group':
        deleteDirGroup();
        break;
      case 'duplicate-dir-group':
        duplicateDirGroup();
        break;
      case 'add-directory': {
        const group = editingDirGroupId ? state.store.directoryGroups.find(g => g.id === editingDirGroupId) : null;
        const dirList = group ? group.directories : pendingDirs;
        dirList.push('');
        renderDirectoryList(dirList);
        if (group) markDirty();
        break;
      }
      case 'browse-directory': {
        const idx = parseInt(target.dataset.index, 10);
        vscode.postMessage({ type: 'pickDirectory', groupId: editingDirGroupId || '', index: idx });
        break;
      }
      case 'remove-directory': {
        const idx = parseInt(target.dataset.index, 10);
        const group = editingDirGroupId ? state.store.directoryGroups.find(g => g.id === editingDirGroupId) : null;
        const dirList = group ? group.directories : pendingDirs;
        dirList.splice(idx, 1);
        renderDirectoryList(dirList);
        if (group) markDirty();
        break;
      }
      case 'add-mcp-env-var': {
        // Add a new env var row
        const container = document.getElementById('mcp-server-env');
        if (container) {
          const emptyState = container.querySelector('.empty-state');
          if (emptyState) emptyState.remove();
          const idx = container.querySelectorAll('.item-row').length;
          container.innerHTML += \`
            <div class="item-row" data-env-index="\${idx}">
              <div class="item-row-info">
                <input type="text" value="" placeholder="KEY" style="width:40%;display:inline-block;margin-right:4px" data-env-key="\${idx}" />
                <input type="text" value="" placeholder="value" style="width:55%;display:inline-block" data-env-val="\${idx}" />
              </div>
              <button class="btn-icon btn-sm" data-action="remove-mcp-env-var" data-index="\${idx}">&times;</button>
            </div>\`;
        }
        break;
      }
      case 'remove-mcp-env-var': {
        target.closest('.item-row')?.remove();
        break;
      }
      case 'save-all':
        vscode.postMessage({ type: 'saveStore', store: state.store });
        break;
      case 'reload':
        vscode.postMessage({ type: 'reload' });
        break;
      case 'open-file':
        vscode.postMessage({ type: 'openFile' });
        break;
    }
  });

  // Scope preset dropdown change
  document.addEventListener('change', function(e) {
    const target = e.target;
    if (target.dataset.scopePreset) {
      handleScopePresetChange(target.dataset.scopePreset, target.value);
    }
    if (target.id === 'preset-provider') {
      updateProviderPreview();
    }
    if (target.id === 'provider-aws-region') {
      const typeBtn = document.querySelector('[data-seg="provider-type"].sel');
      if (typeBtn && typeBtn.dataset.val === 'bedrock') {
        const provider = editingProviderId ? state.store.providers.find(p => p.id === editingProviderId) : null;
        rebuildModelSelects('bedrock', provider);
      }
    }
    if (target.dataset.dirPath !== undefined) {
      const idx = parseInt(target.dataset.dirPath, 10);
      const group = editingDirGroupId ? state.store.directoryGroups.find(g => g.id === editingDirGroupId) : null;
      const dirList = group ? group.directories : pendingDirs;
      if (idx < dirList.length) {
        dirList[idx] = target.value;
        if (group) markDirty();
      }
    }
  });

  // Segmented control clicks
  document.addEventListener('click', function(e) {
    const segBtn = e.target.closest('.seg-btn');
    if (!segBtn) return;

    const segName = segBtn.dataset.seg;
    const segVal = segBtn.dataset.val;

    // Deselect siblings, select this one
    segBtn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('sel'));
    segBtn.classList.add('sel');

    if (segName === 'provider-type') {
      showProviderSections(segVal);
      const provider = editingProviderId ? state.store.providers.find(p => p.id === editingProviderId) : null;
      rebuildModelSelects(segVal, provider);

      // Update icon
      const icon = document.getElementById('provider-drawer-icon');
      if (icon) {
        icon.textContent = segVal === 'anthropic' ? '☁️' : segVal === 'bedrock' ? '🔶' : '🔗';
      }
    }
    if (segName === 'mcp-transport') {
      showMcpTransportSection(segVal);
    }
  });

  // Toggle clicks
  document.addEventListener('click', function(e) {
    const toggle = e.target.closest('.toggle-track');
    if (toggle) {
      toggle.classList.toggle('on');
    }
  });

  // Backdrop click closes drawer
  document.getElementById('drawer-backdrop')?.addEventListener('click', function() {
    closeTopDrawer();
  });

  // Escape key closes drawer
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && drawerStack.length > 0) {
      closeTopDrawer();
    }
  });

  // ─── Message handling from extension ──────────────────────────
  window.addEventListener('message', function(e) {
    const msg = e.data;

    switch (msg.type) {
      case 'init':
        state = msg.data;
        dirty = false;
        refreshUI();
        break;

      case 'saved':
        dirty = false;
        showToast('Settings saved');
        break;

      case 'error':
        showToast('Error: ' + (msg.message || 'Unknown error'));
        break;

      case 'directoryPicked': {
        const { groupId, index, path } = msg;
        const group = groupId ? state.store.directoryGroups.find(g => g.id === groupId) : null;
        const dirList = group ? group.directories : pendingDirs;
        if (index < dirList.length) {
          dirList[index] = path;
        } else {
          dirList.push(path);
        }
        renderDirectoryList(dirList);
        if (group) markDirty();
        break;
      }

      case 'localModels':
        // TODO: populate model dropdowns for proxy provider type
        break;
    }
  });

  function showToast(message, isError) {
    const toast = document.getElementById('save-toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.toggle('error', !!isError);
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show', 'error'), 2500);
    }
  }

  // ─── Init ─────────────────────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
`;
}
