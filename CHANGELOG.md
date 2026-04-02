# Changelog

All notable changes to this extension will be documented here.

## [Unreleased]

## [0.3.12] — 2026-04-02

### Added
- **1Password support** — enter an `op://Vault/Item/field` reference in the credential field and the extension writes `apiKeyHelper: "op read '...'"` to `settings.json`. Claude Code resolves the secret at startup via the 1Password CLI.
- **Model compatibility testing** — each model slot (Sonnet, Haiku, Opus) shows a **Test** pill for Local/Other providers. It sends a minimal `POST /v1/messages` request with `anthropic-version: 2023-06-01` and shows **OK** (green) or **Fail** (red). Test state is persisted per model ID on the provider.
- **Untested-model reminder** — closing the provider dialog with untested models shows a non-blocking reminder with *Go back*, *Save anyway*, and *Don't show again* options.
- **Credential reveal button** — eye icon toggles password visibility; auto-reveals when the value is an `op://` reference.

### Changed
- **"Proxy" renamed to "Local / Other"** — in the provider type selector, section heading, and info text.
- **"OpenAI-compatible" → "Anthropic-compatible"** — info box now correctly describes the `/v1/messages` API that Claude Code uses.
- **Single credential field** — API Key and Auth Token share one input with a compact pill toggle (`API Key | Token`). The pill determines which HTTP header is used; the value is always preserved across toggles. Replaces the old two-field layout.
- **Smarter model dropdowns** — models sorted alphabetically; models matching the slot name (e.g. "sonnet" for the Sonnet field) are listed first with a separator. When models are fetched successfully, the dropdown is selection-only; free-form entry is allowed only when the fetch endpoint is unavailable.
- **`/v1` stripped from base URL** — users who paste a full endpoint URL (e.g. `https://example.com/v1`) no longer get a double `/v1/v1` path.

### Fixed
- **F5 launch task** — `preLaunchTask` now correctly references `npm: watch:tsc` instead of `npm: watch`, fixing the "Debug Anyway" timeout popup.
- **Test invalidation** — changing the base URL, credential, auth type, or provider type resets all test pills. Changing a model selection (dropdown or manual edit) resets that slot's pill.

## [0.3.11] — 2026-04-01

### Fixed
- **AWS Env is now stored per-provider** — each Bedrock provider carries its own `awsEnv` field in `coder-profiles.json`. Previously, the active AWS environment was read from the live `~/.aws/config` symlink at resolve-time, meaning switching envs for one provider silently affected all others. Now `AWS_CONFIG_FILE` is derived from `provider.awsEnv` (written as `~/.aws/aws-envs/<name>/config`) so providers are fully independent.
- **AWS Env selector no longer mutates the system symlink** — switching the AWS Env dropdown no longer rewrites `~/.aws/config`. The selection is saved directly to the provider and applied via the resolver, leaving the system symlink untouched.
- **AWS Env dropdown shows per-provider selection** — when opening the provider drawer, the dropdown now reflects the env stored on *that* provider rather than always defaulting to whichever env the symlink currently points to.

## [0.3.10] — 2026-04-01

