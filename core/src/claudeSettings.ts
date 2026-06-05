import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeCodeSettings } from './types';

const SCHEMA_URL = 'https://json.schemastore.org/claude-code-settings.json';

/** Returns the path to ~/.claude/settings.json */
export function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/** Returns the path to {workspaceRoot}/.claude/settings.json */
export function getProjectSettingsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.claude', 'settings.json');
}

/** Reads and parses ~/.claude/settings.json. Returns {} if missing or unreadable. */
export function readClaudeSettings(): ClaudeCodeSettings {
  const filePath = getClaudeSettingsPath();

  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ClaudeCodeSettings;
    }
    return {};
  } catch {
    return {};
  }
}

/** Writes settings to ~/.claude/settings.json, creating the directory if needed. */
export function writeClaudeSettings(settings: ClaudeCodeSettings): void {
  const filePath = getClaudeSettingsPath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Always include the JSON schema reference for IDE autocomplete
  const output: ClaudeCodeSettings = { $schema: SCHEMA_URL, ...settings };

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n', 'utf8');
}

/** Reads and parses {workspaceRoot}/.claude/settings.json. Returns {} if missing. */
export function readProjectSettings(workspaceRoot: string): ClaudeCodeSettings {
  const filePath = getProjectSettingsPath(workspaceRoot);
  if (!fs.existsSync(filePath)) { return {}; }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ClaudeCodeSettings;
    }
    return {};
  } catch {
    return {};
  }
}

/** Writes settings to {workspaceRoot}/.claude/settings.json, creating the directory if needed. */
export function writeProjectSettings(workspaceRoot: string, settings: ClaudeCodeSettings): void {
  const filePath = getProjectSettingsPath(workspaceRoot);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const output: ClaudeCodeSettings = { $schema: SCHEMA_URL, ...settings };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n', 'utf8');
}
