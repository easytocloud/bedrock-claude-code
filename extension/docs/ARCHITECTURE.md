# Architecture — bedrock-claude-code

## Conceptual model

```
Providers ──┐
MCP Groups ─┼──► Presets ──► Scopes ──► ~/.claude/settings.json
Dir Groups ─┘                           {workspace}/.claude/settings.json
```

Each **Preset** bundles one Provider with zero or more MCP Server Groups and Directory Groups. **Scopes** (Global and per-Workspace) hold a `ScopeAssignment` that points to a Preset, sets Manual mode, or inherits from Global.

---

## Data storage

| File | Purpose |
|------|---------|
| `~/.claude/coder-profiles.json` | Primary store — all Providers, MCP Groups, Dir Groups, Presets, and Scope assignments |
| `~/.claude/coder-profiles.draft.json` | Auto-saved copy of in-progress panel state; cleared on Save or Discard |
| `~/.claude/settings.json` | Claude Code global env vars, MCP servers, allowed directories (written by resolver) |
| `~/.claude.json` | Claude Code onboarding state — `hasCompletedOnboarding: true` written on save to suppress first-run login wizard |
| `{workspace}/.claude/settings.json` | Workspace-scope overrides (written by resolver) |
| `{workspace}/.mcp.json` | Workspace MCP servers (written by resolver) |
| `~/.claude/bedrock-model-cache-<profile>-<region>.json` | Cached Bedrock models (1-hour TTL) — avoids redundant AWS CLI calls |

The profile store is managed by `src/profiles.ts` (`readProfileStore` / `writeProfileStore`). A migration in `readProfileStore` handles the v0.2.1 rename of `projectScopes` → `workspaceScopes`.

---

## Scope resolution

`src/resolver.ts` contains the full resolution pipeline:

1. **`resolvePreset(store, presetId)`** — looks up the Preset, finds its Provider and referenced Groups, and flattens everything into a `ResolvedConfig` (`env`, `allowedDirectories`, `mcpServers`, `awsAuthRefresh`). For Bedrock providers with an `awsEnv`, derives `AWS_CONFIG_FILE` from the stored env name. For Local/Other providers with `op://` credentials, writes `apiKeyHelper` instead of env vars.
2. **`filterForGlobal(env)`** — strips no-op values (empty strings, `CLAUDE_CODE_USE_BEDROCK=0`) before writing to `~/.claude/settings.json`.
3. **`filterForProject(env, globalEnv)`** — keeps empty/no-op values only when the global scope has that key set to a meaningful value (override needed); otherwise drops them.
4. **`applyGlobalConfig(resolved)`** — merges resolved env vars (via `filterForGlobal`) into `~/.claude/settings.json`, preserving any keys not in `MANAGED_ENV_KEYS`.
5. **`applyProjectConfig(resolved, workspaceRoot)`** — same merge (via `filterForProject`) into `{workspace}/.claude/settings.json` plus `.mcp.json`; also calls `ensureVscodeignore`.
6. **`cleanProjectConfig(workspaceRoot)`** — removes all managed keys from the project settings file (used when workspace scope is set to Inherit).
7. **`applyAllScopes(store, workspaceRoot)`** — orchestrates the above: resolves global scope, then workspace scope (or calls `cleanProjectConfig` if it inherits).

`MANAGED_ENV_KEYS` (defined in `src/models.ts`) is the authoritative list of env var names the extension owns. Non-managed keys are preserved across writes via `preserveUnmanagedEnv()`.

---

## Key extension modules

| Module | Role |
|--------|------|
| `src/panel.ts` | Main webview panel — hosts the settings UI, handles messages, draft persistence, model fetching |
| `src/resolver.ts` | Scope resolution pipeline — resolves presets to flat config and writes Claude Code files |
| `src/profiles.ts` | Profile store I/O — `readProfileStore` / `writeProfileStore` with migration |
| `src/statusBar.ts` | Status bar quick-switcher — shows active preset, click to switch via quick-pick |
| `src/importExport.ts` | Import/export with credential scrubbing and ID remapping |
| `src/awsConfig.ts` | AWS config detection — symlink resolution, aws-envs discovery, iCloud path normalisation |
| `src/models.ts` | Constants — `MANAGED_ENV_KEYS`, `AWS_REGIONS`, default model IDs, model catalogs |
| `src/types.ts` | TypeScript interfaces — `ProfileStore`, `ProviderProfile`, `Preset`, `ScopeAssignment` |
| `src/claudeSettings.ts` | Reads/writes `~/.claude/settings.json` |
| `src/claudeJson.ts` | Reads/writes `~/.claude.json` (onboarding state) |
| `src/mcpJson.ts` | Reads/writes `{workspace}/.mcp.json` |

---

## Webview architecture

The settings panel (`src/panel.ts`) hosts a VS Code Webview. The HTML is assembled server-side in `src/webview/`:

| Module | Role |
|--------|------|
| `index.ts` | Assembles the full HTML page; injects `window.__DATA__` |
| `layout.ts` | Renders the top-level scope cards and preset/building-block sections |
| `components.ts` | Shared HTML primitives (chips, badges, form fields) |
| `drawers.ts` | Drawer HTML for editing Providers, MCP Groups, Dir Groups, Presets |
| `styles.ts` | All CSS as a tagged template literal |
| `script.ts` | Builds the `window.__DATA__` inline script (model catalogs, default IDs) |

All browser-side JavaScript lives in `media/webview.js` (plain JS, **not** inside a TypeScript template literal). The file is loaded via `<script src="...">` using a webview URI. Extension-side data is injected as `window.__DATA__` in a separate inline `<script>` tag built by `script.ts`.

This separation was introduced in v0.3.0 to eliminate an entire class of escaping bugs where regex literals and TypeScript annotations leaked through the template literal into the browser.

---

## Credential scrubbing

`src/importExport.ts` exports a `scrubCredentials(store)` function used when exporting presets. It redacts values matching known secret patterns (`sk-ant-*`, `AKIA*`, `sk-or-*`, `ghp_*`, and any 20+ character alphanumeric string) replacing them with `<REPLACE_ME>`.

The same logic is **not** applied to the draft file, because the draft must hold real credentials so that the "Save Changes" path on panel close can write them to the real store.

---

## Build

| Script | What it does |
|--------|-------------|
| `npm run build` | Bundles `src/extension.ts` and all imports into `out/extension.js` via `esbuild.js` |
| `npm run watch` | Same as `build` in watch mode |
| `npm run compile` | Type-checks with `tsc` only (no bundling) |
| `npm run lint` | ESLint over `src/**/*.ts` and `media/webview.js` |
| `npm run package` | Creates a `.vsix` using `vsce package` |
| `vscode:prepublish` | Runs `build` before marketplace publish |

`media/webview.js` is **not** bundled — it is loaded at runtime by the webview via `asWebviewUri` and must remain a standalone file.

---

## Development setup

```bash
git clone https://github.com/easytocloud/bedrock-claude-code
cd bedrock-claude-code
npm install
npm run watch        # esbuild in watch mode (general development)
npm run watch:tsc    # tsc in watch mode (required for F5 — uses $tsc-watch problemMatcher)
# Press F5 in VS Code to launch Extension Development Host
# Open the settings panel via the Command Palette: "Open Claude Code Personae"
# To inspect the webview, run "Developer: Open Webview Developer Tools" from the palette
```

**Note:** The F5 launch configuration uses `npm run watch:tsc` (not `npm run watch`) as its `preLaunchTask`. Using esbuild watch for F5 will cause a "Debug Anyway" timeout because esbuild output is not compatible with the `$tsc-watch` problem matcher.
