import * as fs from 'fs';
import * as path from 'path';
import { McpServerConfig } from './types';

interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

export function getMcpJsonPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.mcp.json');
}

function readMcpJson(workspaceRoot: string): McpJson {
  const filePath = getMcpJsonPath(workspaceRoot);
  if (!fs.existsSync(filePath)) { return {}; }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as McpJson;
    }
    return {};
  } catch {
    return {};
  }
}

/** Reads MCP server entries from {workspaceRoot}/.mcp.json. Returns {} if missing. */
export function readProjectMcpServers(workspaceRoot: string): Record<string, McpServerConfig> {
  return readMcpJson(workspaceRoot).mcpServers ?? {};
}

/**
 * Legacy cleanup: earlier versions wrote preset MCP servers into
 * {workspaceRoot}/.mcp.json; they now live in ~/.claude.json. Removes only
 * the named servers from the file's mcpServers key, drops the key when it
 * becomes empty, and deletes the file when nothing else remains. Servers the
 * user (or their team) added under other names are left untouched.
 */
export function cleanupLegacyMcpJson(workspaceRoot: string, serverNames: string[]): void {
  if (serverNames.length === 0) { return; }
  const filePath = getMcpJsonPath(workspaceRoot);
  if (!fs.existsSync(filePath)) { return; }

  const existing = readMcpJson(workspaceRoot);
  if (!existing.mcpServers) { return; }

  const remaining = { ...existing.mcpServers };
  let removed = false;
  for (const name of serverNames) {
    if (name in remaining) { delete remaining[name]; removed = true; }
  }
  if (!removed) { return; }

  const updated: McpJson = { ...existing };
  if (Object.keys(remaining).length > 0) {
    updated.mcpServers = remaining;
  } else {
    delete updated.mcpServers;
  }

  if (Object.keys(updated).length === 0) {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  }
}
