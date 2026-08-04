import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { McpServerConfig } from './types';

/** Per-project entry inside ~/.claude.json's projects block. */
interface ClaudeJsonProject {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

/** Opaque shape of ~/.claude.json — we only touch mcpServers keys (top-level and per-project). */
interface ClaudeJson {
  mcpServers?: Record<string, McpServerConfig>;
  projects?: Record<string, ClaudeJsonProject>;
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

function writeClaudeJson(updated: ClaudeJson): void {
  fs.writeFileSync(getClaudeJsonPath(), JSON.stringify(updated, null, 2) + '\n', 'utf8');
}

/**
 * Ownership-aware merge: removes `previouslyOwned` names from the given
 * mcpServers map, then adds the preset's servers. Hand-added servers survive.
 * Returns the merged map (or undefined when the result is empty).
 */
export function mergeOwned(
  existing: Record<string, McpServerConfig> | undefined,
  servers: Record<string, McpServerConfig>,
  previouslyOwned: string[]
): Record<string, McpServerConfig> | undefined {
  const merged: Record<string, McpServerConfig> = { ...(existing ?? {}) };
  for (const name of previouslyOwned) { delete merged[name]; }
  Object.assign(merged, servers);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Merges the preset's MCP servers into the top-level mcpServers of
 * ~/.claude.json (global scope). Returns the names now owned by us.
 */
export function writeUserMcpServers(
  servers: Record<string, McpServerConfig>,
  previouslyOwned: string[] = []
): string[] {
  const existing = readClaudeJson();
  const merged = mergeOwned(existing.mcpServers, servers, previouslyOwned);
  const updated: ClaudeJson = { ...existing };
  if (merged) { updated.mcpServers = merged; } else { delete updated.mcpServers; }
  writeClaudeJson(updated);
  return Object.keys(servers);
}

/**
 * Merges the preset's MCP servers into ~/.claude.json →
 * projects[workspaceRoot].mcpServers (Claude Code's "local" scope for that
 * project). Returns the names now owned by us.
 */
export function writeProjectMcpServersToClaudeJson(
  workspaceRoot: string,
  servers: Record<string, McpServerConfig>,
  previouslyOwned: string[] = []
): string[] {
  const existing = readClaudeJson();
  const projects = { ...(existing.projects ?? {}) };
  const entry: ClaudeJsonProject = { ...(projects[workspaceRoot] ?? {}) };
  const merged = mergeOwned(entry.mcpServers, servers, previouslyOwned);
  if (merged) { entry.mcpServers = merged; } else { delete entry.mcpServers; }

  // Don't create an otherwise-empty project entry for a no-server preset
  if (Object.keys(entry).length > 0 || projects[workspaceRoot]) {
    projects[workspaceRoot] = entry;
  }
  const updated: ClaudeJson = { ...existing };
  if (Object.keys(projects).length > 0) { updated.projects = projects; }
  writeClaudeJson(updated);
  return Object.keys(servers);
}

/**
 * Removes our owned MCP servers from projects[workspaceRoot] in ~/.claude.json
 * (used when a workspace goes back to inheriting the global scope).
 */
export function removeProjectMcpServersFromClaudeJson(
  workspaceRoot: string,
  ownedNames: string[]
): void {
  if (ownedNames.length === 0) { return; }
  const existing = readClaudeJson();
  const entry = existing.projects?.[workspaceRoot];
  if (!entry?.mcpServers) { return; }
  const remaining = { ...entry.mcpServers };
  for (const name of ownedNames) { delete remaining[name]; }
  if (Object.keys(remaining).length > 0) {
    entry.mcpServers = remaining;
  } else {
    delete entry.mcpServers;
  }
  writeClaudeJson(existing);
}
