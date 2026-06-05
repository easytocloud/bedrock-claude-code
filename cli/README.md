# claude-personae (`ccp`)

A small CLI to switch [Claude Code](https://claude.com/claude-code) provider presets
from the shell — the headless companion to the
**[Claude Code Personae](https://marketplace.visualstudio.com/items?itemName=easytocloud.bedrock-claude-code)**
VS Code extension.

It operates on the **same profile store** the extension uses
(`~/.claude/coder-profiles.json`) and writes the same Claude Code config files, so a
preset you author in the GUI can be switched from a terminal — over SSH, inside a
devcontainer, or from a script.

> **Authoring stays in the GUI.** Create and edit providers, presets, MCP groups and
> directory groups in the VS Code extension. This CLI is for the *operate* verbs:
> switch, apply, list, current, export, import.

## Install

```bash
npm install -g @easytocloud/claude-personae
```

Provides two commands: `claude-personae` and the short alias `ccp`.

## Usage

```
ccp <command> [options]
```

| Command | Description |
|---|---|
| `ccp list [presets\|providers\|scopes]` | List configured items (default: all). `--json` for machine output. |
| `ccp current` | Show the active global + workspace preset. |
| `ccp switch <preset> [scope]` | Set the active preset and write the config files. |
| `ccp apply` | Re-apply the stored scopes to disk (reprovision a machine / fresh checkout). |
| `ccp export` | Print the store as JSON with **credentials scrubbed** (`-o <file>` to write). |
| `ccp import <file\|->` | Import a store (`--mode merge` \| `replace`). `-` reads stdin. |

### Scope (for `switch`)

By default `switch` sets the **global** preset. To target a project instead:

| Flag | Effect |
|---|---|
| `--global`, `-g` | Set the global preset (default). |
| `--workspace`, `-w` | Set the preset for a workspace (uses the current directory). |
| `--path <dir>` | Workspace directory to target (implies `--workspace`). |
| `--inherit` | Workspace inherits the global preset (removes its overrides). |
| `--manual` | Workspace is managed manually (the CLI leaves its files alone). |

### Examples

```bash
ccp list presets
ccp switch bedrock-prod               # set the global preset
ccp switch dev --workspace            # set a preset for the current project
ccp switch --workspace --inherit      # project goes back to inheriting global
ccp apply                             # rewrite config files from the stored scopes
ccp export -o presets.json            # share presets (keys replaced with <REPLACE_ME>)
cat presets.json | ccp import - --mode replace
```

## What it writes

- **Global scope** → `~/.claude/settings.json` (env vars, allowed directories,
  `awsAuthRefresh`/`apiKeyHelper`) and `~/.claude.json` (MCP servers).
- **Workspace scope** → `<dir>/.claude/settings.json` and `<dir>/.mcp.json`
  (only the keys that differ from global). `--inherit` removes these so global applies.

Presets are resolved by the exact same engine as the extension, so a Bedrock preset
sets `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_PROFILE`, `AWS_REGION`, the model overrides, etc.

## License

MIT
