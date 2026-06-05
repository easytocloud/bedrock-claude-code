import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Returns the path to the AWS config file, respecting $AWS_CONFIG_FILE. */
export function getAwsConfigPath(): string {
  return process.env.AWS_CONFIG_FILE ?? path.join(os.homedir(), '.aws', 'config');
}

export interface AwsConfigInfo {
  /** Resolved (real) path of the config file. */
  configPath: string;
  /** True when the path matches ~/.aws/aws-envs/<name>/config */
  isAwsEnv: boolean;
  /** The env name when isAwsEnv is true, otherwise undefined. */
  envName?: string;
  /** All available env names when isAwsEnv is true. */
  envNames?: string[];
}

/**
 * Detects the AWS config file in use, resolving symlinks.
 * Returns null when config is plain/default (no $AWS_CONFIG_FILE and ~/.aws/config
 * is not a symlink) — nothing worth showing the user.
 * Otherwise returns info about the resolved path and whether aws-envs is in use.
 */
export function getAwsConfigInfo(): AwsConfigInfo | null {
  const rawPath = getAwsConfigPath();
  const defaultPath = path.join(os.homedir(), '.aws', 'config');
  const hasEnvOverride = !!process.env.AWS_CONFIG_FILE;

  // Check if the default config is a symlink
  let isSymlink = false;
  try {
    isSymlink = fs.lstatSync(defaultPath).isSymbolicLink();
  } catch { /* file may not exist */ }

  // Nothing interesting — hide the row entirely
  if (!hasEnvOverride && !isSymlink) { return null; }

  // Resolve symlink if present
  let configPath = rawPath;
  try {
    configPath = fs.realpathSync(rawPath);
  } catch {
    // File may not exist yet — use raw path
    configPath = rawPath;
  }

  // Normalize iCloud dotfiles path:
  // ~/Library/Mobile Documents/com~apple~CloudDocs/dotFiles/aws/dot-aws/...
  // is the iCloud-synced mirror of ~/.aws/... — treat it as such.
  const iCloudDotAws = path.join(
    os.homedir(),
    'Library', 'Mobile Documents', 'com~apple~CloudDocs',
    'dotFiles', 'aws', 'dot-aws'
  );
  if (configPath.startsWith(iCloudDotAws + '/') || configPath.startsWith(iCloudDotAws + path.sep)) {
    configPath = path.join(os.homedir(), '.aws', configPath.slice(iCloudDotAws.length + 1));
  }

  // Detect aws-envs pattern: ~/.aws/aws-envs/<name>/config
  const awsEnvsBase = path.join(os.homedir(), '.aws', 'aws-envs');
  const awsEnvsPattern = path.join(awsEnvsBase, path.sep);
  if (configPath.startsWith(awsEnvsPattern) || configPath.startsWith(awsEnvsBase + '/')) {
    const rel = path.relative(awsEnvsBase, configPath);
    const parts = rel.split(path.sep);
    if (parts.length === 2 && parts[1] === 'config') {
      const envName = parts[0];
      const envNames = listAwsEnvNames(awsEnvsBase);
      return { configPath, isAwsEnv: true, envName, envNames };
    }
  }

  return { configPath, isAwsEnv: false };
}

/** Lists available env names under ~/.aws/aws-envs/. */
function listAwsEnvNames(awsEnvsBase: string): string[] {
  try {
    return fs.readdirSync(awsEnvsBase, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Reads AWS profile names from the config file at `configPath`.
 * Supports both [default] and [profile name] section headers.
 */
export function readAwsProfilesFrom(configPath: string): string[] {
  if (!fs.existsSync(configPath)) {
    return ['default'];
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const profiles: string[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Matches [default] or [profile my-profile-name]
      const match = trimmed.match(/^\[(?:profile\s+)?(.+?)\]$/);
      if (match) {
        const name = match[1].trim();
        if (name && !profiles.includes(name)) {
          profiles.push(name);
        }
      }
    }

    return profiles.length > 0 ? profiles : ['default'];
  } catch {
    return ['default'];
  }
}

/**
 * Reads AWS profile names from the currently active config file.
 */
export function readAwsProfiles(): string[] {
  return readAwsProfilesFrom(getAwsConfigPath());
}
