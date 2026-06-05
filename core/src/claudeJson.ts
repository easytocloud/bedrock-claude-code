import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { McpServerConfig } from './types';

/** Opaque shape of ~/.claude.json — we only touch the mcpServers key. */
interface ClaudeJson {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

export function getClaudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

export function readClaudeJson(): ClaudeJson {
  const filePath = getClaudeJsonPath();
  if (!fs.existsSync(filePath)) { return {}; }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ClaudeJson;
    }
    return {};
  } catch {
    return {};
  }
}

/** Reads MCP server entries from ~/.claude.json. Returns {} if missing or unreadable. */
export function readUserMcpServers(): Record<string, McpServerConfig> {
  return readClaudeJson().mcpServers ?? {};
}

/**
 * Ensures hasCompletedOnboarding is true in ~/.claude.json.
 * Prevents Claude Code from showing the first-run login wizard when the
 * user is relying on Bedrock or a proxy provider.
 */
export function ensureOnboardingComplete(): void {
  const filePath = getClaudeJsonPath();
  const existing = readClaudeJson();
  if (existing['hasCompletedOnboarding']) { return; } // already set — no write needed
  const updated = { ...existing, hasCompletedOnboarding: true };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
}

/** Writes (only) the mcpServers key into ~/.claude.json, preserving all other keys. */
export function writeUserMcpServers(servers: Record<string, McpServerConfig>): void {
  const filePath = getClaudeJsonPath();
  const existing = readClaudeJson();
  const updated: ClaudeJson = { ...existing, mcpServers: servers };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
}
