# Changelog

All notable changes to the `@easytocloud/claude-personae` CLI will be documented here.

## [Unreleased]

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
