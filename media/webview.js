/**
 * Webview-side JavaScript for the Claude Code Settings panel.
 * Loaded as a separate file via <script src="...">.
 * Data is injected by the extension host via window.__DATA__.
 */
(function() {
  const vscode = acquireVsCodeApi();

  // ─── Well-known IDs and model catalogs (injected by extension host) ──
  const {
    DEFAULT_PROVIDER_ID,
    DEFAULT_PRESET_ID,
    HAIKU_MODELS,
    SONNET_MODELS,
    OPUS_MODELS,
    ANTHROPIC_DEFAULTS,
  } = window.__DATA__;

  // ─── State ─────────────────────────────────────────────────────
  let state = null;  // PanelState
  let dirty = false;
  let drawerStack = [];
  const drawerScrollPositions = {};  // Track scroll position per drawer

  // Editing context — which item is currently open in a drawer
  const editing = {
    presetId: null,
    providerId: null,
    mcpGroupId: null,
    mcpServerIndex: -1,  // -1 = new
    dirGroupId: null,
    pendingServers: [],  // servers added to a not-yet-saved MCP group
    pendingDirs: [],     // dirs added to a not-yet-saved directory group
  };

  // Model lists fetched from external sources (reset when opening a provider drawer)
  const fetched = {
    proxyModels: [],
    bedrockModels: [],
  };

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
    // Auto-save draft so unsaved changes survive panel close
    if (state && state.store) {
      vscode.postMessage({ type: 'saveDraft', store: state.store });
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

    // Auto-focus first autofocus input and restore scroll position
    setTimeout(() => {
      const body = drawer.querySelector('.drawer-body');
      if (body && drawerScrollPositions[id]) {
        body.scrollTop = drawerScrollPositions[id];
      }
      const af = drawer.querySelector('[autofocus]') || drawer.querySelector('input:not([type=hidden])');
      if (af) af.focus();
    }, 250);
  }

  function closeTopDrawer() {
    if (drawerStack.length === 0) return;
    const id = drawerStack.pop();
    const drawer = document.getElementById('drawer-' + id);
    if (drawer) {
      // Save scroll position before closing
      const body = drawer.querySelector('.drawer-body');
      if (body) {
        drawerScrollPositions[id] = body.scrollTop;
      }
      drawer.classList.remove('open');
    }

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
    if (p.type === 'bedrock' && p.awsProfile) return p.type + ' · ' + p.awsProfile;
    if (p.type === 'proxy' && p.proxyBaseUrl) return p.proxyBaseUrl;
    return p.type;
  }

  function modelDisplayLabel(provider, haiku, sonnet, opus) {
    if (provider.type === 'anthropic') { return [haiku, sonnet, opus]; }
    return [provider.smallFastModel || '—', provider.primaryModel || '—', provider.opusModel || '—'];
  }

  // Generic chip renderer — mirrors renderChip() in src/webview/layout.ts.
  // items: Array of { text, spacer? }
  function renderChipHtml(color, action, id, name, items) {
    const itemHtml = items.map(i =>
      `<span class="bb-chip-detail${i.spacer ? ' bb-chip-spacer' : ''}">${escHtml(i.text)}</span>`
    ).join('');
    return `<div class="bb-chip ${color}" data-action="${action}" data-id="${escHtml(id)}">
      <div class="bb-chip-text">
        <span class="bb-chip-name">${escHtml(name)}</span>
        ${itemHtml}
      </div>
    </div>`;
  }

  function renderProviderChipHtml(p) {
    const [haiku, sonnet, opus] = modelDisplayLabel(p, 'Haiku', 'Sonnet', 'Opus');
    return renderChipHtml('orange', 'edit-provider', p.id, p.name, [
      { text: providerTypeLabel(p) },
      { text: haiku, spacer: true },
      { text: sonnet },
      { text: opus },
    ]);
  }

  function renderMcpGroupChipHtml(g) {
    return renderChipHtml('purple', 'edit-mcp-group', g.id, g.name,
      g.servers.map(s => ({ text: s.name })));
  }

  function renderDirGroupChipHtml(g) {
    return renderChipHtml('green', 'edit-dir-group', g.id, g.name,
      g.directories.map(d => ({ text: d })));
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

    editing.presetId = isNew ? null : presetId;

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
      mcpContainer.innerHTML += `
        <label class="check-item">
          <input type="checkbox" data-mcp-group="${escHtml(g.id)}" ${checked ? 'checked' : ''} />
          <div>
            <div class="check-item-label">${escHtml(g.name)}</div>
            <div class="check-item-hint">${escHtml(serverNames)}</div>
          </div>
          <span class="spacer"></span>
          <button class="btn-icon btn-sm" data-action="edit-mcp-group" data-id="${escHtml(g.id)}">✏️</button>
        </label>`;
    }

    // Directory group checkboxes
    const dirContainer = document.getElementById('preset-dir-groups');
    dirContainer.innerHTML = '';
    for (const g of store.directoryGroups) {
      const checked = preset ? preset.directoryGroupIds.includes(g.id) : false;
      const dirNames = g.directories.join(', ') || '(no directories)';
      dirContainer.innerHTML += `
        <label class="check-item">
          <input type="checkbox" data-dir-group="${escHtml(g.id)}" ${checked ? 'checked' : ''} />
          <div>
            <div class="check-item-label">${escHtml(g.name)}</div>
            <div class="check-item-hint">${escHtml(dirNames)}</div>
          </div>
          <span class="spacer"></span>
          <button class="btn-icon btn-sm" data-action="edit-dir-group" data-id="${escHtml(g.id)}">✏️</button>
        </label>`;
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
    if (saveBtn) saveBtn.textContent = isNew ? 'Create Preset' : 'Save';

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
    const [haiku, sonnet, opus] = modelDisplayLabel(provider, 'Haiku', 'Sonnet', 'Opus');
    preview.innerHTML = `
      <div class="provider-preview-row"><span class="provider-preview-label">Sonnet:</span> ${escHtml(sonnet)}</div>
      <div class="provider-preview-row"><span class="provider-preview-label">Haiku:</span> ${escHtml(haiku)}</div>
      <div class="provider-preview-row"><span class="provider-preview-label">Opus:</span> ${escHtml(opus)}</div>`;
  }

  // ─── AWS Config / AWS Env display ─────────────────────────────
  /**
   * Populate the AWS Config / AWS Env rows in the provider drawer.
   * - isAwsEnv=false: show read-only "AWS Config" row with the resolved path.
   * - isAwsEnv=true:  show selectable "AWS Env (!)" row with a <select> of env names.
   */
  // selectedEnvName: the awsEnv stored on the current provider (may differ from the live symlink)
  function renderAwsConfigRow(awsConfigInfo, selectedEnvName) {
    var configRow = document.getElementById('provider-aws-config-row');
    var envRow = document.getElementById('provider-aws-env-row');
    if (!configRow || !envRow) return;

    if (!awsConfigInfo) {
      configRow.style.display = 'none';
      envRow.style.display = 'none';
      return;
    }

    if (awsConfigInfo.isAwsEnv) {
      // Hide plain config row, show env selector
      configRow.style.display = 'none';
      envRow.style.display = '';
      var sel = document.getElementById('provider-aws-env');
      if (sel) {
        sel.innerHTML = '';
        var envNames = awsConfigInfo.envNames || [];
        // Use the per-provider stored selection; fall back to the live symlink target
        var activeEnv = selectedEnvName || awsConfigInfo.envName;
        envNames.forEach(function(name) {
          var opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          if (name === activeEnv) opt.selected = true;
          sel.appendChild(opt);
        });
      }
    } else {
      // Hide env row, show read-only config path
      envRow.style.display = 'none';
      configRow.style.display = '';
      var label = document.getElementById('provider-aws-config-label');
      var val = document.getElementById('provider-aws-config-value');
      if (label) label.textContent = 'AWS Config';
      if (val) val.textContent = awsConfigInfo.configPath || '';
    }
  }

  // ─── Populate provider drawer ──────────────────────────────────
  function openProviderDrawer(providerId) {
    const store = state.store;
    const isNew = !providerId;
    const provider = isNew ? null : store.providers.find(p => p.id === providerId);

    editing.providerId = isNew ? null : providerId;
    fetched.proxyModels = [];
    fetched.bedrockModels = [];
    var fetchStatus = document.getElementById('proxy-fetch-status');
    if (fetchStatus) fetchStatus.textContent = '';
    var brFetchStatus = document.getElementById('bedrock-fetch-status');
    if (brFetchStatus) brFetchStatus.textContent = '';

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
      document.getElementById('provider-proxy-credential').value = provider.proxyCredential ?? provider.proxyAuthToken ?? provider.proxyApiKey ?? '';
      document.getElementById('provider-aws-refresh').value = provider.awsAuthRefresh || '';
    } else {
      document.getElementById('provider-anthropic-key').value = '';
      document.getElementById('provider-proxy-url').value = '';
      document.getElementById('provider-proxy-credential').value = '';
      document.getElementById('provider-aws-refresh').value = '';
    }

    // Proxy auth mode pill — migrate old separate fields to new combined model
    var authMode = (provider && provider.proxyAuthMode)
      || (provider && provider.proxyAuthToken ? 'authtoken' : 'apikey');
    document.querySelectorAll('[data-pill="proxy-auth"]').forEach(function(btn) {
      btn.classList.toggle('sel', btn.dataset.val === authMode);
    });

    // Refresh op:// hints after values are populated
    updateCredentialHint();
    updateAnthropicCredentialHint();

    // AWS config / env info row — pass per-provider awsEnv so each provider shows its own selection
    renderAwsConfigRow(state.awsConfigInfo || null, provider ? provider.awsEnv : undefined);

    // AWS profiles — filterable combobox
    // When the provider has a specific awsEnv, request the correct profile list from the backend;
    // pass preserveProfile so the existing awsProfile selection is kept after refresh
    if (provider && provider.awsEnv) {
      vscode.postMessage({ type: 'switchAwsEnv', envName: provider.awsEnv, providerId: provider.id, preserveProfile: provider.awsProfile || '' });
    }
    var awsTarget = document.getElementById('provider-aws-profile-combobox') || document.getElementById('provider-aws-profile');
    if (awsTarget) {
      var awsItems = (state.awsProfiles || ['default']).map(function(p) { return { value: p, label: p }; });
      var awsCombo = createCombobox('provider-aws-profile', awsItems, provider ? provider.awsProfile : '', false);
      awsTarget.replaceWith(awsCombo);
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

    // Standalone mode toggle — only visible for proxy providers.
    // Proxy defaults to on (disableLoginPrompt !== false); explicit false = user opted out.
    const nonessentialToggle = document.querySelector('[data-toggle="provider-disable-nonessential"]');
    if (nonessentialToggle) {
      const standaloneOn = provider && provider.type === 'proxy'
        ? provider.disableLoginPrompt !== false
        : false;
      nonessentialToggle.classList.toggle('on', standaloneOn);
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
    if (saveBtn) saveBtn.textContent = isNew ? 'Create Provider' : 'Save';

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
      const nonessentialToggleEl = document.querySelector('[data-toggle="provider-disable-nonessential"]');
      if (nonessentialToggleEl) nonessentialToggleEl.style.pointerEvents = 'none';
    }

    // Restore persisted test state for model pills
    if (provider && provider.modelTestState && (typeVal === 'proxy' || typeVal === 'bedrock')) {
      var testSlots = { sonnet: 'provider-model-sonnet', haiku: 'provider-model-haiku', opus: 'provider-model-opus' };
      Object.keys(testSlots).forEach(function(slot) {
        var modelId = getModelValue(testSlots[slot]);
        var savedState = provider.modelTestState[modelId];
        var btn = document.querySelector('.btn-test[data-slot="' + slot + '"]');
        if (btn && savedState) {
          btn.className = 'btn-test ' + savedState;
          btn.textContent = savedState === 'ok' ? 'OK' : 'Fail';
        }
      });
    }

    openDrawer('provider');
  }

  function showProviderSections(type) {
    document.getElementById('provider-section-anthropic').style.display = type === 'anthropic' ? '' : 'none';
    document.getElementById('provider-section-bedrock').style.display = type === 'bedrock' ? '' : 'none';
    document.getElementById('provider-section-proxy').style.display = type === 'proxy' ? '' : 'none';
    document.getElementById('provider-models-section').style.display = (type && type !== 'anthropic') ? '' : 'none';
    document.getElementById('provider-models-info').style.display = type === 'bedrock' ? '' : 'none';
    var bedrockFetch = document.getElementById('bedrock-fetch-row');
    if (bedrockFetch) bedrockFetch.style.display = type === 'bedrock' ? '' : 'none';
    var proxyFetch = document.getElementById('proxy-fetch-row');
    if (proxyFetch) proxyFetch.style.display = type === 'proxy' ? '' : 'none';
    // Test pills shown for proxy and bedrock
    var showTest = type === 'proxy' || type === 'bedrock';
    document.querySelectorAll('.btn-test').forEach(function(b) {
      b.style.display = showTest ? '' : 'none';
      b.className = 'btn-test'; b.textContent = 'Test'; b.title = '';
    });
    // Standalone mode toggle only shown for proxy — bedrock is always-on (handled in resolver),
    // anthropic never applies.
    var standaloneRow = document.getElementById('provider-standalone-row');
    if (standaloneRow) standaloneRow.style.display = type === 'proxy' ? '' : 'none';
  }

  function showProxyAuthSection() { /* no-op: single credential field, pill only affects semantics */ }

  function rebuildModelSelects(type, provider) {
    const region = document.getElementById('provider-aws-region').value;

    if (type === 'bedrock') {
      // Smart presets (curated list filtered by region) + any fetched account models
      var sonnetPresets = filterModels(SONNET_MODELS, region);
      var haikuPresets = filterModels(HAIKU_MODELS, region);
      var opusPresets = filterModels(OPUS_MODELS, region);
      if (fetched.bedrockModels.length > 0) {
        // Merge: smart presets first, then fetched models not already in presets
        var presetIds = new Set(sonnetPresets.concat(haikuPresets, opusPresets).map(function(m) { return m.id; }));
        var extra = fetched.bedrockModels.filter(function(m) { return !presetIds.has(m.id); });
        // All three selects get the full merged list so any model can go in any slot
        var allModels = sonnetPresets.concat(haikuPresets, opusPresets, extra);
        // Deduplicate by id
        var seen = new Set();
        var merged = [];
        for (var i = 0; i < allModels.length; i++) {
          if (!seen.has(allModels[i].id)) { seen.add(allModels[i].id); merged.push(allModels[i]); }
        }
        populateModelSelect('provider-model-sonnet', merged, provider?.primaryModel, true);
        populateModelSelect('provider-model-haiku', merged, provider?.smallFastModel, true);
        populateModelSelect('provider-model-opus', merged, provider?.opusModel, true);
      } else {
        populateModelSelect('provider-model-sonnet', sonnetPresets, provider?.primaryModel, true);
        populateModelSelect('provider-model-haiku', haikuPresets, provider?.smallFastModel, true);
        populateModelSelect('provider-model-opus', opusPresets, provider?.opusModel, true);
      }
    } else if (type === 'anthropic') {
      populateModelSelect('provider-model-sonnet', [], provider?.primaryModel || ANTHROPIC_DEFAULTS.sonnet, false);
      populateModelSelect('provider-model-haiku', [], provider?.smallFastModel || ANTHROPIC_DEFAULTS.haiku, false);
      populateModelSelect('provider-model-opus', [], provider?.opusModel || ANTHROPIC_DEFAULTS.opus, false);
    } else if (type === 'proxy') {
      if (fetched.proxyModels.length > 1) {
        const modelList = fetched.proxyModels.map(id => ({ id, label: id }));
        populateModelSelect('provider-model-sonnet', modelList, provider?.primaryModel || '', true);
        populateModelSelect('provider-model-haiku', modelList, provider?.smallFastModel || '', true);
        populateModelSelect('provider-model-opus', modelList, provider?.opusModel || '', true);
      } else {
        populateModelSelect('provider-model-sonnet', [], provider?.primaryModel || '', false);
        populateModelSelect('provider-model-haiku', [], provider?.smallFastModel || '', false);
        populateModelSelect('provider-model-opus', [], provider?.opusModel || '', false);
      }
    }
  }

  function fetchProxyModels() {
    const url = document.getElementById('provider-proxy-url').value.trim();
    if (!url) { showToast('Enter a Base URL first', true); return; }
    const key = document.getElementById('provider-proxy-credential').value.trim();
    const statusEl = document.getElementById('proxy-fetch-status');
    statusEl.textContent = 'Fetching…';
    // The webview sandbox cannot make arbitrary fetch calls — delegate to the extension host
    vscode.postMessage({ type: 'fetchLocalModels', baseUrl: url, apiKey: key });
  }

  function applyFetchedProxyModels(ids) {
    fetched.proxyModels = ids;
    const statusEl = document.getElementById('proxy-fetch-status');
    if (!statusEl) return;

    if (ids.length === 1) {
      statusEl.textContent = 'Found 1 model: ' + ids[0];
      ['provider-model-sonnet', 'provider-model-haiku', 'provider-model-opus'].forEach(elId => {
        const el = document.getElementById(elId);
        if (el) el.value = ids[0];
      });
    } else {
      statusEl.textContent = 'Found ' + ids.length + ' models — select below';
      const typeBtn = document.querySelector('[data-seg="provider-type"].sel');
      const currentProvider = editing.providerId
        ? state.store.providers.find(p => p.id === editing.providerId)
        : null;
      rebuildModelSelects(typeBtn ? typeBtn.dataset.val : 'proxy', currentProvider);
    }
  }

  function fetchBedrockModels() {
    var profile = getModelValue('provider-aws-profile');
    var region = document.getElementById('provider-aws-region').value;
    var statusEl = document.getElementById('bedrock-fetch-status');
    if (statusEl) statusEl.textContent = 'Fetching from AWS…';
    // Include awsEnv so the backend uses the correct AWS_CONFIG_FILE
    var awsEnv = undefined;
    if (editing.providerId) {
      var provider = state.store.providers.find(function(p) { return p.id === editing.providerId; });
      if (provider && provider.awsEnv) { awsEnv = provider.awsEnv; }
    }
    vscode.postMessage({ type: 'fetchBedrockModels', awsProfile: profile, awsRegion: region, awsEnv: awsEnv });
  }

  function applyFetchedBedrockModels(models) {
    // models: [{id, label}]
    fetched.bedrockModels = models;
    var statusEl = document.getElementById('bedrock-fetch-status');
    if (statusEl) statusEl.textContent = 'Found ' + models.length + ' models — smart presets + account models merged below';
    var currentProvider = editing.providerId
      ? state.store.providers.find(function(p) { return p.id === editing.providerId; })
      : null;
    rebuildModelSelects('bedrock', currentProvider);
  }

  // ─── Filterable Combobox ──────────────────────────────────────
  function createCombobox(id, items, selectedValue, allowCustom, slotHint) {
    const wrapper = document.createElement('div');
    wrapper.className = 'combobox';
    wrapper.id = id + '-combobox';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'combobox-input';
    input.id = id;
    input.autocomplete = 'off';
    input.placeholder = items.length > 0
      ? (allowCustom ? 'Type to filter (' + items.length + ' items)…' : 'Select from ' + items.length + ' models…')
      : 'Enter model ID';
    const selectedItem = items.find(function(i) { return i.value === selectedValue; });
    input.value = selectedItem ? selectedItem.label : (selectedValue || '');
    input.dataset.selectedValue = selectedValue || '';

    const list = document.createElement('div');
    list.className = 'combobox-list';

    function renderOptions(filter) {
      list.innerHTML = '';
      var lc = (filter || '').toLowerCase();

      // Filter
      var filtered = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (lc && item.label.toLowerCase().indexOf(lc) < 0 && item.value.toLowerCase().indexOf(lc) < 0) continue;
        filtered.push(item);
      }

      // Sort alphabetically by label
      filtered.sort(function(a, b) { return a.label.localeCompare(b.label); });

      // Split into matching-slot group and rest when a slotHint is provided and no filter active
      var top = [], rest = [];
      if (slotHint && !lc) {
        var hintLc = slotHint.toLowerCase();
        for (var j = 0; j < filtered.length; j++) {
          if (filtered[j].label.toLowerCase().indexOf(hintLc) >= 0 || filtered[j].value.toLowerCase().indexOf(hintLc) >= 0) {
            top.push(filtered[j]);
          } else {
            rest.push(filtered[j]);
          }
        }
      } else {
        rest = filtered;
      }

      var count = 0;
      function appendOption(item) {
        if (count >= 50) { return false; }
        var div = document.createElement('div');
        div.className = 'combobox-option';
        div.dataset.value = item.value;
        if (lc) {
          var idx = item.label.toLowerCase().indexOf(lc);
          if (idx >= 0) {
            div.innerHTML = escHtml(item.label.slice(0, idx)) +
              '<mark>' + escHtml(item.label.slice(idx, idx + lc.length)) + '</mark>' +
              escHtml(item.label.slice(idx + lc.length));
          } else {
            div.textContent = item.label;
          }
        } else {
          div.textContent = item.label;
        }
        if (item.value === input.dataset.selectedValue) div.classList.add('active');
        list.appendChild(div);
        count++;
        return true;
      }

      for (var t = 0; t < top.length; t++) { if (!appendOption(top[t])) break; }
      if (top.length > 0 && rest.length > 0) {
        var sep = document.createElement('hr');
        sep.className = 'combobox-separator';
        list.appendChild(sep);
      }
      for (var r = 0; r < rest.length; r++) { if (!appendOption(rest[r])) break; }

      if (count >= 50) {
        var more = document.createElement('div');
        more.className = 'combobox-option';
        more.style.color = 'var(--fg-dim)';
        more.textContent = '… Showing 50 of ' + rest.length + '. Type to filter.';
        list.appendChild(more);
      }
      if (allowCustom && filter) {
        var custom = document.createElement('div');
        custom.className = 'combobox-option';
        custom.dataset.value = filter;
        custom.innerHTML = '✏️ Use "' + escHtml(filter) + '"';
        list.appendChild(custom);
      }
    }

    input.addEventListener('focus', function() {
      renderOptions(input.value === (selectedItem ? selectedItem.label : '') ? '' : input.value);
      wrapper.classList.add('open');
    });
    input.addEventListener('input', function() {
      renderOptions(input.value);
      wrapper.classList.add('open');
    });
    list.addEventListener('click', function(e) {
      var opt = e.target.closest('.combobox-option');
      if (!opt || !opt.dataset.value) return;
      input.dataset.selectedValue = opt.dataset.value;
      var match = items.find(function(i) { return i.value === opt.dataset.value; });
      input.value = match ? match.label : opt.dataset.value;
      wrapper.classList.remove('open');
    });
    document.addEventListener('click', function(e) {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('open');
        if (allowCustom && input.value && !items.find(function(i) { return i.label === input.value; })) {
          input.dataset.selectedValue = input.value;
        } else if (!allowCustom) {
          // Snap back to the selected item's label — don't allow free-form text
          var sel = items.find(function(i) { return i.value === input.dataset.selectedValue; });
          input.value = sel ? sel.label : (input.dataset.selectedValue || '');
        }
      }
    });
    input.addEventListener('keydown', function(e) {
      var visible = list.querySelectorAll('.combobox-option[data-value]');
      var active = list.querySelector('.combobox-option.active');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var arr = Array.from(visible);
        var cur = active ? arr.indexOf(active) : -1;
        var next = e.key === 'ArrowDown' ? Math.min(cur + 1, arr.length - 1) : Math.max(cur - 1, 0);
        if (active) active.classList.remove('active');
        if (arr[next]) { arr[next].classList.add('active'); arr[next].scrollIntoView({ block: 'nearest' }); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active && active.dataset.value) {
          input.dataset.selectedValue = active.dataset.value;
          var match = items.find(function(i) { return i.value === active.dataset.value; });
          input.value = match ? match.label : active.dataset.value;
          wrapper.classList.remove('open');
        }
      } else if (e.key === 'Escape') {
        wrapper.classList.remove('open');
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(list);
    return wrapper;
  }

  var SLOT_HINTS = {
    'provider-model-sonnet': 'sonnet',
    'provider-model-haiku': 'haiku',
    'provider-model-opus': 'opus'
  };

  function populateModelSelect(selectId, models, currentValue, showDropdown) {
    var existing = document.getElementById(selectId);
    var comboWrapper = document.getElementById(selectId + '-combobox');
    var target = comboWrapper || existing;
    if (!target) return;

    if (showDropdown && models.length > 0) {
      var items = models.map(function(m) { return { value: m.id, label: m.label }; });
      var combo = createCombobox(selectId, items, currentValue, false, SLOT_HINTS[selectId]);
      target.replaceWith(combo);
    } else {
      var input = document.createElement('input');
      input.type = 'text';
      input.id = selectId;
      input.value = currentValue || '';
      input.placeholder = 'Enter model ID';
      target.replaceWith(input);
    }
  }

  // ─── Populate MCP group drawer ─────────────────────────────────
  function openMcpGroupDrawer(groupId) {
    const store = state.store;
    const isNew = !groupId;
    const group = isNew ? null : store.mcpGroups.find(g => g.id === groupId);

    editing.mcpGroupId = isNew ? null : groupId;
    if (isNew) editing.pendingServers = [];

    document.getElementById('mcp-group-drawer-title').textContent = isNew ? 'New MCP Server Group' : escHtml(group.name);
    document.getElementById('mcp-group-name').value = group ? group.name : '';

    renderMcpServerList(group ? group.servers : editing.pendingServers);

    const deleteBtn = document.querySelector('[data-action="delete-mcp-group"]');
    if (deleteBtn) deleteBtn.style.display = isNew ? 'none' : '';

    const saveBtn = document.querySelector('[data-action="save-mcp-group"]');
    if (saveBtn) saveBtn.textContent = isNew ? 'Create Group' : 'Save';

    openDrawer('mcp-group');
  }

  function renderMcpServerList(servers) {
    const container = document.getElementById('mcp-group-servers');
    if (!container) return;

    if (servers.length === 0) {
      container.innerHTML = '<div class="empty-state">No servers.</div>';
      return;
    }

    container.innerHTML = servers.map((s, i) => `
      <div class="item-row" data-server-index="${i}">
        <div class="item-row-info">
          <div class="item-row-name">${escHtml(s.name)}</div>
          <div class="item-row-detail">${escHtml(s.type)} · ${escHtml(s.url || s.command || '')}</div>
        </div>
        <div class="item-row-actions">
          <button class="btn-icon btn-sm" data-action="edit-mcp-server-item" data-index="${i}">✏️</button>
          <button class="btn-icon btn-sm" data-action="remove-mcp-server-item" data-index="${i}">&times;</button>
        </div>
      </div>`).join('');
  }

  // ─── Populate MCP server drawer ────────────────────────────────
  function openMcpServerDrawer(server, index) {
    editing.mcpServerIndex = index;
    const isNew = index < 0;

    document.getElementById('mcp-server-drawer-title').textContent = isNew ? 'Add MCP Server' : 'Edit MCP Server';
    document.getElementById('mcp-server-name').value = server ? server.name : '';
    document.getElementById('mcp-server-url').value = server ? (server.url || '') : '';
    document.getElementById('mcp-server-command').value = server ? (server.command || '') : '';
    document.getElementById('mcp-server-args').value = server ? (server.args || []).join('\n') : '';

    const transport = server ? server.type : 'http';
    document.querySelectorAll('[data-seg="mcp-transport"]').forEach(btn => {
      btn.classList.toggle('sel', btn.dataset.val === transport);
    });
    showMcpTransportSection(transport);

    // Env vars
    renderMcpEnvVars(server ? (server.env || {}) : {});

    // Reset test button and output
    var btn = document.getElementById('btn-test-mcp');
    var out = document.getElementById('mcp-test-output');
    if (btn) { btn.textContent = 'Test'; btn.disabled = false; }
    if (out) { out.textContent = ''; }

    openDrawer('mcp-server');
  }

  function showMcpTransportSection(transport) {
    document.getElementById('mcp-transport-url').style.display = (transport === 'http' || transport === 'sse') ? '' : 'none';
    document.getElementById('mcp-transport-stdio').style.display = transport === 'stdio' ? '' : 'none';
    // Reset test button when transport changes
    var btn = document.getElementById('btn-test-mcp');
    var out = document.getElementById('mcp-test-output');
    if (btn) { btn.textContent = 'Test'; btn.disabled = false; }
    if (out) { out.textContent = ''; }
  }

  function renderMcpEnvVars(env) {
    const container = document.getElementById('mcp-server-env');
    if (!container) return;

    const entries = Object.entries(env);
    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state">No variables.</div>';
      return;
    }

    container.innerHTML = entries.map(([key, val], i) => `
      <div class="item-row" data-env-index="${i}">
        <div class="item-row-info">
          <input type="text" value="${escHtml(key)}" placeholder="KEY" class="env-key-input" data-env-key="${i}" />
          <input type="text" value="${escHtml(val)}" placeholder="value" class="env-val-input" data-env-val="${i}" />
        </div>
        <button class="btn-icon btn-sm" data-action="remove-mcp-env-var" data-index="${i}">&times;</button>
      </div>`).join('');
  }

  // ─── Populate directory group drawer ───────────────────────────
  function openDirGroupDrawer(groupId) {
    const store = state.store;
    const isNew = !groupId;
    const group = isNew ? null : store.directoryGroups.find(g => g.id === groupId);

    editing.dirGroupId = isNew ? null : groupId;
    if (isNew) editing.pendingDirs = [];

    document.getElementById('dir-group-drawer-title').textContent = isNew ? 'New Directory Group' : escHtml(group.name);
    document.getElementById('dir-group-name').value = group ? group.name : '';

    renderDirectoryList(group ? group.directories : editing.pendingDirs);

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
      container.innerHTML = '<div class="empty-state">No directories.</div>';
      return;
    }

    container.innerHTML = dirs.map((d, i) => `
      <div class="item-row" data-dir-index="${i}">
        <div class="item-row-info">
          <input type="text" class="dir-path-input" value="${escHtml(d)}" data-dir-path="${i}" placeholder="/path/to/directory" />
        </div>
        <div class="item-row-actions">
          <button class="btn-icon btn-sm" data-action="browse-directory" data-index="${i}" title="Browse">📁</button>
          <button class="btn-icon btn-sm" data-action="remove-directory" data-index="${i}">&times;</button>
        </div>
      </div>`).join('');
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

    if (editing.presetId) {
      const preset = store.presets.find(p => p.id === editing.presetId);
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
    if (editing.providerId === DEFAULT_PROVIDER_ID) {
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

    if (type === 'bedrock' && !getModelValue('provider-aws-profile').trim()) {
      showToast('AWS profile is required for Bedrock', true); return;
    }
    if (type === 'proxy' && !document.getElementById('provider-proxy-url').value.trim()) {
      showToast('Base URL is required for proxy providers', true); return;
    }

    // Collect model test states from pills (keyed by model ID)
    var modelTestState = {};
    ['sonnet', 'haiku', 'opus'].forEach(function(slot) {
      var btn = document.querySelector('.btn-test[data-slot="' + slot + '"]');
      var selectId = 'provider-model-' + slot;
      var modelId = getModelValue(selectId);
      if (btn && modelId) {
        if (btn.classList.contains('ok')) { modelTestState[modelId] = 'ok'; }
        else if (btn.classList.contains('fail')) { modelTestState[modelId] = 'fail'; }
      }
    });

    const providerData = {
      name,
      type,
      anthropicApiKey: document.getElementById('provider-anthropic-key').value || undefined,
      awsProfile: getModelValue('provider-aws-profile') || undefined,
      awsRegion: document.getElementById('provider-aws-region').value || undefined,
      awsAuthRefresh: document.getElementById('provider-aws-refresh').value || undefined,
      awsEnv: (function() {
        var sel = document.getElementById('provider-aws-env');
        return (sel && sel.offsetParent !== null) ? (sel.value || undefined) : undefined;
      })(),
      proxyBaseUrl: document.getElementById('provider-proxy-url').value || undefined,
      proxyCredential: document.getElementById('provider-proxy-credential').value || undefined,
      proxyAuthMode: (document.querySelector('[data-pill="proxy-auth"].sel') || {}).dataset?.val || 'apikey',
      primaryModel: getModelValue('provider-model-sonnet'),
      smallFastModel: getModelValue('provider-model-haiku'),
      opusModel: getModelValue('provider-model-opus'),
      modelTestState: Object.keys(modelTestState).length > 0 ? modelTestState : undefined,
      disablePromptCaching: document.querySelector('[data-toggle="provider-disable-caching"]')?.classList.contains('on') || false,
      disableLoginPrompt: document.querySelector('[data-toggle="provider-disable-nonessential"]')?.classList.contains('on') || false,
    };

    // Check for untested models on proxy/bedrock providers — show reminder unless dismissed
    if ((type === 'proxy' || type === 'bedrock') && !state.dismissTestReminder) {
      var untestedSlots = [];
      ['sonnet', 'haiku', 'opus'].forEach(function(slot) {
        var btn = document.querySelector('.btn-test[data-slot="' + slot + '"]');
        var modelId = getModelValue('provider-model-' + slot);
        if (modelId && btn && !btn.classList.contains('ok') && !btn.classList.contains('fail')) {
          untestedSlots.push(slot);
        }
      });
      if (untestedSlots.length > 0 && !saveProviderFromDrawer._skipReminder) {
        showTestReminder(function(dismiss) {
          if (dismiss) {
            state.dismissTestReminder = true;
            vscode.postMessage({ type: 'setDismissPref', key: 'dismissTestReminder', value: true });
          }
          saveProviderFromDrawer._skipReminder = true;
          saveProviderFromDrawer();
          saveProviderFromDrawer._skipReminder = false;
        });
        return;
      }
    }
    saveProviderFromDrawer._skipReminder = false;

    if (editing.providerId) {
      const provider = store.providers.find(p => p.id === editing.providerId);
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
      openPresetDrawer(editing.presetId);
      // Reopen won't push to stack since it's already there — need to handle differently
    }
  }

  function getModelValue(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return '';
    // Combobox stores selected value in data attribute
    if (el.dataset.selectedValue !== undefined) return el.dataset.selectedValue;
    return el.value || '';
  }

  function saveMcpGroupFromDrawer() {
    const store = state.store;
    const name = document.getElementById('mcp-group-name').value.trim();
    if (!name) { showToast('Group name is required', true); return; }

    // Collect servers from the current list (they were stored in a temp array)
    const servers = collectMcpServersFromDOM();

    if (editing.mcpGroupId) {
      const group = store.mcpGroups.find(g => g.id === editing.mcpGroupId);
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
    const group = editing.mcpGroupId
      ? state.store.mcpGroups.find(g => g.id === editing.mcpGroupId)
      : null;
    return group ? [...group.servers] : [...editing.pendingServers];
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
      const parts = rawCmd.split(/\s+/);
      command = parts[0] || rawCmd;
      const extraArgs = parts.slice(1);
      const textareaArgs = document.getElementById('mcp-server-args').value.split('\n').map(s => s.trim()).filter(Boolean);
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
    const group = editing.mcpGroupId
      ? state.store.mcpGroups.find(g => g.id === editing.mcpGroupId)
      : null;
    const serverList = group ? group.servers : editing.pendingServers;

    if (editing.mcpServerIndex >= 0 && editing.mcpServerIndex < serverList.length) {
      serverList[editing.mcpServerIndex] = server;
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

  function testMcpServer() {
    var btn = document.getElementById('btn-test-mcp');
    var output = document.getElementById('mcp-test-output');
    var transportBtn = document.querySelector('[data-seg="mcp-transport"].sel');
    var type = transportBtn ? transportBtn.dataset.val : 'http';
    var url = document.getElementById('mcp-server-url').value.trim();
    var rawCmd = document.getElementById('mcp-server-command').value.trim();
    var parts = rawCmd.split(/\s+/);
    var command = parts[0] || rawCmd;
    var extraArgs = parts.slice(1);
    var textareaArgs = document.getElementById('mcp-server-args').value.split('\n').map(s => s.trim()).filter(Boolean);
    var args = extraArgs.concat(textareaArgs);
    var env = collectMcpEnvFromDOM();

    if (btn) { btn.textContent = 'Testing…'; btn.disabled = true; }
    if (output) { output.textContent = ''; }

    vscode.postMessage({
      type: 'testMcpServer',
      server: { type: type, url: url || undefined, command: command || undefined, args: args.length ? args : undefined, env: env }
    });
  }

  function saveDirGroupFromDrawer() {
    const store = state.store;
    const name = document.getElementById('dir-group-name').value.trim();
    if (!name) { showToast('Group name is required', true); return; }

    const dirs = collectDirsFromDOM();

    if (editing.dirGroupId) {
      const group = store.directoryGroups.find(g => g.id === editing.dirGroupId);
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
  function confirmDelete(itemName, callback) {
    if (!confirm(`Delete "${itemName}"? This cannot be undone.`)) {
      return;
    }
    callback();
  }

  function deletePreset() {
    if (!editing.presetId || editing.presetId === DEFAULT_PRESET_ID) return;
    const store = state.store;
    store.presets = store.presets.filter(p => p.id !== editing.presetId);

    // Clear scope references
    if (store.globalScope.presetId === editing.presetId) {
      store.globalScope = { mode: 'manual' };
    }
    for (const [key, scope] of Object.entries(store.workspaceScopes)) {
      if (scope.presetId === editing.presetId) {
        store.workspaceScopes[key] = { mode: 'inherit' };
      }
    }

    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function deleteProvider() {
    if (!editing.providerId || editing.providerId === DEFAULT_PROVIDER_ID) return;
    const store = state.store;
    store.providers = store.providers.filter(p => p.id !== editing.providerId);
    // Clear references in presets
    for (const preset of store.presets) {
      if (preset.providerId === editing.providerId) {
        preset.providerId = '';
      }
    }
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function deleteMcpGroup() {
    if (!editing.mcpGroupId) return;
    const store = state.store;
    store.mcpGroups = store.mcpGroups.filter(g => g.id !== editing.mcpGroupId);
    for (const preset of store.presets) {
      preset.mcpGroupIds = preset.mcpGroupIds.filter(id => id !== editing.mcpGroupId);
    }
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  function deleteDirGroup() {
    if (!editing.dirGroupId) return;
    const store = state.store;
    store.directoryGroups = store.directoryGroups.filter(g => g.id !== editing.dirGroupId);
    for (const preset of store.presets) {
      preset.directoryGroupIds = preset.directoryGroupIds.filter(id => id !== editing.dirGroupId);
    }
    markDirty();
    closeTopDrawer();
    refreshUI();
  }

  // ─── Duplicate functions ───────────────────────────────────────
  function duplicatePreset() {
    if (!editing.presetId) return;
    const original = state.store.presets.find(p => p.id === editing.presetId);
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
    if (!editing.providerId) return;
    const original = state.store.providers.find(p => p.id === editing.providerId);
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
    if (!editing.mcpGroupId) return;
    const original = state.store.mcpGroups.find(g => g.id === editing.mcpGroupId);
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
    if (!editing.dirGroupId) return;
    const original = state.store.directoryGroups.find(g => g.id === editing.dirGroupId);
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

      html += `
        <div class="preset-card" data-action="edit-preset" data-id="${escHtml(preset.id)}">
          <div class="preset-card-header">
            <span class="preset-card-name">${escHtml(preset.name)}</span>
            ${isDefault ? '<span class="preset-card-default">Default</span>' : ''}
          </div>
          <div class="preset-card-section">
            <span class="preset-tag orange">${escHtml(providerLabel)}</span>
          </div>
          ${mcpSection}
          ${dirSection}
        </div>`;
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
      case 'delete-preset': {
        const preset = state.store.presets.find(p => p.id === editing.presetId);
        if (preset) confirmDelete(preset.name, deletePreset);
        break;
      }
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
      case 'fetch-proxy-models':
        fetchProxyModels();
        break;
      case 'fetch-bedrock-models':
        fetchBedrockModels();
        break;
      case 'save-provider':
        saveProviderFromDrawer();
        break;
      case 'delete-provider': {
        const provider = state.store.providers.find(p => p.id === editing.providerId);
        if (provider) confirmDelete(provider.name, deleteProvider);
        break;
      }
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
      case 'delete-mcp-group': {
        const group = state.store.mcpGroups.find(g => g.id === editing.mcpGroupId);
        if (group) confirmDelete(group.name, deleteMcpGroup);
        break;
      }
      case 'duplicate-mcp-group':
        duplicateMcpGroup();
        break;
      case 'add-mcp-server':
        openMcpServerDrawer(null, -1);
        break;
      case 'edit-mcp-server-item': {
        const idx = parseInt(target.dataset.index, 10);
        const group = editing.mcpGroupId ? state.store.mcpGroups.find(g => g.id === editing.mcpGroupId) : null;
        const srvList = group ? group.servers : editing.pendingServers;
        if (srvList[idx]) {
          openMcpServerDrawer(srvList[idx], idx);
        }
        break;
      }
      case 'remove-mcp-server-item': {
        const idx = parseInt(target.dataset.index, 10);
        const group = editing.mcpGroupId ? state.store.mcpGroups.find(g => g.id === editing.mcpGroupId) : null;
        const srvList = group ? group.servers : editing.pendingServers;
        srvList.splice(idx, 1);
        renderMcpServerList(srvList);
        if (group) markDirty();
        break;
      }
      case 'save-mcp-server':
        saveMcpServerFromDrawer();
        break;
      case 'test-mcp-server':
        testMcpServer();
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
      case 'delete-dir-group': {
        const group = state.store.dirGroups.find(g => g.id === editing.dirGroupId);
        if (group) confirmDelete(group.name, deleteDirGroup);
        break;
      }
      case 'duplicate-dir-group':
        duplicateDirGroup();
        break;
      case 'add-directory': {
        const group = editing.dirGroupId ? state.store.directoryGroups.find(g => g.id === editing.dirGroupId) : null;
        const dirList = group ? group.directories : editing.pendingDirs;
        dirList.push('');
        renderDirectoryList(dirList);
        if (group) markDirty();
        break;
      }
      case 'browse-directory': {
        const idx = parseInt(target.dataset.index, 10);
        vscode.postMessage({ type: 'pickDirectory', groupId: editing.dirGroupId || '', index: idx });
        break;
      }
      case 'remove-directory': {
        const idx = parseInt(target.dataset.index, 10);
        const group = editing.dirGroupId ? state.store.directoryGroups.find(g => g.id === editing.dirGroupId) : null;
        const dirList = group ? group.directories : editing.pendingDirs;
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
          container.innerHTML += `
            <div class="item-row" data-env-index="${idx}">
              <div class="item-row-info">
                <input type="text" value="" placeholder="KEY" class="env-key-input" data-env-key="${idx}" />
                <input type="text" value="" placeholder="value" class="env-val-input" data-env-val="${idx}" />
              </div>
              <button class="btn-icon btn-sm" data-action="remove-mcp-env-var" data-index="${idx}">&times;</button>
            </div>`;
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
        const provider = editing.providerId ? state.store.providers.find(p => p.id === editing.providerId) : null;
        rebuildModelSelects('bedrock', provider);
      }
    }
    if (target.id === 'provider-aws-env') {
      // User picked a different aws-env — store it per-provider (no symlink mutation)
      vscode.postMessage({ type: 'switchAwsEnv', envName: target.value, providerId: editing.providerId });
    }
    if (target.dataset.dirPath !== undefined) {
      const idx = parseInt(target.dataset.dirPath, 10);
      const group = editing.dirGroupId ? state.store.directoryGroups.find(g => g.id === editing.dirGroupId) : null;
      const dirList = group ? group.directories : editing.pendingDirs;
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
      const provider = editing.providerId ? state.store.providers.find(p => p.id === editing.providerId) : null;
      rebuildModelSelects(segVal, provider);

      // Update icon
      const icon = document.getElementById('provider-drawer-icon');
      if (icon) {
        icon.textContent = segVal === 'anthropic' ? '☁️' : segVal === 'bedrock' ? '🔶' : '🔗';
      }

      // When switching to proxy, default standalone mode on (user can override)
      const nonessentialToggle = document.querySelector('[data-toggle="provider-disable-nonessential"]');
      if (nonessentialToggle && segVal === 'proxy') {
        // Keep existing value if the provider was already proxy, otherwise default on
        const alreadyProxy = provider && provider.type === 'proxy';
        if (!alreadyProxy) {
          nonessentialToggle.classList.add('on');
        }
      }
    }
    if (segName === 'mcp-transport') {
      showMcpTransportSection(segVal);
    }
  });

  // Pill toggle clicks (compact key/token switcher)
  document.addEventListener('click', function(e) {
    var pillBtn = e.target.closest('.pill-btn');
    if (!pillBtn) { return; }
    var pillName = pillBtn.dataset.pill;
    var pillVal = pillBtn.dataset.val;
    pillBtn.closest('.pill-toggle').querySelectorAll('.pill-btn').forEach(function(b) { b.classList.remove('sel'); });
    pillBtn.classList.add('sel');
    if (pillName === 'proxy-auth') {
      showProxyAuthSection(pillVal);
      resetAllTestPills();
    }
  });

  // Auto-detect OpenRouter URL and switch to Auth Token mode; invalidate tests on URL change
  document.getElementById('provider-proxy-url')?.addEventListener('input', function() {
    resetAllTestPills();
    var url = this.value;
    if (/openrouter\.ai/i.test(url)) {
      var pills = document.querySelectorAll('[data-pill="proxy-auth"]');
      var alreadyToken = false;
      pills.forEach(function(b) { if (b.dataset.val === 'authtoken' && b.classList.contains('sel')) { alreadyToken = true; } });
      if (!alreadyToken) {
        pills.forEach(function(b) { b.classList.toggle('sel', b.dataset.val === 'authtoken'); });
        showProxyAuthSection('authtoken');
      }
    }
  });

  // Update op:// hint for the credential field
  function updateCredentialHint() {
    var inputEl = document.getElementById('provider-proxy-credential');
    var hint = document.getElementById('proxy-credential-hint');
    if (!inputEl || !hint) { return; }
    if (inputEl.value.startsWith('op://')) {
      hint.innerHTML = '<strong>1Password:</strong> <code>apiKeyHelper: "op read \'' + inputEl.value + '\'"</code>';
      setReveal(inputEl, true);
    } else {
      hint.textContent = '';
    }
  }

  // Set or clear reveal state on a password input
  function setReveal(inputEl, on) {
    inputEl.type = on ? 'text' : 'password';
    var btn = inputEl.closest('.input-reveal') && inputEl.closest('.input-reveal').querySelector('.btn-eye');
    if (btn) btn.classList.toggle('revealed', on);
  }

  document.getElementById('provider-proxy-credential')?.addEventListener('input', function() {
    updateCredentialHint();
    resetAllTestPills();
  });

  // Reset test pills when AWS region changes (bedrock provider)
  document.getElementById('provider-aws-region')?.addEventListener('change', function() {
    resetAllTestPills();
  });

  // Update op:// hint for the Anthropic API key field
  function updateAnthropicCredentialHint() {
    var inputEl = document.getElementById('provider-anthropic-key');
    var hint = document.getElementById('anthropic-credential-hint');
    if (!inputEl || !hint) { return; }
    if (inputEl.value.startsWith('op://')) {
      hint.innerHTML = '<strong>1Password:</strong> <code>apiKeyHelper: "op read \'' + inputEl.value + '\'"</code>';
      setReveal(inputEl, true);
    } else {
      hint.textContent = '';
    }
  }

  document.getElementById('provider-anthropic-key')?.addEventListener('input', function() {
    updateAnthropicCredentialHint();
  });

  // Reset MCP test output when URL or command fields change
  function resetMcpTest() {
    var btn = document.getElementById('btn-test-mcp');
    var out = document.getElementById('mcp-test-output');
    if (btn) { btn.textContent = 'Test'; btn.disabled = false; }
    if (out) { out.textContent = ''; }
  }
  document.getElementById('mcp-server-url')?.addEventListener('input', resetMcpTest);
  document.getElementById('mcp-server-command')?.addEventListener('input', resetMcpTest);
  document.getElementById('mcp-server-args')?.addEventListener('input', resetMcpTest);

  // Model test pill clicks
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-test');
    if (!btn || btn.classList.contains('testing') || btn.classList.contains('ok')) { return; }
    var selectId = btn.dataset.testModel;
    var slot = btn.dataset.slot;
    var modelId = getModelValue(selectId);
    if (!modelId) { showToast('Select a model first', true); return; }

    // Determine active provider type
    var typeBtn = document.querySelector('[data-seg="provider-type"].sel');
    var providerType = typeBtn ? typeBtn.dataset.val : '';

    if (providerType === 'bedrock') {
      var awsProfile = getModelValue('provider-aws-profile');
      var awsRegion = document.getElementById('provider-aws-region').value;
      if (!awsProfile) { showToast('Select an AWS profile first', true); return; }
      if (!awsRegion) { showToast('Select an AWS region first', true); return; }
      var awsEnv = undefined;
      if (editing.providerId) {
        var provider = state.store.providers.find(function(p) { return p.id === editing.providerId; });
        if (provider && provider.awsEnv) { awsEnv = provider.awsEnv; }
      }
      btn.className = 'btn-test testing';
      btn.textContent = 'Testing';
      vscode.postMessage({ type: 'testBedrockModel', awsProfile: awsProfile, awsRegion: awsRegion, awsEnv: awsEnv, modelId: modelId, slot: slot });
    } else {
      var baseUrl = document.getElementById('provider-proxy-url').value.trim();
      if (!baseUrl) { showToast('Enter a Base URL first', true); return; }
      var credMode = (document.querySelector('[data-pill="proxy-auth"].sel') || {}).dataset?.val || 'apikey';
      var cred = document.getElementById('provider-proxy-credential').value.trim();
      var apiKey = credMode === 'apikey' ? cred : '';
      var authToken = credMode === 'authtoken' ? cred : '';
      btn.className = 'btn-test testing';
      btn.textContent = 'Testing';
      vscode.postMessage({ type: 'testModel', baseUrl: baseUrl, apiKey: apiKey, authToken: authToken, modelId: modelId, slot: slot });
    }
  });

  // Reset ALL test pills (when URL, credential, or auth type changes)
  function resetAllTestPills() {
    document.querySelectorAll('.btn-test').forEach(function(b) {
      b.className = 'btn-test'; b.textContent = 'Test'; b.title = '';
    });
  }

  // Reset test pill when the model selection changes (combobox option click, typing, or plain input edit)
  function resetTestPillForInput(inputEl) {
    var slot = SLOT_HINTS[inputEl.id];
    if (!slot) { return; }
    var btn = document.querySelector('.btn-test[data-slot="' + slot + '"]');
    if (btn) { btn.className = 'btn-test'; btn.textContent = 'Test'; btn.title = ''; }
  }
  document.addEventListener('click', function(e) {
    var opt = e.target.closest('.combobox-option');
    if (!opt) { return; }
    var inputEl = opt.closest('.combobox') && opt.closest('.combobox').querySelector('input');
    if (!inputEl) { return; }
    // AWS profile change affects all test results
    if (inputEl.id === 'provider-aws-profile') { resetAllTestPills(); }
    else { resetTestPillForInput(inputEl); }
  });
  document.addEventListener('input', function(e) {
    var inputEl = e.target;
    if (inputEl && inputEl.id && SLOT_HINTS[inputEl.id]) { resetTestPillForInput(inputEl); }
  });

  // Eye-button: toggle password visibility
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-eye');
    if (!btn) { return; }
    var inputId = btn.dataset.reveal;
    var inputEl = inputId && document.getElementById(inputId);
    if (!inputEl) { return; }
    // Don't hide when value is op:// — keep visible so user can read the reference
    if (inputEl.value.startsWith('op://') && inputEl.type === 'text') { return; }
    setReveal(inputEl, inputEl.type === 'password');
  });

  // Toggle clicks
  document.addEventListener('click', function(e) {
    var toggle = e.target.closest('.toggle-track');
    if (!toggle) { return; }
    toggle.classList.toggle('on');
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
        const dirList = group ? group.directories : editing.pendingDirs;
        if (index < dirList.length) {
          dirList[index] = path;
        } else {
          dirList.push(path);
        }
        renderDirectoryList(dirList);
        if (group) markDirty();
        break;
      }

      case 'localModels': {
        const statusEl = document.getElementById('proxy-fetch-status');
        if (msg.models && msg.models.length > 0) {
          applyFetchedProxyModels(msg.models);
        } else {
          if (statusEl) statusEl.textContent = 'No models returned';
        }
        break;
      }

      case 'localModelsError': {
        const statusEl = document.getElementById('proxy-fetch-status');
        if (statusEl) statusEl.textContent = 'Error: ' + (msg.message || 'Unknown error');
        break;
      }

      case 'bedrockModels': {
        if (msg.models && msg.models.length > 0) {
          applyFetchedBedrockModels(msg.models);
        } else {
          const s = document.getElementById('bedrock-fetch-status');
          if (s) s.textContent = 'No models returned';
        }
        break;
      }

      case 'bedrockModelsError': {
        const s = document.getElementById('bedrock-fetch-status');
        if (s) s.textContent = 'Error: ' + (msg.message || 'Unknown error');
        break;
      }

      case 'testModelResult': {
        var testBtn = document.querySelector('.btn-test[data-slot="' + msg.slot + '"]');
        if (testBtn) {
          testBtn.className = 'btn-test ' + (msg.ok ? 'ok' : 'fail');
          testBtn.textContent = msg.ok ? 'OK' : 'Fail';
          testBtn.title = msg.ok ? 'Model responded successfully' : (msg.message || 'Failed');
        }
        break;
      }

      case 'awsEnvSwitched': {
        // Update state and refresh the AWS profile combobox + config display
        state.awsProfiles = msg.awsProfiles || ['default'];
        state.awsConfigInfo = msg.awsConfigInfo || null;
        // Persist awsEnv on the provider in the local store so the drawer reflects it
        if (msg.providerId && msg.envName) {
          var switchedProvider = state.store.providers.find(function(p) { return p.id === msg.providerId; });
          if (switchedProvider) { switchedProvider.awsEnv = msg.envName; }
        }
        renderAwsConfigRow(state.awsConfigInfo, msg.envName);
        // preserveProfile: keep existing selection when reopening a drawer (vs. clearing on user switch)
        var profileToSelect = msg.preserveProfile || '';
        // User-initiated env switch: reset test pills (credentials changed)
        if (!msg.preserveProfile) { resetAllTestPills(); }
        var awsTarget2 = document.getElementById('provider-aws-profile-combobox') || document.getElementById('provider-aws-profile');
        if (awsTarget2) {
          var awsItems2 = state.awsProfiles.map(function(p) { return { value: p, label: p }; });
          var awsCombo2 = createCombobox('provider-aws-profile', awsItems2, profileToSelect, false);
          awsTarget2.replaceWith(awsCombo2);
        }
        break;
      }

      case 'testMcpResult': {
        var btn2 = document.getElementById('btn-test-mcp');
        var out2 = document.getElementById('mcp-test-output');
        if (btn2) { btn2.textContent = 'Test'; btn2.disabled = false; }
        if (msg.ok) {
          if (out2) out2.textContent = 'Connected ✓\n\nTools (' + msg.tools.length + '):\n' + msg.tools.map(t => '  • ' + t).join('\n');
        } else {
          if (out2) out2.textContent = 'Error: ' + (msg.message || 'Unknown error');
        }
        break;
      }
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

  // Reminder popup for untested proxy models
  function showTestReminder(callback) {
    // Remove any existing reminder
    var existing = document.getElementById('test-reminder');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'test-reminder';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:10000;';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-raised);border:1px solid var(--input-border);border-radius:var(--radius);padding:20px 24px;max-width:360px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.4);';
    box.innerHTML =
      '<div style="font-size:14px;color:var(--fg);margin-bottom:20px;line-height:1.6">' +
      '<strong>Some models untested</strong><br>Use the <strong>Test</strong> buttons to verify Anthropic API compatibility.' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">' +
      '<button class="btn btn-primary" id="test-reminder-save" style="width:100%;display:flex;justify-content:center">Save anyway</button>' +
      '<button class="btn btn-secondary" id="test-reminder-back" style="width:100%;display:flex;justify-content:center">Go back</button>' +
      '</div>' +
      '<label style="font-size:12px;color:var(--fg-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">' +
      '<input type="checkbox" id="test-reminder-dismiss" style="width:auto;accent-color:var(--blue)"> Don\'t show again</label>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('test-reminder-back').addEventListener('click', function() { overlay.remove(); });
    document.getElementById('test-reminder-save').addEventListener('click', function() {
      var dismiss = document.getElementById('test-reminder-dismiss').checked;
      overlay.remove();
      callback(dismiss);
    });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  }

  // ─── Init ─────────────────────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
