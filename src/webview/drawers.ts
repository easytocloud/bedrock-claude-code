/**
 * Drawer templates for editing presets, providers, MCP groups, and directory groups.
 *
 * Drawers are rendered once as hidden DOM elements. The webview JavaScript
 * populates them with data when opened.
 */

import { esc } from './components';
import { AWS_REGIONS } from '../models';

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
    <span class="drawer-header-icon">⚡</span>
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
        <option value="">— Select a provider —</option>
      </select>
      <button type="button" class="add-inline add-inline-mt" data-action="new-provider-from-preset">+ New provider</button>
    </div>
    <div id="preset-provider-preview" class="provider-preview" style="display:none"></div>

    <div class="divider"></div>

    <!-- MCP groups slot -->
    <div class="section-heading">
      <span class="section-dot section-dot-purple"></span>
      MCP SERVERS <span class="section-subtitle">— pick one or more</span>
    </div>
    <div id="preset-mcp-groups" class="check-list"></div>
    <button type="button" class="add-inline" data-action="new-mcp-group-from-preset">+ New MCP server group</button>

    <div class="divider"></div>

    <!-- Directory groups slot -->
    <div class="section-heading">
      <span class="section-dot section-dot-green"></span>
      ADDITIONAL DIRECTORIES <span class="section-subtitle">— pick one or more</span>
    </div>
    <div id="preset-dir-groups" class="check-list"></div>
    <button type="button" class="add-inline" data-action="new-dir-group-from-preset">+ New directory group</button>
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
    <span class="drawer-header-icon" id="provider-drawer-icon">☁️</span>
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="provider-drawer-title">Edit Provider</div>
      <div class="drawer-header-subtitle">Provider</div>
    </div>`;

  const body = `
    <div class="form-group">
      <label class="form-label" for="provider-name">Provider name</label>
      <input type="text" id="provider-name" placeholder="e.g. Bedrock US, Company API, Local vLLM" />
    </div>

    <div class="form-group">
      <label class="form-label" for="provider-type-control">Provider type</label>
      <div class="seg-control" id="provider-type-control">
        <button type="button" class="seg-btn" data-seg="provider-type" data-val="anthropic">Anthropic</button>
        <button type="button" class="seg-btn" data-seg="provider-type" data-val="bedrock">Bedrock</button>
        <button type="button" class="seg-btn" data-seg="provider-type" data-val="proxy">Local / Other</button>
      </div>
    </div>

    <!-- Anthropic section -->
    <div id="provider-section-anthropic" style="display:none">
      <div class="section-heading">
        <span class="section-dot section-dot-orange"></span>
        ANTHROPIC API
      </div>
      <div class="info-box">Uses Anthropic's API directly. Enter an API key from <strong>console.anthropic.com</strong>, or use a 1Password <code>op://</code> reference. Without a key, you'll need to <code>/login</code> with an Anthropic Max or Pro plan.</div>
      <div class="form-group">
        <label class="form-label" for="provider-anthropic-key">API Key <span style="opacity:0.5">(optional)</span></label>
        <div class="input-reveal">
          <input type="password" id="provider-anthropic-key" placeholder="sk-ant-… or op://Vault/Item/field" />
          <button type="button" class="btn-eye" data-reveal="provider-anthropic-key" title="Show / hide">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
          </button>
        </div>
        <div class="form-hint form-hint-sm" id="anthropic-credential-hint"></div>
      </div>
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

    <!-- Local / Other section -->
    <div id="provider-section-proxy" style="display:none">
      <div class="section-heading">
        <span class="section-dot section-dot-orange"></span>
        LOCAL / OTHER
      </div>
      <div class="info-box">Works with LiteLLM, OpenRouter, Ollama, vLLM, LM Studio, and any proxy that exposes an Anthropic-compatible API (<code>/v1/messages</code>). Enable Standalone mode below for local models.</div>
      <div class="form-group">
        <label class="form-label" for="provider-proxy-url">Base URL</label>
        <input type="text" id="provider-proxy-url" placeholder="http://localhost:11434" />
      </div>
      <div class="form-group">
        <div class="label-row">
          <label class="form-label">Credential</label>
          <div class="pill-toggle" id="proxy-auth-pills">
            <button type="button" class="pill-btn sel" data-pill="proxy-auth" data-val="apikey">API Key</button>
            <button type="button" class="pill-btn" data-pill="proxy-auth" data-val="authtoken">Token</button>
          </div>
        </div>
        <div class="input-reveal">
          <input type="password" id="provider-proxy-credential" placeholder="sk-… or op://Vault/Item/field" />
          <button type="button" class="btn-eye" data-reveal="provider-proxy-credential" title="Show / hide">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
          </button>
        </div>
        <div class="form-hint form-hint-sm" id="proxy-credential-hint"></div>
      </div>
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
    <button class="btn btn-danger btn-sm" data-action="delete-provider">Delete</button>`;

  return drawerShell('provider', header, body, footer);
}

// ---------------------------------------------------------------------------
// MCP Server Group drawer (edit + new)
// ---------------------------------------------------------------------------

export function renderMcpGroupDrawer(): string {
  const header = `
    <span class="drawer-header-icon">📡</span>
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="mcp-group-drawer-title">Edit MCP Server Group</div>
      <div class="drawer-header-subtitle">MCP server group</div>
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
    <button class="btn btn-danger btn-sm" data-action="delete-mcp-group">Delete</button>`;

  return drawerShell('mcp-group', header, body, footer);
}

// ---------------------------------------------------------------------------
// MCP Server edit drawer (add/edit a single server within a group)
// ---------------------------------------------------------------------------

export function renderMcpServerDrawer(): string {
  const header = `
    <span class="drawer-header-icon">➕</span>
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
    <div class="section-heading">
      <span class="section-dot section-dot-purple"></span>
      ENVIRONMENT VARIABLES
    </div>
    <div id="mcp-server-env" class="item-list">
      <div class="empty-state">No variables configured.</div>
    </div>
    <button type="button" class="add-inline" data-action="add-mcp-env-var">+ Add variable</button>

    <!-- Test Connection -->
    <div class="divider"></div>
    <div class="section-heading">
      <span class="section-dot section-dot-blue"></span>
      TEST CONNECTION
    </div>
    <div class="form-group">
      <button type="button" class="btn btn-ghost" id="btn-test-mcp" data-action="test-mcp-server">Test</button>
      <div id="mcp-test-output" class="form-hint form-hint-mt" style="white-space:pre-wrap"></div>
    </div>
  `;

  const footer = `
    <button class="btn btn-primary" data-action="save-mcp-server">Save</button>
    <span class="spacer"></span>
    <button class="btn btn-ghost" data-action="close-drawer">Cancel</button>`;

  return drawerShell('mcp-server', header, body, footer);
}

// ---------------------------------------------------------------------------
// Directory Group drawer (edit + new)
// ---------------------------------------------------------------------------

export function renderDirectoryGroupDrawer(): string {
  const header = `
    <span class="drawer-header-icon">📂</span>
    <div class="drawer-header-text">
      <div class="drawer-header-title" id="dir-group-drawer-title">Edit Directory Group</div>
      <div class="drawer-header-subtitle">Additional directory group</div>
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
    <button class="btn btn-danger btn-sm" data-action="delete-dir-group">Delete</button>`;

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
