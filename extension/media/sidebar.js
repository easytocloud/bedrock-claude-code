// Sidebar preset switcher — renders window.__SIDEBAR_DATA__ and live updates
// pushed from the extension via postMessage({ type: 'state', data }).
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  let state = window.__SIDEBAR_DATA__ || null;

  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg && msg.type === 'state') {
      state = msg.data;
      render();
    }
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function renderChip(spec) {
    const chip = el('div', 'chip');
    chip.style.background = spec.bg;
    chip.style.color = spec.fg;
    if (spec.icon && window.__ICON_BASE__) {
      const img = el('img', 'chip-icon');
      img.src = window.__ICON_BASE__ + '/' + spec.icon;
      img.alt = '';
      // If the icon fails to load, fall back to the monogram label
      img.addEventListener('error', function () {
        chip.textContent = spec.label;
      });
      chip.appendChild(img);
    } else {
      chip.textContent = spec.label;
    }
    return chip;
  }

  function renderSelectedCard(selected) {
    const card = el('div', 'selected-card');
    const row = el('div', 'selected-row');

    if (selected.chip) {
      row.appendChild(renderChip(selected.chip));
    }

    const text = el('div', 'selected-text');
    text.appendChild(el('div', 'selected-name', selected.name));
    if (selected.subtitle) {
      text.appendChild(el('div', 'selected-sub', selected.subtitle));
    }
    if (selected.meta) {
      text.appendChild(el('div', 'selected-meta', selected.meta));
    }
    if (selected.scopeNote) {
      text.appendChild(el('div', 'scope-note', selected.scopeNote));
    }
    row.appendChild(text);
    card.appendChild(row);
    return card;
  }

  function renderPresetRow(preset) {
    const row = el('button', 'preset-row');
    row.type = 'button';
    row.title = 'Apply this preset';
    row.appendChild(renderChip(preset.chip));

    const text = el('div', 'row-text');
    text.appendChild(el('div', 'row-name', preset.name));
    if (preset.subtitle) {
      text.appendChild(el('div', 'row-sub', preset.subtitle));
    }
    row.appendChild(text);

    row.addEventListener('click', function () {
      vscode.postMessage({ type: 'selectPreset', presetId: preset.id });
    });
    return row;
  }

  function render() {
    root.textContent = '';
    if (!state) { return; }

    // ── Selected scope ──
    const scopeTitle = state.hasWorkspace
      ? 'Selected for this workspace'
      : 'Global preset';
    root.appendChild(el('div', 'section-label', scopeTitle));
    root.appendChild(renderSelectedCard(state.selected));

    if (state.canInherit) {
      const inherit = el('button', 'inherit-link', '↩ Inherit from Global');
      inherit.type = 'button';
      inherit.addEventListener('click', function () {
        vscode.postMessage({ type: 'inherit' });
      });
      root.appendChild(inherit);
    }

    // ── All presets ──
    root.appendChild(el('div', 'section-label', 'All presets'));
    if (state.presets.length === 0) {
      const hint = state.selected.mode === 'preset'
        ? 'No other presets yet.'
        : 'No presets yet — create one to get started.';
      root.appendChild(el('div', 'empty-hint', hint));
    } else {
      for (const preset of state.presets) {
        root.appendChild(renderPresetRow(preset));
      }
    }

    // ── Create button ──
    const create = el('button', 'create-btn');
    create.type = 'button';
    create.appendChild(el('div', 'create-plus', '+'));
    create.appendChild(el('div', undefined, 'Create New Preset'));
    create.addEventListener('click', function () {
      vscode.postMessage({ type: 'createPreset' });
    });
    root.appendChild(create);
  }

  render();
  vscode.postMessage({ type: 'ready' });
})();
