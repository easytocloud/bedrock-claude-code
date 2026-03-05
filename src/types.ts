// ---------------------------------------------------------------------------
// Core data model for the composable preset-based settings UI
// ---------------------------------------------------------------------------

// ─── Provider Types ──────────────────────────────────────────────────

export type ProviderType = 'anthropic' | 'bedrock' | 'proxy';

export interface ProviderProfile {
  id: string;
  name: string;
  type: ProviderType;

  // Bedrock-specific
  awsProfile?: string;
  awsRegion?: string;
  awsAuthRefresh?: string;

  // Anthropic-specific
  anthropicApiKey?: string;

  // Proxy-specific
  proxyBaseUrl?: string;
  proxyApiKey?: string;

  // Model assignments (all provider types)
  primaryModel: string;
  smallFastModel: string;
  opusModel: string;
  disablePromptCaching?: boolean;

  // Behavioral
  disableLoginPrompt?: boolean;
}

// ─── MCP Server Group ────────────────────────────────────────────────

export interface McpServerEntry {
  name: string;
  type: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Shape of a single mcpServers entry (sans name key) — for writing to .claude.json / .mcp.json */
export type McpServerConfig = Omit<McpServerEntry, 'name'>;

export interface McpServerGroup {
  id: string;
  name: string;
  servers: McpServerEntry[];
}

// ─── Directory Group ─────────────────────────────────────────────────

export interface DirectoryGroup {
  id: string;
  name: string;
  directories: string[];
}

// ─── Presets ─────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  name: string;
  providerId: string;
  mcpGroupIds: string[];
  directoryGroupIds: string[];
}

// ─── Scope Assignments ──────────────────────────────────────────────

export type ScopeMode = 'preset' | 'manual' | 'inherit';

export interface ScopeAssignment {
  mode: ScopeMode;
  presetId?: string;
}

// ─── Top-level Profile Store ─────────────────────────────────────────

export interface ProfileStore {
  version: 1;
  providers: ProviderProfile[];
  mcpGroups: McpServerGroup[];
  directoryGroups: DirectoryGroup[];
  presets: Preset[];
  globalScope: ScopeAssignment;
  workspaceScopes: Record<string, ScopeAssignment>;
}

// ─── Panel State (extension ↔ webview) ───────────────────────────────

export interface PanelState {
  store: ProfileStore;
  awsProfiles: string[];
  hasWorkspace: boolean;
  workspacePath?: string;
  workspaceName?: string;
}

// ─── Claude Code's own file format (kept for I/O) ───────────────────

export interface ClaudeCodeSettings {
  $schema?: string;
  env?: Record<string, string>;
  allowedDirectories?: string[];
  awsAuthRefresh?: string;
  awsCredentialExport?: string;
}
