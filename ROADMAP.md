# Roadmap

This document captures architectural decisions and planned work discussed during development.

---

## CLI & Core extraction

### Context

The extension currently contains all logic for reading/writing `~/.claude/coder-profiles.json` and resolving presets to `settings.json` files. To enable programmatic access — scripting, CI, git hooks — this logic will be extracted into two independent packages:

| Package | npm name | Purpose |
|---|---|---|
| `ccp-core` | `@easytocloud/ccp-core` | Shared types, profile store read/write, preset resolver |
| `ccp-cli` | `@easytocloud/ccp` | Terminal CLI wrapping core |

The extension will remain unchanged until after the demo, then be refactored to depend on `ccp-core` instead of its own copies of `src/profiles.ts`, `src/resolver.ts`, and `src/types.ts`.

### CLI commands (initial scope)

| Command | Description |
|---|---|
| `ccp list` | List all presets |
| `ccp show <preset>` | Show preset details (provider, MCP groups, directory groups) |
| `ccp use <preset> [--workspace]` | Assign preset to global or current working directory |
| `ccp where <preset>` | List all directories where a preset is assigned |
| `ccp status` | Show all workspace → preset assignments |
| `ccp sync` | Re-apply all workspace assignments (rewrite `.claude/settings.json` for every known workspace) |

### Source of truth for workspace assignments

`~/.claude/coder-profiles.json` contains a `workspaceScopes` map (`workspacePath → { mode, presetId }`) that already tracks which preset is assigned to which directory. This is the index `ccp where` and `ccp status` query.

**Gap:** `workspaceScopes` only contains workspaces opened in VS Code with a preset assigned via the UI. Repos with manually edited `.claude/settings.json` won't appear. Future `ccp scan` command could crawl configurable root directories to find all deployed settings files and correlate them back to presets.

---

## Preset sync / propagation

### Problem

When a preset — or any of its components (provider models, MCP server groups, directory groups) — is updated, all workspaces using that preset have stale `.claude/settings.json` files until they are re-applied.

### Options evaluated

**Option 1 — Pull on demand (`ccp sync`)**
CLI command re-resolves all presets in `workspaceScopes` and rewrites their `.claude/settings.json` files.
- `ccp sync` — re-apply all workspace assignments
- `ccp sync --dry-run` — show what would change without writing
- Simple, predictable, no background processes. Manual step — easy to forget.
- **Selected for initial CLI release.**

**Option 2 — Extension save triggers re-apply (natural fit)**
Extend the existing save handler: when a preset is saved in the extension UI, iterate all `workspaceScopes` entries and re-apply to every known workspace path (not just the current one).
- No new infrastructure, fits the existing flow.
- Only fires when VS Code is open and the UI is used.
- **Planned for extension refactor (post-demo).**

**Option 3 — File watcher / daemon (`ccp watch`)**
Long-running process watches `~/.claude/coder-profiles.json` for changes and re-applies automatically. Can be installed as a macOS `launchd` agent for always-on behavior.
- Fully automatic, works regardless of trigger source (UI or CLI).
- Background process adds complexity; overkill for most users initially.
- **Roadmap — post-initial-release.**

**Option 4 — Git hooks per repo**
`post-checkout` / `post-merge` hooks call `ccp apply` in the repo root, re-applying the assigned preset after branch switches or pulls. Installed via `ccp init-hooks`.
- Fires at exactly the right moment when switching context.
- Must be installed per repo; doesn't handle preset definition changes directly.
- **Roadmap — good companion to Option 3.**

### Recommended path

1. Ship `ccp sync` in the CLI (Option 1) — covers manual and scripted workflows
2. Extend extension save to re-apply all workspaces (Option 2) — post-demo refactor
3. `ccp watch` as a `launchd` agent (Option 3) — separate workstream
4. `ccp init-hooks` for git hook installation (Option 4) — pairs well with Option 3

---

## Future ideas

- `ccp scan [--root ~/Developer]` — crawl directories to find all deployed `.claude/settings.json` files and correlate back to presets; surfaces repos not tracked in `workspaceScopes`
- `ccp export / import` — same as extension UI export/import, credential-scrubbed
- Homebrew formula for `ccp` — `brew install easytocloud/tap/ccp`
