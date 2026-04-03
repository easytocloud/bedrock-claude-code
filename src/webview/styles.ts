/**
 * All CSS for the Claude Code Settings webview.
 * Uses VS Code CSS variables where possible for theme compatibility,
 * with custom properties for the preset-based UI.
 */
export function buildStyles(): string {
  return /* css */ `
    /* ─── Custom Properties ─────────────────────────────────────────── */
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --bg-raised: var(--vscode-sideBar-background, #252526);
      --bg-surface: var(--vscode-editorWidget-background, #2d2d2d);
      --bg-hover: var(--vscode-list-hoverBackground, #363636);
      --bg-active: var(--vscode-list-activeSelectionBackground, #3e3e3e);

      --fg: var(--vscode-editor-foreground, #cccccc);
      --fg-dim: var(--vscode-descriptionForeground, #999999);
      --fg-muted: var(--vscode-disabledForeground, #666666);
      --fg-bright: var(--vscode-foreground, #e8e8e8);

      --blue: var(--vscode-textLink-foreground, #3b9eff);
      --blue-dim: rgba(59,158,255,0.10);
      --blue-mid: rgba(59,158,255,0.20);

      --orange: #c07b2a;
      --orange-dim: rgba(192,123,42,0.10);
      --orange-mid: rgba(192,123,42,0.20);
      --orange-accent: #e8973e;

      --green: #2e9e50;
      --green-dim: rgba(46,158,80,0.10);
      --green-mid: rgba(46,158,80,0.20);
      --green-accent: #4ec970;

      --purple: #8b6bb5;
      --purple-dim: rgba(139,107,181,0.10);
      --purple-mid: rgba(139,107,181,0.20);
      --purple-accent: #b48eda;

      --teal: #2a9d8f;
      --teal-dim: rgba(42,157,143,0.10);
      --teal-mid: rgba(42,157,143,0.20);
      --teal-accent: #40c9b4;

      --red: #d96666;
      --red-dim: rgba(217,102,102,0.10);
      --red-mid: rgba(217,102,102,0.20);

      --border: var(--vscode-panel-border, #3e3e3e);
      --input-bg: var(--vscode-input-background, #333333);
      --input-border: var(--vscode-input-border, #4a4a4a);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-focus: var(--blue);

      --radius: 8px;
      --radius-sm: 5px;
      --radius-lg: 12px;
      --radius-pill: 100px;
      --shadow: var(--vscode-widget-shadow, 0 8px 32px rgba(0,0,0,0.4));
      --transition: 0.18s ease;
      --drawer-width: 480px;
    }

    /* ─── Reset & Base ──────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      line-height: 1.5;
      overflow-x: hidden;
    }

    /* ─── Layout ────────────────────────────────────────────────────── */
    .app { max-width: 860px; margin: 0 auto; padding: 16px 16px 60px; }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }
    .header-logo h1 {
      font-size: 18px;
      font-weight: 600;
      color: var(--fg-bright);
    }

    /* ─── Buttons ───────────────────────────────────────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      transition: all var(--transition);
      white-space: nowrap;
    }
    .btn-primary {
      background: var(--blue);
      color: #fff;
      border-color: var(--blue);
    }
    .btn-primary:hover { filter: brightness(1.1); }
    .btn-secondary {
      background: transparent;
      color: var(--fg-dim);
      border-color: var(--border);
    }
    .btn-secondary:hover { background: var(--bg-hover); color: var(--fg); }
    .btn-ghost {
      background: transparent;
      color: var(--fg-dim);
      border: none;
      padding: 6px 12px;
    }
    .btn-ghost:hover { color: var(--fg); background: var(--bg-hover); }
    .btn-danger {
      background: transparent;
      color: var(--red);
      border-color: var(--red);
    }
    .btn-danger:hover { background: var(--red-dim); }
    .btn-sm { padding: 6px 12px; font-size: 11px; }
    .btn-icon {
      background: transparent;
      border: none;
      color: var(--fg-dim);
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-sm);
      display: inline-flex;
      align-items: center;
    }
    .btn-icon:hover { color: var(--fg); background: var(--bg-hover); }

    /* ─── Loading State ────────────────────────────────────────────── */
    .btn-loading {
      pointer-events: none;
      opacity: 0.7;
      position: relative;
      padding-left: 28px;
    }
    .btn-loading::before {
      content: '';
      position: absolute;
      left: 10px;
      top: 50%;
      width: 12px;
      height: 12px;
      margin-top: -6px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: btn-spin 0.6s linear infinite;
    }
    @keyframes btn-spin {
      to { transform: rotate(360deg); }
    }

    /* ─── Disabled State ────────────────────────────────────────────── */
    button:disabled,
    input:disabled,
    textarea:disabled,
    select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ─── Focus Indicators (Keyboard Navigation) ────────────────────── */
    .btn:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible,
    .seg-btn:focus-visible {
      outline: 2px solid var(--input-focus);
      outline-offset: 2px;
    }

    /* ─── Scope Cards ───────────────────────────────────────────────── */
    .scope-section { margin-bottom: 8px; }
    .scope-section > .scope-card + .scope-card { margin-top: 8px; }

    .scope-card {
      background: var(--bg-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .scope-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 20px;
      cursor: pointer;
      user-select: none;
      transition: background var(--transition);
    }
    .scope-header:hover { background: var(--bg-hover); }

    .scope-indicator {
      width: 4px;
      height: 28px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .scope-indicator.global { background: var(--blue); }
    .scope-indicator.workspace { background: var(--teal-accent); }

    .scope-title-area { flex: 1; }
    .scope-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--fg-bright);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .scope-subtitle { font-size: 11px; color: var(--fg-dim); margin-top: 4px; }

    .scope-badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      font-weight: 500;
    }
    .scope-badge.blue { background: var(--blue-dim); color: var(--blue); }
    .scope-badge.orange { background: var(--orange-dim); color: var(--orange); }
    .scope-badge.teal { background: var(--teal-dim); color: var(--teal); }

    .scope-chevron {
      color: var(--fg-muted);
      transition: transform var(--transition);
      font-size: 22px;
    }
    .scope-card.collapsed .scope-chevron { transform: rotate(-90deg); }
    .scope-card.collapsed .scope-body { display: none; }

    .scope-body {
      padding: 12px 16px 16px;
    }

    .scope-preset-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .scope-preset-row label {
      font-size: 12px;
      color: var(--fg-dim);
      white-space: nowrap;
    }

    /* ─── Panel Sections (Presets, Providers, MCP, Dirs) ──────────── */
    .panel-section {
      background: var(--bg-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-top: 8px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 20px;
      cursor: pointer;
      user-select: none;
      transition: background var(--transition);
    }
    .panel-header:hover { background: var(--bg-hover); }
    .panel-indicator {
      width: 4px;
      height: 28px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .panel-indicator.red { background: var(--red); }
    .panel-indicator.orange { background: var(--orange-accent); }
    .panel-indicator.purple { background: var(--purple-accent); }
    .panel-indicator.green { background: var(--green-accent); }
    .panel-title-area { flex: 1; }
    .panel-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--fg-bright);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panel-subtitle { font-size: 11px; color: var(--fg-dim); margin-top: 4px; }
    .panel-badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      font-weight: 500;
    }
    .panel-badge.red { background: var(--red-dim); color: var(--red); }
    .panel-badge.orange { background: var(--orange-dim); color: var(--orange); }
    .panel-badge.purple { background: var(--purple-dim); color: var(--purple); }
    .panel-badge.green { background: var(--green-dim); color: var(--green); }
    .panel-chevron {
      color: var(--fg-muted);
      font-size: 22px;
      transition: transform var(--transition);
    }
    .panel-section.collapsed .panel-chevron { transform: rotate(-90deg); }
    .panel-section.collapsed .panel-body { display: none; }
    .panel-body {
      padding: 0 16px 16px;
    }

    /* ─── Canvas Section Heading ─────────────────────────────────── */
    .canvas-heading {
      font-size: 13px;
      font-weight: 600;
      color: var(--fg);
      margin-top: 20px;
      margin-bottom: 4px;
    }
    .canvas-hint {
      font-size: 12px;
      color: var(--fg-dim);
      margin-bottom: 4px;
    }

    /* ─── Preset Grid ───────────────────────────────────────────────── */

    .preset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }

    /* ─── Base Card System ────────────────────────────────────────── */
    .card {
      background: var(--bg-raised);
      border: 1px solid var(--border);
      border-left: 4px solid transparent;
      border-radius: var(--radius);
      cursor: pointer;
      transition: background var(--transition), border-color var(--transition);
    }
    .card:hover { background: var(--bg-hover); }
    .card-red    { border-left-color: var(--red); }
    .card-orange { border-left-color: var(--orange-accent); }
    .card-purple { border-left-color: var(--purple-accent); }
    .card-green  { border-left-color: var(--green-accent); }
    .card-new {
      border-style: dashed;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80px;
      color: var(--fg-dim);
      font-size: 13px;
    }
    .card-new:hover { color: var(--blue); border-color: var(--blue); }

    .preset-card {
      padding: 16px;
    }
    .preset-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .preset-card-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--fg-bright);
      flex: 1;
    }
    .preset-card-default {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--fg-muted);
      color: var(--bg);
    }
    .preset-card-section {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }
    .preset-card-section:last-child { margin-bottom: 0; }
    .preset-tag {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .preset-tag.orange { background: var(--orange-dim); color: var(--orange); }
    .preset-tag.purple { background: var(--purple-dim); color: var(--purple); }
    .preset-tag.green { background: var(--green-dim); color: var(--green); }

    .preset-card-new {
      gap: 8px;
      min-height: 100px;
    }

    /* ─── Building Block Chips ─────────────────────────────────────── */
    .bb-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .bb-chips-inherited {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      opacity: 0.45;
      pointer-events: none;
    }
    .spacer { flex: 1; }
    .bb-chip {
      display: flex;
      padding: 8px 12px;
      min-width: 160px;
      max-width: 280px;
    }
    .bb-chip-text { min-width: 0; }
    .bb-chip-name {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg-bright);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bb-chip-detail {
      display: block;
      font-size: 11px;
      color: var(--fg-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bb-chip-spacer { margin-top: 8px; }
    .bb-chip-new {
      min-width: 120px;
    }
    .bb-empty {
      font-size: 12px;
      color: var(--fg-muted);
      font-style: italic;
      padding: 4px 0;
    }

    /* ─── Forms ─────────────────────────────────────────────────────── */
    .form-group { margin-bottom: 16px; }
    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--fg);
      margin-bottom: 4px;
    }
    .form-hint {
      font-size: 11px;
      color: var(--fg-dim);
      margin-bottom: 4px;
    }
    .form-error-message {
      font-size: 11px;
      color: var(--red);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .form-error-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    input[type="text"],
    input[type="password"],
    textarea {
      width: 100%;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: var(--radius-sm);
      color: var(--input-fg);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color var(--transition);
    }
    input:focus, textarea:focus {
      border-color: var(--input-focus);
    }
    input.input-error,
    textarea.input-error {
      border-color: var(--red);
      background: rgba(217, 102, 102, 0.05);
    }
    input.input-error:focus,
    textarea.input-error:focus {
      border-color: var(--red);
    }
    textarea { resize: vertical; min-height: 60px; }

    select {
      width: 100%;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: var(--radius-sm);
      color: var(--input-fg);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      cursor: pointer;
    }
    select:focus { border-color: var(--input-focus); }
    select.input-error {
      border-color: var(--red);
      background: rgba(217, 102, 102, 0.05);
    }
    select.input-error:focus {
      border-color: var(--red);
    }

    /* ─── Segmented Control (provider type, transport) ──────────────── */
    .seg-control {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      border: 1px solid var(--input-border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .seg-control-2col { grid-template-columns: repeat(2, 1fr); }

    /* ─── Label row (label + inline action right-aligned) ───────────── */
    .label-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .label-row .form-label { margin: 0; flex: 1; }

    /* ─── Model test pill (test → testing → OK / FAIL) ────────────── */
    .btn-test {
      padding: 1px 8px;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      background: none;
      border: 1px solid var(--blue);
      border-radius: 20px;
      color: var(--blue);
      transition: all var(--transition);
      line-height: 1.6;
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .btn-test:hover { background: var(--blue-mid); }
    .btn-test.testing {
      animation: test-pulse 0.8s ease-in-out infinite;
      pointer-events: none;
    }
    .btn-test.ok {
      border-color: var(--green-accent);
      color: var(--green-accent);
      pointer-events: none;
    }
    .btn-test.fail {
      border-color: var(--red);
      color: var(--red);
      cursor: pointer;          /* clickable again to retry */
    }
    .btn-test.fail:hover { background: var(--red-dim); }
    @keyframes test-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* ─── Combobox separator (model groups) ─────────────────────────── */
    .combobox-separator {
      border: none;
      border-top: 1px solid var(--input-border);
      margin: 4px 10px;
    }

    /* ─── Pill toggle (compact key/token switcher) ───────────────────── */
    .pill-toggle {
      display: flex;
      border: 1px solid var(--input-border);
      border-radius: 20px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .pill-btn {
      padding: 4px 12px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      background: none;
      border: none;
      color: var(--fg-dim);
      transition: all var(--transition);
      line-height: 1.6;
    }
    .pill-btn.sel {
      background: rgba(59,158,255,0.35);
      color: var(--blue);
      font-weight: 600;
    }
    .pill-btn:hover:not(.sel) { color: var(--fg); }

    /* ─── Password reveal wrapper ───────────────────────────────────── */
    .input-reveal {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-reveal input {
      flex: 1;
      padding-right: 34px;
    }
    .btn-eye {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      color: var(--fg-dim);
      display: flex;
      align-items: center;
      line-height: 1;
      transition: color var(--transition);
    }
    .btn-eye:hover { color: var(--fg); }
    .btn-eye.revealed { color: var(--blue); }
    .seg-btn {
      padding: 7px 4px;
      text-align: center;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      background: var(--input-bg);
      color: var(--fg-dim);
      border: none;
      border-right: 1px solid var(--input-border);
      transition: all var(--transition);
    }
    .seg-btn:last-child { border-right: none; }
    .seg-btn:hover { background: var(--bg-hover); color: var(--fg); }
    .seg-btn.sel {
      background: var(--blue-mid);
      color: var(--blue);
      font-weight: 600;
    }

    /* ─── Toggle Switch ─────────────────────────────────────────────── */
    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
    }
    .toggle-label {
      flex: 1;
      font-size: 12px;
      color: var(--fg);
    }
    .toggle-track {
      position: relative;
      width: 36px;
      height: 20px;
      background: var(--bg-active);
      border-radius: 10px;
      cursor: pointer;
      transition: background var(--transition);
      flex-shrink: 0;
    }
    .toggle-track.on { background: var(--blue); }
    .toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: #fff;
      border-radius: 50%;
      transition: transform var(--transition);
    }
    .toggle-track.on .toggle-thumb { transform: translateX(16px); }

    /* ─── Info Box ──────────────────────────────────────────────────── */
    .info-box {
      background: var(--blue-dim);
      border: 1px solid var(--blue-mid);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 12px;
      color: var(--fg-dim);
      margin-bottom: 16px;
      line-height: 1.5;
    }

    /* ─── Divider ───────────────────────────────────────────────────── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 16px 0;
    }

    /* ─── Section Heading (inside drawers) ──────────────────────────── */
    .section-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      margin-top: 4px;
    }
    .section-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .section-dot-orange { background: var(--orange-accent); }
    .section-dot-purple { background: var(--purple-accent); }
    .section-dot-green  { background: var(--green-accent); }
    .section-subtitle   { color: var(--fg-dim); font-weight: 400; text-transform: none; }
    .form-hint-mt   { margin-top: 8px; }
    .form-hint-sm   { margin-top: 4px; }
    .form-hint-flex { flex: 1; margin: 0 12px; }
    .env-key-input  { width: 40%; display: inline-block; margin-right: 4px; }
    .env-val-input  { width: 55%; display: inline-block; }

    /* ─── Server / Directory List ───────────────────────────────────── */
    .item-list { margin-bottom: 12px; }
    .item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-bottom: 8px;
      font-size: 12px;
    }
    .item-row-info { flex: 1; min-width: 0; }
    .dir-path-input {
      width: 100%;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--border);
      color: var(--fg);
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      padding: 2px 0;
      outline: none;
    }
    .dir-path-input:focus { border-bottom-color: var(--blue); }
    .item-row-name {
      font-weight: 600;
      color: var(--fg-bright);
    }
    .item-row-detail {
      color: var(--fg-dim);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .item-row-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    /* ─── Checkbox List (MCP groups, dir groups in preset) ──────────── */
    .check-list { margin-bottom: 12px; }
    .check-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background var(--transition);
    }
    .check-item:hover { background: var(--bg-hover); }
    .check-item input[type="checkbox"] {
      width: auto;
      accent-color: var(--blue);
    }
    .check-item-label { flex: 1; font-size: 12px; }
    .check-item-hint { font-size: 11px; color: var(--fg-dim); }

    /* ─── Drawer System ─────────────────────────────────────────────── */
    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 200;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s ease, visibility 0.25s ease;
    }
    .drawer-backdrop.open {
      opacity: 1;
      visibility: visible;
    }

    .drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: var(--drawer-width);
      max-width: 92vw;
      background: var(--bg-raised);
      border-left: 1px solid var(--border);
      transform: translateX(100%);
      transition: transform 0.25s ease;
      z-index: 201;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .drawer.open {
      transform: translateX(0);
    }

    .drawer-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .drawer-header-icon { font-size: 20px; }
    .drawer-header-text { flex: 1; }
    .drawer-header-title {
      font-weight: 600;
      font-size: 15px;
      color: var(--fg-bright);
    }
    .drawer-header-subtitle {
      font-size: 11px;
      color: var(--fg-dim);
    }
    .drawer-close {
      background: transparent;
      border: none;
      color: var(--fg-dim);
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-sm);
      line-height: 1;
    }
    .drawer-close:hover { color: var(--fg); background: var(--bg-hover); }

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .drawer-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    .drawer-footer .spacer { flex: 1; }

    /* ─── Provider Preview (in preset drawer) ───────────────────────── */
    .provider-preview {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 11px;
      color: var(--fg-dim);
      margin-top: 8px;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .provider-preview-row {
      display: flex;
      gap: 8px;
    }
    .provider-preview-label {
      color: var(--fg-muted);
      min-width: 50px;
    }

    /* ─── New badge ─────────────────────────────────────────────────── */
    .badge-new {
      font-size: 9px;
      font-weight: 700;
      background: var(--green-accent);
      color: #000;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      letter-spacing: 0.5px;
    }

    /* ─── Save Toast ────────────────────────────────────────────────── */
    .save-toast {
      position: fixed;
      top: 16px;
      right: 16px;
      background: var(--green-accent);
      color: #000;
      padding: 8px 16px;
      border-radius: var(--radius);
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s ease;
      z-index: 999;
      pointer-events: none;
    }
    .save-toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .save-toast.error {
      background: var(--red);
      color: #fff;
    }

    /* ─── Filterable Combobox ─────────────────────────────────────────── */
    .combobox {
      position: relative;
    }
    .combobox-input {
      width: 100%;
      padding: 6px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: var(--radius-sm);
      color: var(--input-fg);
      font-size: 13px;
      font-family: inherit;
    }
    .combobox-input:focus { outline: none; border-color: var(--input-focus); }
    .combobox-list {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      scroll-behavior: smooth;
      background: var(--bg-surface);
      border: 1px solid var(--input-border);
      border-top: none;
      border-radius: 0 0 var(--radius-sm) var(--radius-sm);
      z-index: 100;
      display: none;
    }
    .combobox.open .combobox-list { display: block; }
    .combobox-option {
      padding: 4px 12px;
      font-size: 13px;
      cursor: pointer;
      color: var(--fg);
    }
    .combobox-option:hover,
    .combobox-option.active {
      background: var(--bg-hover);
    }
    .combobox-option mark {
      background: var(--blue-mid);
      color: inherit;
      border-radius: 2px;
    }

    /* ─── Empty State ───────────────────────────────────────────────── */
    .empty-state {
      text-align: center;
      padding: 16px;
      color: var(--fg);
      font-size: 13px;
    }

    /* ─── Inline Add Button ─────────────────────────────────────────── */
    .add-inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--blue);
      cursor: pointer;
      background: none;
      border: none;
      font-family: inherit;
      padding: 4px 0;
    }
    .add-inline:hover { text-decoration: underline; }

    /* ─── Scrollbar ─────────────────────────────────────────────────── */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--bg-active);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover { background: var(--fg-muted); }
  `;
}
