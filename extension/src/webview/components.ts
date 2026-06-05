/**
 * Reusable HTML component generators for the webview.
 * All functions return HTML strings.
 */

/** Escape HTML entities to prevent XSS in webview content. */
export function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render a form group with label, optional hint, and input HTML. */
export function formGroup(label: string, inputHtml: string, hint?: string): string {
  return `
    <div class="form-group">
      <label class="form-label">${esc(label)}</label>
      ${hint ? `<div class="form-hint">${esc(hint)}</div>` : ''}
      ${inputHtml}
    </div>`;
}

/** Render a text input. */
export function textInput(attrs: {
  id?: string;
  dataKey?: string;
  placeholder?: string;
  value?: string;
  type?: 'text' | 'password';
  autofocus?: boolean;
}): string {
  const parts = [
    `type="${attrs.type ?? 'text'}"`,
    attrs.id ? `id="${esc(attrs.id)}"` : '',
    attrs.dataKey ? `data-key="${esc(attrs.dataKey)}"` : '',
    attrs.placeholder ? `placeholder="${esc(attrs.placeholder)}"` : '',
    attrs.value ? `value="${esc(attrs.value)}"` : '',
    attrs.autofocus ? 'autofocus' : '',
  ].filter(Boolean);
  return `<input ${parts.join(' ')} />`;
}

/** Render a <select> dropdown. */
export function selectInput(attrs: {
  id?: string;
  dataKey?: string;
  options: Array<{ value: string; label: string; selected?: boolean }>;
}): string {
  const opts = attrs.options.map(o =>
    `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('\n');
  return `
    <select${attrs.id ? ` id="${esc(attrs.id)}"` : ''}${attrs.dataKey ? ` data-key="${esc(attrs.dataKey)}"` : ''}>
      ${opts}
    </select>`;
}

/** Render a 3-segment control (e.g., provider type selector). */
export function segmentedControl(attrs: {
  name: string;
  options: Array<{ value: string; label: string }>;
  selected?: string;
}): string {
  const btns = attrs.options.map(o =>
    `<button type="button" class="seg-btn${o.value === attrs.selected ? ' sel' : ''}" data-seg="${esc(attrs.name)}" data-val="${esc(o.value)}">${esc(o.label)}</button>`
  ).join('');
  return `<div class="seg-control">${btns}</div>`;
}

/** Render a toggle switch. */
export function toggle(attrs: {
  id: string;
  label: string;
  checked?: boolean;
}): string {
  return `
    <div class="toggle-row">
      <span class="toggle-label">${esc(attrs.label)}</span>
      <div class="toggle-track${attrs.checked ? ' on' : ''}" data-toggle="${esc(attrs.id)}">
        <div class="toggle-thumb"></div>
      </div>
    </div>`;
}

/** Render an info box. */
export function infoBox(text: string): string {
  return `<div class="info-box">${esc(text)}</div>`;
}

/** Render a section heading with colored dot. */
export function sectionHeading(label: string, dotColor: string): string {
  return `
    <div class="section-heading">
      <span class="section-dot" style="background:var(--${esc(dotColor)})"></span>
      ${esc(label)}
    </div>`;
}

/** Render a divider line. */
export function divider(): string {
  return '<div class="divider"></div>';
}

/** Render a badge (pill). */
export function badge(text: string, color: string): string {
  return `<span class="scope-badge ${esc(color)}">${esc(text)}</span>`;
}

/** Render a "new" badge. */
export function badgeNew(): string {
  return '<span class="badge-new">NEW</span>';
}

/** Render an inline "+ Add" button. */
export function addInlineBtn(label: string, action: string): string {
  return `<button type="button" class="add-inline" data-action="${esc(action)}">+ ${esc(label)}</button>`;
}
