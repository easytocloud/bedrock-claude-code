/**
 * Drawer templates for editing presets, providers, MCP groups, and directory groups.
 *
 * Drawers are rendered once as hidden DOM elements. The webview JavaScript
 * populates them with data when opened.
 */

import { esc } from './components';
import { AWS_REGIONS, KNOWN_PROVIDERS } from '@easytocloud/claude-personae-core';

// ---------------------------------------------------------------------------
// Credential-type cards (Authentication section) — shared markup for every
// provider type except Bedrock (AWS-native, no cards at all). Each card owns
// its own inline input; only the selected card's input is interactable. The
// webview decides at runtime which cards to show/hide/pre-select per the
// KNOWN_PROVIDERS catalog's `credentialModes`.
// ---------------------------------------------------------------------------

interface CredCardSpec {
  mode: 'none' | 'apikey' | 'authtoken' | 'op';
  title: string;
  hint: string;
  icon: string;
  inputId?: string;
  inputType?: 'password' | 'text';
  placeholder?: string;
}

const CRED_CARDS: CredCardSpec[] = [
  {
    mode: 'none',
    title: 'None',
    hint: 'No credential sent',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 4.5l7 7" stroke="currentColor" stroke-width="1.3"/></svg>`,
  },
  {
    mode: 'apikey',
    title: 'API Key',
    hint: 'Will be stored as env.ANTHROPIC_API_KEY',
    // Classic key silhouette: round bow (head) + shaft + teeth.
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="4.5" cy="4.5" r="3" stroke="currentColor" stroke-width="1.3"/><path d="M6.6 6.6L13.5 13.5M11 11l1.5-1.5M12.5 12.5L14 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    inputId: 'cred-input-apikey',
    inputType: 'password',
    placeholder: 'sk-ant-…',
  },
  {
    mode: 'authtoken',
    title: 'Bearer Token',
    hint: 'Will be stored as env.ANTHROPIC_AUTH_TOKEN',
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5 2v4c0 3.5-2.2 5.8-5 6.5-2.8-.7-5-3-5-6.5v-4l5-2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
    inputId: 'cred-input-authtoken',
    inputType: 'password',
    placeholder: 'eyJhbGciOi…',
  },
  {
    mode: 'op',
    title: '1Password reference',
    hint: 'Will be stored as apiKeyHelper',
    // Shield with a keyhole notch — 1Password's visual language.
    icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l5.5 2v3.8c0 3.7-2.3 6.2-5.5 7.2-3.2-1-5.5-3.5-5.5-7.2V3.5l5.5-2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="7.3" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 8.8v2.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    inputId: 'cred-input-op',
    inputType: 'text',
    placeholder: 'op://vault/item/field',
  },
];

function renderCredCard(spec: CredCardSpec): string {
  const inputHtml = spec.inputId ? `
      <div class="cred-card-input${spec.inputType === 'password' ? ' input-reveal' : ''}" id="cred-card-input-${esc(spec.mode)}" style="display:none">
        <input type="${spec.inputType}" id="${esc(spec.inputId)}" placeholder="${esc(spec.placeholder || '')}" />
        ${spec.inputType === 'password' ? `<button type="button" class="btn-eye" data-reveal="${esc(spec.inputId)}" title="Show / hide">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
        </button>` : ''}
      </div>` : '';

  return `
    <label class="cred-card" data-cred-mode="${esc(spec.mode)}" style="display:none">
      <input type="radio" class="cred-card-radio" name="cred-mode" value="${esc(spec.mode)}" />
      <div class="cred-card-body">
        <span class="cred-card-icon">${spec.icon}</span>
        <div class="cred-card-text">
          <div class="cred-card-title">${esc(spec.title)}</div>
          <div class="cred-card-hint">${esc(spec.hint)}</div>
        </div>
      </div>${inputHtml}
    </label>`;
}

