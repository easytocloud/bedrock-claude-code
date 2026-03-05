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
      --bg-hover: #363636;
      --bg-active: #3e3e3e;

      --fg: var(--vscode-editor-foreground, #cccccc);
      --fg-dim: var(--vscode-descriptionForeground, #999999);
      --fg-muted: #666666;
      --fg-bright: #e8e8e8;

      --blue: var(--vscode-textLink-foreground, #3b9eff);
      --blue-dim: rgba(59,158,255,0.10);
      --blue-mid: rgba(59,158,255,0.20);

      --orange: #e8973e;
      --orange-dim: rgba(232,151,62,0.10);
      --orange-mid: rgba(232,151,62,0.20);

      --green: #4ec970;
      --green-dim: rgba(78,201,112,0.10);
      --green-mid: rgba(78,201,112,0.20);

      --purple: #b48eda;
      --purple-dim: rgba(180,142,218,0.10);
      --purple-mid: rgba(180,142,218,0.20);

      --red: #e05a5a;
      --red-dim: rgba(224,90,90,0.10);
      --red-mid: rgba(224,90,90,0.20);

      --border: var(--vscode-panel-border, #3e3e3e);
      --input-bg: var(--vscode-input-background, #333333);
      --input-border: var(--vscode-input-border, #4a4a4a);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-focus: var(--blue);

      --radius: 8px;
      --radius-sm: 5px;
      --radius-lg: 12px;
      --radius-pill: 100px;
      --shadow: 0 8px 32px rgba(0,0,0,0.4);
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
    .app { max-width: 860px; margin: 0 auto; padding: 16px 20px 60px; }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 10px;
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
      gap: 6px;
      padding: 6px 14px;
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
      padding: 6px 10px;
    }
    .btn-ghost:hover { color: var(--fg); background: var(--bg-hover); }
    .btn-danger {
      background: transparent;
      color: var(--red);
      border-color: var(--red);
    }
    .btn-danger:hover { background: var(--red-dim); }
    .btn-sm { padding: 3px 8px; font-size: 11px; }
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
      gap: 10px;
      padding: 14px 18px;
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
    .scope-indicator.workspace { background: var(--orange); }

    .scope-title-area { flex: 1; }
    .scope-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--fg-bright);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .scope-subtitle { font-size: 11px; color: var(--fg-dim); margin-top: 2px; }

    .scope-badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      font-weight: 500;
    }
    .scope-badge.blue { background: var(--blue-dim); color: var(--blue); }
    .scope-badge.orange { background: var(--orange-dim); color: var(--orange); }

    .scope-chevron {
      color: var(--fg-muted);
      transition: transform var(--transition);
      font-size: 22px;
    }
    .scope-card.collapsed .scope-chevron { transform: rotate(-90deg); }
    .scope-card.collapsed .scope-body { display: none; }

    .scope-body {
      padding: 12px 18px 18px;
    }

    .scope-preset-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
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
      gap: 10px;
      padding: 14px 18px;
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
    .panel-indicator.orange { background: var(--orange); }
    .panel-indicator.purple { background: var(--purple); }
    .panel-indicator.green { background: var(--green); }
    .panel-title-area { flex: 1; }
    .panel-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--fg-bright);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panel-subtitle { font-size: 11px; color: var(--fg-dim); margin-top: 2px; }
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
      padding: 0 18px 18px;
    }

    /* ─── Canvas Section Heading ─────────────────────────────────── */
    .canvas-heading {
      font-size: 13px;
      font-weight: 600;
      color: var(--fg);
      margin-top: 20px;
      margin-bottom: 2px;
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

    .preset-card {
      background: var(--bg-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      cursor: pointer;
      transition: all var(--transition);
    }
    .preset-card:hover {
      border-color: var(--fg-muted);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .preset-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
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
      padding: 1px 6px;
      border-radius: var(--radius-pill);
      background: var(--fg-muted);
      color: var(--bg);
    }
    .preset-card-section {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
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
      border-style: dashed;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--fg-dim);
      font-size: 13px;
      min-height: 100px;
    }
    .preset-card-new:hover { color: var(--blue); border-color: var(--blue); }

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
      background: var(--bg-raised);
      border: 1px solid var(--border);
      border-left: 3px solid transparent;
      border-radius: var(--radius);
      cursor: pointer;
      transition: all var(--transition);
      min-width: 160px;
      max-width: 280px;
    }
    .bb-chip.orange { border-left-color: var(--orange); }
    .bb-chip.purple { border-left-color: var(--purple); }
    .bb-chip.green { border-left-color: var(--green); }
    .bb-chip:hover {
      border-color: var(--fg-muted);
      background: var(--bg-hover);
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
    .bb-chip-spacer { margin-top: 6px; }
    .bb-chip-new {
      border-style: dashed;
      color: var(--fg-dim);
      justify-content: center;
      min-width: 120px;
    }
    .bb-chip-new:hover { color: var(--blue); border-color: var(--blue); }
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
      margin-bottom: 5px;
    }
    .form-hint {
      font-size: 11px;
      color: var(--fg-dim);
      margin-bottom: 5px;
    }

    input[type="text"],
    input[type="password"],
    textarea {
      width: 100%;
      padding: 7px 10px;
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
    textarea { resize: vertical; min-height: 60px; }

    select {
      width: 100%;
      padding: 7px 10px;
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

    /* ─── Segmented Control (provider type, transport) ──────────────── */
    .seg-control {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      border: 1px solid var(--input-border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
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
      gap: 10px;
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
      padding: 10px 12px;
      font-size: 12px;
      color: var(--fg-dim);
      margin-bottom: 14px;
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

    /* ─── Server / Directory List ───────────────────────────────────── */
    .item-list { margin-bottom: 12px; }
    .item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-bottom: 6px;
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
    .check-list { margin-bottom: 10px; }
    .check-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
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
      transition: opacity 0.2s ease, visibility 0.2s ease;
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
      gap: 10px;
      padding: 16px 20px;
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
      padding: 20px;
    }

    .drawer-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 20px;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    .drawer-footer .spacer { flex: 1; }

    /* ─── Provider Preview (in preset drawer) ───────────────────────── */
    .provider-preview {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
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
      background: var(--green);
      color: #000;
      padding: 1px 5px;
      border-radius: var(--radius-pill);
      letter-spacing: 0.5px;
    }

    /* ─── Save Toast ────────────────────────────────────────────────── */
    .save-toast {
      position: fixed;
      top: 16px;
      right: 16px;
      background: var(--green);
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

    /* ─── Empty State ───────────────────────────────────────────────── */
    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--fg-dim);
      font-size: 12px;
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
