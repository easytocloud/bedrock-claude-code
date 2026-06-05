# Roadmap

This document captures planned work and open design decisions.

---

## Configuration as Code

### `.ccp` file per project

A tiny JSON file at the repo root declaring the desired preset:

```json
{ "preset": "bedrock-prod" }
```

No credentials — safe to commit. `ccp apply` reads it before falling back to `workspaceScopes`. Makes preset assignment auditable in git history and enables repos that never open in VS Code (CI, SSH, new teammates) to self-describe their required preset. `ccp scan` can discover repos by looking for this file.

---

## Preset sync / propagation

### Problem

When a preset — or any of its components (provider models, MCP server groups, directory groups) — is updated, all workspaces using that preset have stale `.claude/settings.json` files until they are re-applied. `ccp sync` (shipped v0.2.0) covers the manual case.

### Options remaining

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

1. Extend extension save to re-apply all workspaces (Option 2) — post-demo refactor
2. `ccp watch` as a `launchd` agent (Option 3) — separate workstream
3. `ccp init-hooks` for git hook installation (Option 4) — pairs well with Option 3

---

## CLI completeness

### Headless setup

- **`ccp init`** — interactive wizard: pick provider type, fill in credentials, name the preset, assign to current directory. Covers the "new machine" case without opening VS Code.
- **`ccp validate`** — verify all presets in the store resolve correctly (provider exists, MCP groups and dir groups exist, no broken references). Exits non-zero — designed for CI.
- **`ccp diagnose`** — health check: reach each provider's endpoint, verify MCP server commands exist on PATH, check AWS profile is valid.

### Output formats

- **`ccp export --format env`** — emit shell export statements (`export AWS_PROFILE=prod AWS_REGION=eu-west-1 ...`) so a script can `eval $(ccp export --format env --preset bedrock-prod)` without touching any config files. Useful for one-shot commands and CI.

---

## Team / multi-machine sharing

- **`ccp sync --from <git-url|file>`** — pull a shared "team profiles" repo, merge structure into local store, leave credentials untouched. New team members run this once to get the full preset catalogue; they supply their own credentials. Builds on the existing import-merge logic.
- **Diff on import** — before `--mode replace`, show a structured diff of what would change (presets added/removed/modified), not a raw JSON diff.

---

## Observability

- **`ccp history`** — append-only log of preset applications (`~/.claude/ccp-history.jsonl`) with timestamps and preset versions. Answers: "when did I last apply `bedrock-prod` here, and was it the current version?"
- **Diff before Save All** — collapsible preview in the extension showing exactly what will be written to `settings.json` and `.mcp.json` before committing. Currently a black box.

---

## Scale (when presets multiply)

- **Preset tags** — free-form `tags: ["bedrock", "prod", "eu"]` on presets; filter/group in the GUI and via `ccp list --tag prod`.
- **`ccp diff <preset-a> <preset-b>`** — structural diff between two presets: provider, models, MCP groups, directory groups.
- **Search in the preset grid** — filter input in the VS Code panel, essential past ~15 presets.

---

## MCP depth

- **MCP server health check** — "Test" button per MCP server: spawn the process, send a `tools/list` JSON-RPC call, report discovered tools. Same UX as the existing model test pills.
- **MCP server discovery** — scan npm global packages for `@modelcontextprotocol/server-*` and `mcp-server-*` naming conventions; offer to add found servers automatically.

---

## Future ideas

- `ccp scan [--root ~/Developer]` — crawl directories to find all deployed `.claude/settings.json` files and correlate back to presets; surfaces repos not tracked in `workspaceScopes`
