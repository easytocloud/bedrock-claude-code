import * as fs from 'fs';
import * as path from 'path';
import {
  ProfileStore,
  ProviderProfile,
  McpServerConfig,
  McpServerGroup,
  ScopeAssignment,
  ClaudeCodeSettings,
} from './types';
import { MANAGED_ENV_KEYS } from './models';
import {
  readClaudeSettings,
  writeClaudeSettings,
  readProjectSettings,
  writeProjectSettings,
  getProjectSettingsPath,
} from './claudeSettings';
import { writeUserMcpServers } from './claudeJson';
import { writeProjectMcpServers } from './mcpJson';

// ---------------------------------------------------------------------------
// Resolved configuration — the flat representation written to Claude Code files
// ---------------------------------------------------------------------------

export interface ResolvedConfig {
  env: Record<string, string>;
  allowedDirectories: string[];
  awsAuthRefresh?: string;
  mcpServers: Record<string, McpServerConfig>;
}

// ---------------------------------------------------------------------------
// Resolution: Preset → flat config
// ---------------------------------------------------------------------------

/** Resolve a preset ID into flat env vars, MCP servers, and directories. */
export function resolvePreset(
  store: ProfileStore,
  presetId: string
): ResolvedConfig | null {
  const preset = store.presets.find(p => p.id === presetId);
  if (!preset) { return null; }

  const provider = store.providers.find(p => p.id === preset.providerId);
  const env: Record<string, string> = {};
  let awsAuthRefresh: string | undefined;

  if (provider) {
    // Provider-specific env vars
    switch (provider.type) {
      case 'bedrock':
        env['CLAUDE_CODE_USE_BEDROCK'] = '1';
        if (provider.awsProfile) { env['AWS_PROFILE'] = provider.awsProfile; }
        if (provider.awsRegion) { env['AWS_REGION'] = provider.awsRegion; }
        if (provider.awsAuthRefresh) { awsAuthRefresh = provider.awsAuthRefresh; }
        break;
      case 'anthropic':
        if (provider.anthropicApiKey) { env['ANTHROPIC_API_KEY'] = provider.anthropicApiKey; }
        break;
      case 'proxy': {
        let baseUrl = provider.proxyBaseUrl || '';
        // OpenRouter requires /api in the URL path
        if (/openrouter\.ai/i.test(baseUrl) && !/\/api\b/i.test(baseUrl)) {
          baseUrl = baseUrl.replace(/\/+$/, '') + '/api';
        }
        if (baseUrl) { env['ANTHROPIC_BASE_URL'] = baseUrl; }

        if (provider.proxyAuthToken) {
          // Auth-token mode (OpenRouter): set AUTH_TOKEN and clear API_KEY
          env['ANTHROPIC_AUTH_TOKEN'] = provider.proxyAuthToken;
          env['ANTHROPIC_API_KEY'] = '';
        } else if (provider.proxyApiKey) {
          env['ANTHROPIC_API_KEY'] = provider.proxyApiKey;
        }
        break;
      }
    }

    // Model env vars — for Anthropic native, clear any overrides (empty string resets
    // workspace-level to unset); for other providers, set the configured model names.
    if (provider.type === 'anthropic') {
      env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = '';
      env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = '';
      env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = '';
    } else {
      if (provider.primaryModel) { env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = provider.primaryModel; }
      if (provider.smallFastModel) { env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = provider.smallFastModel; }
      if (provider.opusModel) { env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = provider.opusModel; }
    }
    if (provider.disablePromptCaching) { env['DISABLE_PROMPT_CACHING'] = '1'; }
    if (provider.disableLoginPrompt) { env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1'; }
  }

  // Merge MCP servers from all selected groups
  const mcpServers: Record<string, McpServerConfig> = {};
  for (const groupId of preset.mcpGroupIds) {
    const group = store.mcpGroups.find(g => g.id === groupId);
    if (group) {
      for (const server of group.servers) {
        const config: McpServerConfig = { type: server.type };
        if (server.url) { config.url = server.url; }
        if (server.command) { config.command = server.command; }
        if (server.args?.length) { config.args = server.args; }
        if (server.env && Object.keys(server.env).length) { config.env = server.env; }
        mcpServers[server.name] = config;
      }
    }
  }

  // Merge directories from all selected groups
  const allowedDirectories: string[] = [];
  for (const groupId of preset.directoryGroupIds) {
    const group = store.directoryGroups.find(g => g.id === groupId);
    if (group) {
      for (const dir of group.directories) {
        if (!allowedDirectories.includes(dir)) {
          allowedDirectories.push(dir);
        }
      }
    }
  }

  return { env, allowedDirectories, awsAuthRefresh, mcpServers };
}

// ---------------------------------------------------------------------------
// Apply resolved config to Claude Code's actual files
// ---------------------------------------------------------------------------

/**
 * Apply a resolved config to the global scope:
 * - env vars → ~/.claude/settings.json
 * - MCP servers → ~/.claude.json
 */
export function applyGlobalConfig(resolved: ResolvedConfig): void {
  const settings = readClaudeSettings();
  const existingEnv = settings.env ?? {};

  // Preserve env vars not managed by us
  const preservedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(existingEnv)) {
    if (!MANAGED_ENV_KEYS.has(key)) {
      preservedEnv[key] = value;
    }
  }

  const newSettings: ClaudeCodeSettings = {
    ...settings,
    env: { ...preservedEnv, ...resolved.env },
  };

  // Set or clear allowedDirectories
  if (resolved.allowedDirectories.length > 0) {
    newSettings.allowedDirectories = resolved.allowedDirectories;
  } else {
    delete newSettings.allowedDirectories;
  }

  // Set or clear awsAuthRefresh
  if (resolved.awsAuthRefresh) {
    newSettings.awsAuthRefresh = resolved.awsAuthRefresh;
  } else {
    delete newSettings.awsAuthRefresh;
  }

  // Clear deprecated env var keys
  if (newSettings.env) {
    delete newSettings.env['ANTHROPIC_MODEL'];
    delete newSettings.env['ANTHROPIC_SMALL_FAST_MODEL'];
    delete newSettings.env['ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION'];
  }

  writeClaudeSettings(newSettings);
  writeUserMcpServers(resolved.mcpServers);
}

