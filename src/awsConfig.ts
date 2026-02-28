import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Returns the path to the AWS config file, respecting $AWS_CONFIG_FILE. */
export function getAwsConfigPath(): string {
  return process.env.AWS_CONFIG_FILE ?? path.join(os.homedir(), '.aws', 'config');
}

/**
 * Reads AWS profile names from the config file.
 * Supports both [default] and [profile name] section headers.
 */
export function readAwsProfiles(): string[] {
  const configPath = getAwsConfigPath();

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