function renderCredCardList(): string {
  return `<div class="cred-card-list" id="cred-card-list">${CRED_CARDS.map(renderCredCard).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Drawer shell
// ---------------------------------------------------------------------------

function drawerShell(id: string, headerHtml: string, bodyHtml: string, footerHtml: string): string {
  return `
    <div class="drawer" id="drawer-${esc(id)}">
      <div class="drawer-header">
        ${headerHtml}
        <button class="drawer-close" data-action="close-drawer">&times;</button>
      </div>
      <div class="drawer-body">
        ${bodyHtml}
      </div>
      <div class="drawer-footer">
        ${footerHtml}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Preset drawer (edit + new)
// ---------------------------------------------------------------------------

export function renderPresetDrawer(): string {
  const header = `
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="preset-drawer-title">Edit Preset</div>
      <div class="drawer-header-subtitle">Preset</div>
    </div>`;

  const body = `
    <div class="form-group">
      <label class="form-label" for="preset-name">Preset name</label>
      <input type="text" id="preset-name" placeholder="e.g. Staging, Client Work, Hackathon" />
    </div>

    <div class="divider"></div>

    <!-- Provider slot -->
    <div class="section-heading">
      <span class="section-dot section-dot-orange"></span>
      PROVIDER <span class="section-subtitle">— pick one</span>
    </div>
    <div class="form-group">
      <select id="preset-provider">
        <option value="">— Select a Provider —</option>
      </select>
      <button type="button" class="add-inline add-inline-mt" data-action="new-provider-from-preset">+ New Provider</button>
    </div>
    <div id="preset-provider-preview" class="provider-preview" style="display:none"></div>

    <div class="divider"></div>

    <!-- MCP Server Groups slot -->
    <div class="section-heading">
      <span class="section-dot section-dot-purple"></span>
      MCP SERVER GROUPS <span class="section-subtitle">— pick one or more</span>
    </div>
    <div id="preset-mcp-groups" class="check-list"></div>
    <button type="button" class="add-inline" data-action="new-mcp-group-from-preset">+ New MCP Server Group</button>

    <div class="divider"></div>

    <!-- Directory Groups slot -->
    <div class="section-heading">
      <span class="section-dot section-dot-green"></span>
      DIRECTORY GROUPS <span class="section-subtitle">— pick one or more</span>
    </div>
    <div id="preset-dir-groups" class="check-list"></div>
    <button type="button" class="add-inline" data-action="new-dir-group-from-preset">+ New Directory Group</button>
  `;

  const footer = `
    <button class="btn btn-primary" data-action="save-preset">Done</button>
    <button class="btn btn-ghost" data-action="duplicate-preset">Duplicate</button>
    <span class="spacer"></span>
    <button class="btn btn-danger" data-action="delete-preset">Delete</button>`;

  return drawerShell('preset', header, body, footer);
}

// ---------------------------------------------------------------------------
// Provider drawer (edit + new)
// ---------------------------------------------------------------------------

export function renderProviderDrawer(): string {
  const regionOptions = AWS_REGIONS.map(r =>
    `<option value="${esc(r)}">${esc(r)}</option>`
  ).join('');

  const header = `
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="provider-drawer-title">Edit Provider</div>
      <div class="drawer-header-subtitle">Provider</div>
    </div>`;

  const body = `
    <div class="form-group">
      <label class="form-label" for="provider-name">Provider name</label>
      <input type="text" id="provider-name" placeholder="e.g. Bedrock US, Company API, Local vLLM" />
    </div>

    <!-- Unified provider dropdown — Anthropic, then every known 3rd-party -->
    <div class="form-group">
      <label class="form-label" for="provider-select">Provider</label>
      <select id="provider-select">
        <option value="anthropic">Anthropic</option>
        ${KNOWN_PROVIDERS.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}
      </select>
    </div>

    <!-- Anthropic section -->
    <div id="provider-section-anthropic" style="display:none">
      <div class="info-box">Uses Anthropic's API directly. Without a credential, you'll need to <code>/login</code> with an Anthropic Max or Pro plan.</div>
    </div>

    <!-- Bedrock section -->
    <div id="provider-section-bedrock" style="display:none">
      <div class="section-heading">
        <span class="section-dot section-dot-orange"></span>
        AWS CONFIGURATION
      </div>
      <div class="info-box">Uses AWS credentials to authenticate with Amazon Bedrock.</div>
      <!-- AWS Config / AWS Env row — populated by webview.js -->
      <div class="form-group" id="provider-aws-config-row" style="display:none">
        <label class="form-label" id="provider-aws-config-label">AWS Config</label>
        <div id="provider-aws-config-value" class="form-hint"></div>
      </div>
      <div class="form-group" id="provider-aws-env-row" style="display:none">
        <label class="form-label" for="provider-aws-env">AWS Env</label>
        <select id="provider-aws-env"></select>
      </div>
      <div class="form-group">
        <label class="form-label" for="provider-aws-profile">AWS Profile</label>
        <select id="provider-aws-profile"></select>
      </div>
      <div class="form-group">
        <label class="form-label" for="provider-aws-region">AWS Region</label>
        <select id="provider-aws-region">
          ${regionOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="provider-aws-refresh">Credential refresh command</label>
        <input type="text" id="provider-aws-refresh" placeholder="e.g. aws sso login --profile my-profile (optional)" />
      </div>
    </div>

    <!-- Connection section (proxy providers only — URL) -->
    <div id="provider-section-connection" style="display:none">
      <div class="section-heading">
        <span class="section-dot section-dot-orange"></span>
        CONNECTION
      </div>
      <div class="form-group">
        <label class="form-label" for="provider-proxy-url">Base URL</label>
        <input type="text" id="provider-proxy-url" placeholder="http://localhost:11434" />
      </div>
    </div>

    <!-- Authentication section (all providers except Bedrock; hidden entirely
         for providers with no credentialModes, e.g. Ollama) -->
    <div id="provider-section-auth" style="display:none">
      <div class="section-heading">
        <span class="section-dot section-dot-orange"></span>
        AUTHENTICATION
      </div>
      <div class="info-box" id="auth-provider-info" style="display:none"></div>
      ${renderCredCardList()}
    </div>

    <!-- Models section (all providers) -->
    <div id="provider-models-section" style="display:none">
      <div class="divider"></div>
      <div class="section-heading">
        <span class="section-dot section-dot-orange"></span>
        MODELS
      </div>
      <div id="provider-models-info" class="info-box" style="display:none">Smart presets filtered by region — or fetch all models from your account.</div>
      <div id="bedrock-fetch-row" style="display:none" class="form-group">
        <div class="label-row">
          <label class="form-label">Region scope</label>
          <!-- Buttons rendered by renderBedrockScopePills(): Global + the AWS region's geo(s) -->
          <div class="pill-toggle" id="bedrock-scope-pills">
            <button type="button" class="pill-btn sel" data-pill="bedrock-scope" data-val="global">Global</button>
          </div>
        </div>
        <div class="label-row"
             title="Some models (Claude Fable/Mythos) require Bedrock to share your prompts and completions with the model provider, which retains them for up to 30 days. All other Bedrock models keep inference data inside AWS.">
          <label class="form-label">Allow provider data share</label>
          <div class="pill-toggle" id="bedrock-pds-pills">
            <button type="button" class="pill-btn sel" data-pill="bedrock-pds" data-val="no">No</button>
            <button type="button" class="pill-btn" data-pill="bedrock-pds" data-val="yes">Yes</button>
          </div>
        </div>
        <div class="label-row"
             title="Mantle is a separate Bedrock endpoint that serves Claude models through the native Anthropic API shape. It uses bare model IDs (e.g. anthropic.claude-sonnet-5) with no region prefix, so enabling it restricts the picker to Mantle-format models. Writes CLAUDE_CODE_USE_MANTLE=1.">
          <label class="form-label">Use Mantle</label>
          <div class="pill-toggle" id="bedrock-mantle-pills">
            <button type="button" class="pill-btn sel" data-pill="bedrock-mantle" data-val="no">No</button>
            <button type="button" class="pill-btn" data-pill="bedrock-mantle" data-val="yes">Yes</button>
          </div>
        </div>
        <button type="button" class="btn btn-primary" data-action="fetch-bedrock-models">Fetch models from AWS</button>
        <div id="bedrock-fetch-status" class="form-hint form-hint-mt"></div>
      </div>
      <div id="proxy-fetch-row" style="display:none" class="form-group">
        <button type="button" class="btn btn-primary" data-action="fetch-proxy-models">Fetch available models</button>
        <div id="proxy-fetch-status" class="form-hint form-hint-mt"></div>
      </div>

      <div class="form-group">
        <div class="label-row">
          <label class="form-label" for="provider-model-sonnet">Sonnet (primary)</label>
          <button type="button" class="btn-test" data-test-model="provider-model-sonnet" data-slot="sonnet" style="display:none">Test</button>
        </div>
        <select id="provider-model-sonnet"></select>
      </div>
      <div class="form-group">
        <div class="label-row">
          <label class="form-label" for="provider-model-haiku">Haiku (small/fast)</label>
          <button type="button" class="btn-test" data-test-model="provider-model-haiku" data-slot="haiku" style="display:none">Test</button>
        </div>
        <select id="provider-model-haiku"></select>
      </div>
      <div class="form-group">
        <div class="label-row">
          <label class="form-label" for="provider-model-opus">Opus</label>
          <button type="button" class="btn-test" data-test-model="provider-model-opus" data-slot="opus" style="display:none">Test</button>
        </div>
        <select id="provider-model-opus"></select>
      </div>
    </div>

    <!-- Options section (all non-Anthropic providers) -->
    <div id="provider-section-options" style="display:none">
      <div class="divider"></div>
      <div class="section-heading">
        <span class="section-dot section-dot-orange"></span>
        OPTIONS
      </div>
      <div class="form-group">
        <label class="form-label" for="provider-max-context-tokens"
               title="Caps the context window Claude Code will use for this provider. Leave blank to use the model's full window. Useful when a Bedrock inference profile serves a smaller effective window than the model's nominal one. Writes CLAUDE_CODE_MAX_CONTEXT_TOKENS.">Max context tokens</label>
        <input type="number" id="provider-max-context-tokens" min="1" step="1" placeholder="Model default" />
      </div>

      <div class="toggle-row">
        <span class="toggle-label">Disable prompt caching</span>
        <div class="toggle-track" data-toggle="provider-disable-caching">
          <div class="toggle-thumb"></div>
        </div>
      </div>
      <div class="toggle-row" id="provider-standalone-row">
        <span class="toggle-label">Standalone mode</span>
        <div class="form-hint form-hint-flex">Blocks all traffic to Anthropic (telemetry, updates, login). Default on — disable only if this proxy forwards to Anthropic directly.</div>
        <div class="toggle-track" data-toggle="provider-disable-nonessential">
          <div class="toggle-thumb"></div>
        </div>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-primary" data-action="save-provider">Done</button>
    <button class="btn btn-ghost" data-action="duplicate-provider">Duplicate</button>
    <span class="spacer"></span>
    <button class="btn btn-danger" data-action="delete-provider">Delete</button>`;

  return drawerShell('provider', header, body, footer);
}

// ---------------------------------------------------------------------------
// MCP Server Group drawer (edit + new)
// ---------------------------------------------------------------------------

export function renderMcpGroupDrawer(): string {
  const header = `
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="mcp-group-drawer-title">Edit MCP Server Group</div>
      <div class="drawer-header-subtitle">MCP Server Group</div>
    </div>`;

  const body = `
    <div class="form-group">
      <label class="form-label" for="mcp-group-name">Group name</label>
      <input type="text" id="mcp-group-name" placeholder="e.g. Database Tools, CI/CD, Frontend Dev" />
    </div>
    <div class="info-box">Servers in this group become available whenever a preset using it is active.</div>
    <div id="mcp-group-servers" class="item-list">
      <!-- Populated by JS -->
    </div>
    <button type="button" class="add-inline" data-action="add-mcp-server">+ Add server</button>
  `;

  const footer = `
    <button class="btn btn-primary" data-action="save-mcp-group">Done</button>
    <button class="btn btn-ghost" data-action="duplicate-mcp-group">Duplicate</button>
    <span class="spacer"></span>
    <button class="btn btn-danger" data-action="delete-mcp-group">Delete</button>`;

  return drawerShell('mcp-group', header, body, footer);
}

// ---------------------------------------------------------------------------
// MCP Server edit drawer (add/edit a single server within a group)
// ---------------------------------------------------------------------------

export function renderMcpServerDrawer(): string {
  const header = `
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="mcp-server-drawer-title">Add MCP Server</div>
      <div class="drawer-header-subtitle">Configure a server</div>
    </div>`;

  const body = `
    <div class="form-group">
      <label class="form-label" for="mcp-server-name">Server name</label>
      <input type="text" id="mcp-server-name" placeholder="e.g. my-database, github-tools" />
    </div>

    <div class="form-group">
      <label class="form-label" for="mcp-transport-control">Transport type</label>
      <div class="seg-control" id="mcp-transport-control">
        <button type="button" class="seg-btn sel" data-seg="mcp-transport" data-val="http">HTTP</button>
        <button type="button" class="seg-btn" data-seg="mcp-transport" data-val="sse">SSE</button>
        <button type="button" class="seg-btn" data-seg="mcp-transport" data-val="stdio">stdio</button>
      </div>
    </div>

    <!-- HTTP/SSE section -->
    <div id="mcp-transport-url" class="form-group">
      <label class="form-label" for="mcp-server-url">URL</label>
      <input type="text" id="mcp-server-url" placeholder="https://example.com/mcp" />
    </div>

    <!-- stdio section -->
    <div id="mcp-transport-stdio" style="display:none">
      <div class="form-group">
        <label class="form-label" for="mcp-server-command">Command</label>
        <input type="text" id="mcp-server-command" placeholder="e.g. npx" />
      </div>
      <div class="form-group">
        <label class="form-label" for="mcp-server-args">Arguments</label>
        <div class="form-hint">One per line (optional)</div>
        <textarea id="mcp-server-args" rows="3" placeholder="-y&#10;@modelcontextprotocol/server-github"></textarea>
      </div>
    </div>

    <!-- Environment Variables -->
    <div class="divider"></div>
    <label class="form-label" for="mcp-server-env">Environment variables</label>
    <div id="mcp-server-env" class="item-list"></div>
    <button type="button" class="add-inline" data-action="add-mcp-env-var">+ Add variable</button>

    <!-- Test Connection -->
    <div class="divider"></div>
    <div class="form-group">
      <button type="button" class="btn-test" id="btn-test-mcp" data-action="test-mcp-server">Test</button>
      <div id="mcp-test-output" class="form-hint form-hint-mt" style="white-space:pre-wrap"></div>
    </div>
  `;

  const footer = `
    <button class="btn btn-primary" data-action="save-mcp-server">Done</button>
    <span class="spacer"></span>
    <button class="btn btn-ghost" data-action="close-drawer">Cancel</button>`;

  return drawerShell('mcp-server', header, body, footer);
}

// ---------------------------------------------------------------------------
// Directory Group drawer (edit + new)
// ---------------------------------------------------------------------------

export function renderDirectoryGroupDrawer(): string {
  const header = `
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="dir-group-drawer-title">Edit Directory Group</div>
      <div class="drawer-header-subtitle">Directory Group</div>
    </div>`;

  const body = `
    <div class="form-group">
      <label class="form-label" for="dir-group-name">Group name</label>
      <input type="text" id="dir-group-name" placeholder="e.g. Work Projects, Data Lake, Shared Libs" />
    </div>
    <div class="info-box">These additional directories will be accessible to Claude Code when a preset using this group is active.</div>
    <div id="dir-group-dirs" class="item-list">
      <!-- Populated by JS -->
    </div>
    <button type="button" class="add-inline" data-action="add-directory">+ Add directory</button>
  `;

  const footer = `
    <button class="btn btn-primary" data-action="save-dir-group">Done</button>
    <button class="btn btn-ghost" data-action="duplicate-dir-group">Duplicate</button>
    <span class="spacer"></span>
    <button class="btn btn-danger" data-action="delete-dir-group">Delete</button>`;

  return drawerShell('dir-group', header, body, footer);
}

// ---------------------------------------------------------------------------
// All drawers combined
// ---------------------------------------------------------------------------

export function renderAllDrawers(): string {
  return `
    <div class="drawer-backdrop" id="drawer-backdrop"></div>
    ${renderPresetDrawer()}
    ${renderProviderDrawer()}
    ${renderMcpGroupDrawer()}
    ${renderMcpServerDrawer()}
    ${renderDirectoryGroupDrawer()}
  `;
}
