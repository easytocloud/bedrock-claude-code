// Types shared across the extension

export type LlmProvider = 'bedrock' | 'local';

export interface BedrockConfig {
  /** Which LLM backend to use */
  provider: LlmProvider;
  /** Bedrock: sets CLAUDE_CODE_USE_BEDROCK=1 */
  enabled: boolean;
  awsProfile: string;
  awsRegion: string;
  awsAuthRefresh: string;
  disableLoginPrompt: boolean;
  /** Local: base URL (ANTHROPIC_BASE_URL) */
  localBaseUrl: string;
  /** Local: API key (ANTHROPIC_API_KEY) */
  localApiKey: string;
}

export interface ModelConfig {
  primaryModel: string;   // ANTHROPIC_DEFAULT_SONNET_MODEL
  smallFastModel: string; // ANTHROPIC_DEFAULT_HAIKU_MODEL
  opusModel: string;      // ANTHROPIC_DEFAULT_OPUS_MODEL
  disablePromptCaching: boolean;
}

export interface McpServer {
  name: string;
  type: 'http' | 'sse' | 'stdio';
  /** URL for http/sse transports */
  url?: string;
  /** Command for stdio transport */
  command?: string;
  /** Arguments for stdio transport */
  args?: string[];
  /** Optional env vars passed to the MCP server process */
  env?: Record<string, string>;
}

/** Shape of a single mcpServers entry (sans name key) */
export type McpServerConfig = Omit<McpServer, 'name'>;

/** Shape of ~/.claude/settings.json */
export interface ClaudeCodeSettings {
  $schema?: string;
  env?: Record<string, string>;
  allowedDirectories?: string[];
  /** Command run to refresh AWS credentials (e.g. aws sso login) */
  awsAuthRefresh?: string;
  /** Command that silently outputs JSON credentials */
  awsCredentialExport?: string;
}

/** Full state passed between extension and webview */
export interface PanelState {
  bedrockConfig: BedrockConfig;
  modelConfig: ModelConfig;
  /** MCP servers from ~/.claude.json (user scope) */
  userMcpServers: McpServer[];
  /** MCP servers from {workspace}/.mcp.json (project scope) */
  projectMcpServers: McpServer[];
  allowedDirectories: string[];
  awsProfiles: string[];
  /** Whether a workspace folder is open (required for project-scope operations) */
  hasWorkspace: boolean;
}
