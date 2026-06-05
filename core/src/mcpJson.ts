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

/** Writes (only) the mcpServers key into {workspaceRoot}/.mcp.json, preserving other keys. */
export function writeProjectMcpServers(workspaceRoot: string, servers: Record<string, McpServerConfig>): void {
  const dir = workspaceRoot;
  if (!fs.existsSync(dir)) { return; }
  const filePath = getMcpJsonPath(workspaceRoot);
  const existing = readMcpJson(workspaceRoot);
  const updated: McpJson = { ...existing, mcpServers: servers };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
}