### Added
- **aws-envs support** — the provider drawer now detects when `~/.aws/config` is a symlink or `$AWS_CONFIG_FILE` is set and shows the resolved config path as a read-only "AWS Config" field. When the config points to an [easytocloud aws-envs](https://github.com/easytocloud/aws-envs) environment (`~/.aws/aws-envs/<name>/config`), a selectable "AWS Env" dropdown appears instead, letting you switch environments directly from the provider dialog — the symlink is updated and the AWS Profile list refreshes automatically.
- `AWS_CONFIG_FILE` is now written to the Claude Code settings env block for Bedrock presets whenever a non-default config file is in use, ensuring Claude Code picks up the same credentials the extension resolved.
- iCloud dotfiles path normalisation — paths under `~/Library/Mobile Documents/com~apple~CloudDocs/dotFiles/aws/dot-aws/` are transparently mapped to `~/.aws/` so aws-envs detection works when dotfiles are synced via iCloud.

## [0.3.9] — 2026-03-23

### Fixed
- **Proxy presets no longer trigger the Claude Code login prompt** — `ANTHROPIC_AUTH_TOKEN` is now always written when `ANTHROPIC_BASE_URL` is set. Claude Code shows the login screen whenever `AUTH_TOKEN` is absent, regardless of `ANTHROPIC_API_KEY`. Presets with a proxy API key now write both (`ANTHROPIC_API_KEY` for the x-api-key header the proxy expects, `ANTHROPIC_AUTH_TOKEN='local'` as a login suppressor); keyless proxies use `ANTHROPIC_AUTH_TOKEN='local'` only.

## [0.3.8] — 2026-03-23

### Fixed
- **Cleaner settings.json output** — global presets no longer write empty-string or no-op env vars (e.g. `ANTHROPIC_BASE_URL: ""`, `CLAUDE_CODE_USE_BEDROCK: "0"`) that carry no meaning without a parent scope. Project presets now write empty-string overrides only for keys that are actually set in the global scope and need to be cleared — not for every possible key. Additionally, `AWS_PROFILE` and `AWS_REGION` are no longer reset to `""` when switching to a non-Bedrock provider (those variables are irrelevant to non-Bedrock providers and need not be cleared). OpenRouter/auth-token proxy presets no longer write `ANTHROPIC_API_KEY: ""` alongside `ANTHROPIC_AUTH_TOKEN` — only one auth key is ever written per scope.

## [0.3.7] — 2026-03-23

### Fixed
- **Cross-provider env var isolation** — `resolvePreset()` now explicitly resets all provider-choice keys (`CLAUDE_CODE_USE_BEDROCK=0`, `AWS_PROFILE`, `AWS_REGION`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`) before applying provider-specific values. Previously, a workspace preset using a different provider than the global preset would silently inherit global values (e.g. `CLAUDE_CODE_USE_BEDROCK=1` leaking into an Anthropic or proxy workspace preset). Same fix applied to `DISABLE_PROMPT_CACHING`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, and `DISABLE_AUTOUPDATER` — these are now always written explicitly rather than only when truthy.

## [0.3.6] — 2026-03-23

### Changed
- **`claudeCode.disableLoginPrompt` VS Code setting now synced automatically** — when saving a preset, the extension writes this setting at the correct scope (Global for global preset, Workspace for workspace preset) so the Claude Code extension never shows the Anthropic login prompt when using Bedrock or a standalone proxy. Workspace "inherit" mode clears the workspace override to fall back to global.

## [0.3.5] — 2026-03-23

### Changed
- **Standalone mode now automatic for non-Anthropic providers** — Bedrock always sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and `DISABLE_AUTOUPDATER=1` (no toggle needed). Proxy providers default to the same; toggle the "Standalone mode" switch off only when your proxy forwards to Anthropic directly.
- Standalone mode toggle hidden for Bedrock in the provider drawer (always on); visible and defaulting to on for Proxy; not shown for Anthropic.
- **`claudeCode.disableLoginPrompt` VS Code setting now synced automatically** — when saving a preset, the extension writes this setting at the correct scope (Global for global preset, Workspace for workspace preset) so the Claude Code extension never shows the Anthropic login prompt when using Bedrock or a standalone proxy. Workspace "inherit" mode clears the workspace override to fall back to global.

## [0.3.4] — 2026-03-10

### Fixed
- Extension package size reduced by ~50% — `.vscodeignore` now correctly excludes source maps and stale tsc output (only the esbuild bundle `out/extension.js` is shipped)
- Screenshot image resized from 1800×3700 to 1280px wide, reducing it from 452K to 260K

## [0.3.3] — 2026-03-08

### Added
- **esbuild bundler** — `npm run build` now bundles to a single `out/extension.js` (faster builds, smaller output); `npm run watch:tsc` kept for F5 development host
- **Bedrock model cache** — discovered models cached to `~/.claude/bedrock-model-cache-<profile>-<region>.json` with 1-hour TTL; avoids redundant AWS CLI calls
- `docs/ARCHITECTURE.md` — contributor documentation covering preset hierarchy, scope resolution pipeline, webview data injection, and build scripts
- `IMPROVEMENTS.md` — structured improvement backlog with triage and open items table

### Changed
- Status bar icon changed to `$(sparkle)`; inherited scope shows `$(link)` icon with "Inherited from global" tooltip
- Status bar quick-switch placeHolder shows workspace name; each preset item description shows `type · providerName`
- Editing state in webview consolidated into `editing` and `fetched` objects (was 9 module-level variables)
- Chip rendering unified — shared `renderChipHtml()` in `media/webview.js` and `renderChip()` in `src/webview/layout.ts`
- Inline `style="..."` attributes in drawers replaced with named CSS utility classes

### Fixed
- F5 pre-launch task no longer hangs — `.vscode/tasks.json` now uses `watch:tsc` (tsc output) instead of `watch` (esbuild, incompatible with `$tsc-watch` problemMatcher)
- AWS CLI errors in model discovery now surface per-command detail plus a 3-point checklist instead of being silently swallowed
- AWS region validated against known list in `resolvePreset()`; invalid regions throw a descriptive error immediately

### Internal
- ESLint rules upgraded to `error`; `no-var`, `prefer-const`, `no-debugger`, `no-console` (warn), `@typescript-eslint/no-unused-vars` added; `media/webview.js` added to lint scope
- `tsconfig.json` strictness flags: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `skipLibCheck`
- `preserveUnmanagedEnv()` helper extracted in `resolver.ts` — eliminates duplicated env-var filtering logic

## [0.3.2] — 2026-03-06

### Added
- Bedrock providers: **Fetch models from AWS** button discovers inference profiles and foundation models from the account, merged with smart presets in the filterable combobox
- Import/Export: **clipboard option** (copy to clipboard / paste from clipboard) for sharing presets across local and remote sessions
- **Save Changes dialog** when closing the settings panel with unsaved changes — save, discard, or keep the draft for later

### Changed
- Proxy providers without an explicit API key now auto-set `ANTHROPIC_API_KEY=local` to prevent Claude Code from showing the login screen after `/logout`
- **Standalone mode** toggle (renamed) now also sets `DISABLE_AUTOUPDATER=1` — blocks all traffic to Anthropic for fully offline local model use
- Proxy info box explains enabling Standalone mode for local models

## [0.3.1] — 2026-03-06

### Added
- **Filterable combobox** for AWS profiles and model selects — type to filter with substring matching anywhere in the item text, keyboard navigation (arrow keys + Enter), match highlighting, and support for 100+ AWS profiles or 500+ OpenRouter models

### Changed
- Workspace scope color changed from orange to **teal** — visually distinct from providers (orange) and closer to global scope (blue) in function
- Header icon replaced with the extension's isometric stack logo
- Light theme readability improved — `--fg-muted`, `--fg-bright`, `--bg-hover`, `--bg-active`, and `--shadow` now use VS Code theme variables that adapt to both light and dark themes
- Accent colors (`--orange`, `--green`, `--purple`) darkened for better text contrast; brighter variants preserved as `--*-accent` for decorative elements

## [0.3.0] — 2026-03-06

### Added
- **Status bar preset quick-switcher** — shows the active preset and scope; click to switch presets for global or workspace scope via quick-pick dropdown
- **Import/Export presets** — share configurations between machines or team members; export scrubs credentials (`sk-ant-*`, `sk-or-*`, `AKIA*`, `ghp_*`, etc.) and replaces them with `<REPLACE_ME>`; import supports merge or replace mode with automatic ID remapping
- **Draft auto-save** — unsaved changes are automatically persisted to `~/.claude/coder-profiles.draft.json` and restored when the panel is re-opened
- **`.vscodeignore` awareness** — when writing workspace-scope config, the extension auto-adds `.mcp.json` and `.claude/` to `.vscodeignore` if the workspace is a VS Code extension project

### Changed
- **Webview JS extracted from template literal** — all browser-side JavaScript moved from an inline template literal in `src/webview/script.ts` to a standalone `media/webview.js` file loaded via `<script src>`. This eliminates the entire class of escaping bugs (regex `\s` → `s`, TypeScript annotations leaking to browser) that caused multiple regressions in v0.2.x
- Extension now activates `onStartupFinished` so the status bar is visible immediately

## [0.2.6] — 2026-03-06

### Added
- Proxy providers: mutually exclusive **API Key** / **Auth Token** authentication — API Key sets `ANTHROPIC_API_KEY`, Auth Token sets `ANTHROPIC_AUTH_TOKEN` and clears `ANTHROPIC_API_KEY` (required by OpenRouter)
- **OpenRouter auto-detection**: typing an `openrouter.ai` URL auto-switches to Auth Token mode; `/api` is appended silently if omitted from the base URL

## [0.2.5] — 2026-03-06

### Added
- Save All now writes `hasCompletedOnboarding: true` to `~/.claude.json`, preventing Claude Code's first-run login wizard from appearing when Bedrock or a proxy provider is configured
- Per-provider **Disable non-essential traffic** toggle (Bedrock/Proxy) sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` — useful in air-gapped or restricted-network environments

## [0.2.4] — 2026-03-06

### Added
- Proxy/local providers: **Fetch available models** button in the Models section discovers models from `/v1/models` (or `/models` fallback); single-model endpoints auto-select across all tiers, multi-model endpoints populate a dropdown

### Changed
- Anthropic provider no longer shows a Models section — it always uses Claude Code's built-in defaults, and clears any model overrides from outer scopes
- Anthropic provider chips and preset preview show **Haiku / Sonnet / Opus** instead of raw model IDs

### Fixed
- TypeScript type annotations accidentally embedded in the webview template literal caused all drawers to be blank (regression in v0.2.3)

## [0.2.3] — 2026-03-05

### Fixed
- MCP server command auto-split was splitting on the letter "s" instead of whitespace (regex escape lost in template literal)

## [0.2.2] — 2026-03-05

### Fixed
- Adding servers/directories to not-yet-saved groups no longer silently loses items
- Migration from v0.2.0 `projectScopes` key to `workspaceScopes` preserves existing scope assignments

## [0.2.1] — 2026-03-05

### Changed
- Renamed "Project Scope" to "Workspace Scope" — better reflects VS Code workspace semantics
- MCP server command field now auto-splits if arguments are included (e.g. `npx -y @pkg` → command=`npx`, args=[`-y`, `@pkg`])
- Updated command/args placeholders in MCP server drawer for clarity

### Fixed
- Drawer save buttons now show validation errors (red toast) instead of failing silently when required fields are missing
- Validation covers: names, provider type-specific fields (AWS profile, proxy URL), MCP server URLs/commands

## [0.2.0] — 2026-03-04

### Added
- Composable preset architecture: bundle a provider, MCP server groups, and directory groups into reusable presets
- Three provider types: Anthropic Direct, AWS Bedrock, and OpenAI-compatible proxy (Ollama, vLLM, LM Studio, LiteLLM)
- Building block panels with color-coded tiles: Providers (orange), MCP Server Groups (purple), Directory Groups (green)
- Scope management: assign presets to Global and Workspace scopes
- Inherit mode: workspace scope can inherit from global — automatically cleans up workspace-level config
- Workspace-level config output: writes env vars and directories to `{workspace}/.claude/settings.json`
- Drawer-based editing for all building blocks with stacked drawer support
- Editable directory paths with browse button (supports remote/SSH paths)
- Count badges on panel headers
- Scope badges showing active preset name, updating dynamically on changes
- Sample configuration in `examples/coder-profiles.json`

### Changed
- Renamed display name to "Claude Code Personae"
- Replaced flat 5-tab UI with preset-based composable architecture
- All definitions stored in `~/.claude/coder-profiles.json`
- Provider tiles now show all three model tiers (haiku, sonnet, opus)
- MCP group tiles list individual server names
- Directory group tiles list individual paths
- Preset cards show color-coded chips for referenced building blocks
- Bedrock provider tiles show `bedrock · <profile>`, proxy tiles show base URL

### Fixed
- CSP compliance: all styling via CSS classes instead of inline style attributes
- Scope badge updates when presets are renamed

## [0.1.0] — 2026-02-28

### Added
- Initial release
- AWS Bedrock configuration: IAM profile, region, cross-region inference models
- Local / Compatible API provider: Ollama, vLLM, LM Studio, LiteLLM support
- Live model discovery via `/v1/models` endpoint
- MCP server management at user scope (`~/.claude.json`) and workspace scope (`.mcp.json`)
- Model tier selection: Sonnet, Haiku, Opus
- Allowed directory management
- Disable login prompt toggle
- Dirty indicator (● in panel title when unsaved changes exist)

[Unreleased]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.12...HEAD
[0.3.12]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.11...v0.3.12
[0.3.11]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.10...v0.3.11
[0.3.10]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.9...v0.3.10
[0.3.9]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.8...v0.3.9
[0.3.8]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.2.6...v0.3.0
[0.2.6]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/easytocloud/bedrock-claude-code/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/easytocloud/bedrock-claude-code/releases/tag/v0.1.0
