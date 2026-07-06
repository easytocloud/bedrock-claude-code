# Changelog

All notable changes to the `@easytocloud/claude-personae` CLI will be documented here.

## [Unreleased]

## [0.3.0] — 2026-07-06

### Changed
- **Workspace MCP servers moved to `~/.claude.json`** — preset MCP servers for a workspace are now written to `projects["<dir>"].mcpServers` in `~/.claude.json` (Claude Code's per-project "local" scope) instead of `<dir>/.mcp.json`. Nothing MCP-related is written inside the repository anymore, so there's nothing to accidentally commit and no trust-approval prompt.
- **Ownership-aware merging** — the store records which server names ccp wrote (`mcpOwnership` in `coder-profiles.json`); on every apply only those names are replaced. Servers added by hand (e.g. `claude mcp add`) survive preset switches, at both global and workspace level. Migration note: the *first* apply after upgrading treats all existing top-level `mcpServers` in `~/.claude.json` as ccp-owned (matching the old wholesale-replace behavior); from then on hand-added global servers are preserved.
- **`ccp sync` re-aligns `~/.claude.json` with the profile store** — sync (and apply/switch for the current workspace) now also migrates any servers ccp previously wrote into a workspace `.mcp.json`: matching names are removed, the `mcpServers` key is dropped when empty, and the file is deleted when nothing else remains. Servers your team added under other names are left untouched.

## [0.2.5] — 2026-06-29

> Not published to npm (publish tooling issue); these changes first shipped in 0.3.0.

### Changed
- **`ccp switch` defaults to the current workspace** — previously `ccp switch <preset>` set the *global* preset, which affected all workspaces set to Inherit. The default scope is now the current directory (workspace). Use `--global` / `-g` to explicitly target the global fallback. The `--workspace` / `-w` flag still works but is now redundant.

  ```bash
  ccp switch dev                    # set preset for the current workspace (was: global)
  ccp switch bedrock-prod --global  # set the global fallback (explicit opt-in)
  ccp switch --inherit              # current workspace back to inheriting global
  ```

## [0.2.4] — 2026-06-21

### Fixed
- **vLLM and LM Studio base URLs corrected** — both providers had a trailing `/v1` in their default `ANTHROPIC_BASE_URL`. Claude Code appends `/v1/messages` itself, so the trailing `/v1` caused requests to hit `/v1/v1/messages` and fail. Default URLs are now `http://localhost:8000` (vLLM) and `http://localhost:1234` (LM Studio), matching the official Anthropic compatibility docs for both projects.

## [0.2.3] — 2026-06-20

### Fixed
- **`/login` prompt no longer appears for 3rd-party providers** — `applyAllScopes()` now writes `hasCompletedOnboarding: true` to `~/.claude.json` on every invocation, so `ccp apply` / `ccp sync` / `ccp use` / `ccp set` all structurally guarantee the flag is set. Previously this depended on every caller remembering to call `ensureOnboardingComplete()` separately.
- **No-credential local servers no longer trigger OAuth fallback** — when no credential is configured for a `proxy` provider (Ollama, LM Studio), the resolver writes a placeholder `ANTHROPIC_AUTH_TOKEN=none`. The placeholder satisfies Claude Code's Bearer-header check and is ignored by local servers.
- **Catalog-driven URL/auth coercion** — `ANTHROPIC_BASE_URL` is normalised to the catalogue's scheme + path for known proxy presets (`openrouter`, `ollama`, `lmstudio`, `omlx`, `vllm`, `litellm`) even when the stored `proxyBaseUrl` is stale, and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is forced on for every known 3rd-party preset.

### Note
- **If `claude` still prompts for `/login` after `ccp apply`**, quit-and-restart your terminal session. Claude Code reads `~/.claude.json` once at startup, so a long-running shell or IDE session may carry cached state until the process restarts.

## [0.2.1] — 2026-06-05

### Fixed
- **Mutually exclusive credentials** — `~/.claude/settings.json` and `{workspace}/.claude/settings.json` no longer contain both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` at the same time. Previously the resolver wrote `ANTHROPIC_AUTH_TOKEN='local'` alongside `ANTHROPIC_API_KEY` in "Local / Other" provider apikey mode (and `'local'` alone in keyless mode) as a login-prompt suppression hack. Now exactly one of the two is written (or neither when keyless). Switching auth modes via the GUI and then running `ccp apply` / `ccp sync` removes the previously-written variable.

### Changed
- **`DISABLE_AUTOUPDATER` no longer managed** — auto-updating the Claude Code CLI is a per-machine lifecycle decision, not a per-preset one. The resolver no longer writes this variable, so running `ccp apply` or `ccp sync` across workspaces never flips your auto-update behavior. Any previously written value is cleaned out on the next save (clean-slate migration).

## [0.2.0] — 2026-06-05

Initial public release. Companion CLI for the Claude Code Personae VS Code extension. Operates on the same `~/.claude` profile store.

### Commands
- `ccp list [presets|providers|scopes]` — list configured items (default: all)
- `ccp current` — show the active global + workspace preset
- `ccp switch <preset> [--global|--workspace|--inherit|--manual]` — set the active preset and apply it
- `ccp apply` — re-apply global + current-workspace scopes
- `ccp sync [--dry-run]` — re-apply global + EVERY known workspace scope (skips manual, clears inherit, flags missing dirs)
- `ccp export [--out|--no-scrub]` — print the store as JSON (credentials scrubbed by default)
- `ccp import <file|-> [--mode merge|replace]` — import a store from file or stdin
