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
  /** Selected aws-envs name (e.g. "prod"). When set, AWS_CONFIG_FILE is written as
   *  ~/.aws/aws-envs/<awsEnv>/config — stored per-provider so each provider carries
   *  its own config independently of the live filesystem symlink. */
  awsEnv?: string;
  /** Route this Bedrock provider's requests through the Mantle endpoint
   *  (native Anthropic API shape) instead of the Invoke API. Writes
   *  CLAUDE_CODE_USE_MANTLE=1. Requires Mantle-format model IDs
   *  (e.g. `anthropic.claude-sonnet-5`) in the model slots. */
  useMantle?: boolean;

  // Anthropic-specific
  anthropicApiKey?: string;

  // Proxy-specific
  proxyBaseUrl?: string;
  proxyCredential?: string;          // The key or token value
  proxyAuthMode?: 'apikey' | 'authtoken'; // How to send it: x-api-key or Bearer
  /** Which entry from the known-providers catalogue was selected in the UI.
   *  Drives URL/auth field labelling and resolver-side coercion. Undefined on
   *  legacy proxy records is treated as 'custom'. Resolver still keys
   *  behavioural switches off `type`, not this field. */
  proxyPreset?: 'bedrock' | 'openrouter' | 'ollama' | 'lmstudio' | 'omlx' | 'vllm' | 'litellm' | 'custom';
  /** @deprecated use proxyCredential + proxyAuthMode */
  proxyApiKey?: string;
  /** @deprecated use proxyCredential + proxyAuthMode */
  proxyAuthToken?: string;

  // Model assignments (all provider types)
  primaryModel: string;
  smallFastModel: string;
  opusModel: string;
  disablePromptCaching?: boolean;
  /** Caps the context window Claude Code will use for this provider, in tokens.
   *  Writes CLAUDE_CODE_MAX_CONTEXT_TOKENS. Useful when a Bedrock inference
   *  profile serves a smaller effective window than the model's nominal one. */
  maxContextTokens?: number;

  // Model test state (persisted per-model: 'ok' | 'fail')
  modelTestState?: Record<string, 'ok' | 'fail'>;

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
  /**
   * MCP server names last written by us into ~/.claude.json, per scope.
   * On the next apply we remove exactly these names before merging in the
   * preset's servers, so servers the user added by hand (e.g. via
   * `claude mcp add`) survive preset switches.
   */
  mcpOwnership?: {
    global?: string[];
    workspaces?: Record<string, string[]>;
  };
}

// ─── Panel State (extension ↔ webview) ───────────────────────────────

export interface PanelState {
  store: ProfileStore;
  awsProfiles: string[];
  awsConfigInfo?: import('./awsConfig').AwsConfigInfo | null;
  hasWorkspace: boolean;
  workspacePath?: string;
  workspaceName?: string;
  dismissTestReminder?: boolean;
  introCollapsed?: boolean;
}

// ─── Claude Code's own file format (kept for I/O) ───────────────────

export interface ClaudeCodeSettings {
  $schema?: string;
  apiKeyHelper?: string;
  env?: Record<string, string>;
  allowedDirectories?: string[];
  awsAuthRefresh?: string;
  awsCredentialExport?: string;
}