/**
 * Remove managed env keys, allowedDirectories, and awsAuthRefresh from
 * {workspace}/.claude/settings.json so the project inherits from global.
 * Preserves any non-managed keys the user may have set.
 */
export function cleanProjectConfig(workspaceRoot: string): void {
  const settings = readProjectSettings(workspaceRoot);
  if (Object.keys(settings).length === 0) { return; } // nothing to clean

  // Remove managed env keys
  if (settings.env) {
    for (const key of MANAGED_ENV_KEYS) {
      delete settings.env[key];
    }
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
  }

  // Remove fields we manage
  delete settings.allowedDirectories;
  delete settings.awsAuthRefresh;

  // Only write back if there's still content beyond $schema; otherwise leave file alone
  const remaining = Object.keys(settings).filter(k => k !== '$schema');
  if (remaining.length > 0) {
    writeProjectSettings(workspaceRoot, settings);
  } else {
    // File only has $schema (or nothing) — remove it to keep the project clean
    const filePath = getProjectSettingsPath(workspaceRoot);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

/**
 * Apply a resolved config to the project scope:
 * - env vars + directories → {workspace}/.claude/settings.json
 * - MCP servers → {workspace}/.mcp.json
 */
export function applyProjectConfig(
  resolved: ResolvedConfig,
  workspaceRoot: string
): void {
  // Write env vars and directories to project-level settings
  const settings = readProjectSettings(workspaceRoot);
  const existingEnv = settings.env ?? {};

  // Preserve env vars not managed by us
  const preservedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(existingEnv)) {
    if (!MANAGED_ENV_KEYS.has(key)) {
      preservedEnv[key] = value;
    }
  }

  const newSettings: ClaudeCodeSettings = {
    ...settings,
    env: { ...preservedEnv, ...resolved.env },
  };

  if (resolved.allowedDirectories.length > 0) {
    newSettings.allowedDirectories = resolved.allowedDirectories;
  } else {
    delete newSettings.allowedDirectories;
  }

  if (resolved.awsAuthRefresh) {
    newSettings.awsAuthRefresh = resolved.awsAuthRefresh;
  } else {
    delete newSettings.awsAuthRefresh;
  }

  writeProjectSettings(workspaceRoot, newSettings);

  // Write MCP servers to .mcp.json
  writeProjectMcpServers(workspaceRoot, resolved.mcpServers);

  // If the workspace is a VS Code extension, ensure .mcp.json and .claude/
  // are listed in .vscodeignore so they don't end up in published VSIXs.
  ensureVscodeignore(workspaceRoot);
}

/**
 * Resolve and apply the active scope assignments from the store.
 */
export function applyAllScopes(
  store: ProfileStore,
  workspaceRoot: string | undefined
): void {
  // Global scope
  if (store.globalScope.mode === 'preset' && store.globalScope.presetId) {
    const resolved = resolvePreset(store, store.globalScope.presetId);
    if (resolved) {
      applyGlobalConfig(resolved);
    }
  }

  // Workspace scope
  if (workspaceRoot) {
    const wsScope = store.workspaceScopes[workspaceRoot];
    if (wsScope) {
      if (wsScope.mode === 'preset' && wsScope.presetId) {
        const resolved = resolvePreset(store, wsScope.presetId);
        if (resolved) {
          applyProjectConfig(resolved, workspaceRoot);
        }
      }
      if (wsScope.mode === 'inherit') {
        cleanProjectConfig(workspaceRoot);
      }
      // 'manual' mode: user manages files themselves
    }
  }
}

// ---------------------------------------------------------------------------
// .vscodeignore helper — prevent leaking generated config into published VSIXs
// ---------------------------------------------------------------------------

const VSCODEIGNORE_ENTRIES = ['.mcp.json', '.claude/'];

function ensureVscodeignore(workspaceRoot: string): void {
  const ignorePath = path.join(workspaceRoot, '.vscodeignore');
  if (!fs.existsSync(ignorePath)) { return; } // not a VS Code extension project
  try {
    let content = fs.readFileSync(ignorePath, 'utf8');
    const lines = content.split('\n').map(l => l.trim());
    const missing = VSCODEIGNORE_ENTRIES.filter(e => !lines.includes(e));
    if (missing.length === 0) { return; }
    if (!content.endsWith('\n')) { content += '\n'; }
    content += missing.join('\n') + '\n';
    fs.writeFileSync(ignorePath, content, 'utf8');
  } catch { /* best effort — don't break save */ }
}
