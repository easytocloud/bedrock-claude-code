# Architecture — bedrock-claude-code

## Conceptual model

```
Providers ──┐
MCP Groups ─┼──► Presets ──► Scopes ──► ~/.claude/settings.json
Dir Groups ─┘                           {workspace}/.claude/settings.json
```

Each **Preset** bundles one Provider with zero or more MCP Server Groups and Directory Groups. **Scopes** (Global and per-Workspace) hold a `ScopeAssignment` that points to a Preset, sets Manual mode, or inherits from Global.

Two UI surfaces (since 0.7.0): the **main panel** composes building blocks/Presets and assigns the Global scope only; the **Activity Bar sidebar** (`src/sidebar.ts` + `media/sidebar.js`) shows the effective preset per workspace and handles per-workspace switching. Workspaces inherit Global unless the sidebar (or status bar quick-pick) sets an override.

---

## Data storage

| File | Purpose |
|------|---------|
| `~/.claude/coder-profiles.json` | Primary store — all Providers, MCP Groups, Dir Groups, Presets, and Scope assignments |
| `~/.claude/coder-profiles.draft.json` | Auto-saved copy of in-progress panel state; cleared on Save or Discard |
| `~/.claude/settings.json` | Claude Code global env vars, MCP servers, allowed directories (written by resolver) |
| `~/.claude.json` | MCP servers (top-level `mcpServers` for global scope, `projects["<ws>"].mcpServers` for workspace scope, ownership-merged) + onboarding state (`hasCompletedOnboarding: true` written on save to suppress first-run login wizard) |
| `{workspace}/.claude/settings.json` | Workspace-scope overrides (written by resolver) |
| `{workspace}/.mcp.json` | **No longer written** (pre-0.4.0 legacy) — servers we once wrote there are migrated out on apply |
| `~/.claude/bedrock-model-cache-<profile>-<region>.json` | Cached Bedrock models (1-hour TTL) — avoids redundant AWS CLI calls |

The profile store is managed by `src/profiles.ts` (`readProfileStore` / `writeProfileStore`). A migration in `readProfileStore` handles the v0.2.1 rename of `projectScopes` → `workspaceScopes`.

---

## Scope resolution

`src/resolver.ts` contains the full resolution pipeline:

1. **`resolvePreset(store, presetId)`** — looks up the Preset, finds its Provider and referenced Groups, and flattens everything into a `ResolvedConfig` (`env`, `allowedDirectories`, `mcpServers`, `awsAuthRefresh`). For Bedrock providers with an `awsEnv`, derives `AWS_CONFIG_FILE` from the stored env name. For Local/Other providers with `op://` credentials, writes `apiKeyHelper` instead of env vars.
2. **`filterForGlobal(env)`** — strips no-op values (empty strings, `CLAUDE_CODE_USE_BEDROCK=0`) before writing to `~/.claude/settings.json`.
3. **`filterForProject(env, globalEnv)`** — keeps empty/no-op values only when the global scope has that key set to a meaningful value (override needed); otherwise drops them.
4. **`applyGlobalConfig(resolved, previouslyOwned?)`** — merges resolved env vars (via `filterForGlobal`) into `~/.claude/settings.json`, preserving any keys not in `MANAGED_ENV_KEYS`; ownership-merges MCP servers into `~/.claude.json` and returns the owned names.
5. **`applyProjectConfig(resolved, workspaceRoot, previouslyOwned)`** — same merge (via `filterForProject`) into `{workspace}/.claude/settings.json`; MCP servers go to `~/.claude.json` `projects` block; migrates legacy `.mcp.json` entries out; also calls `ensureVscodeignore`. Returns the owned names.
6. **`cleanProjectConfig(workspaceRoot, ownedMcpNames)`** — removes all managed keys from the project settings file and our MCP servers from the `projects` block + legacy `.mcp.json` (used when workspace scope is set to Inherit).
7. **`applyAllScopes(store, workspaceRoot)`** — orchestrates the above: resolves global scope, then workspace scope (or calls `cleanProjectConfig` if it inherits). Tracks written server names in `store.mcpOwnership` and persists the store when that record changes, so hand-added servers (`claude mcp add`) survive preset switches.

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
| `src/claudeJson.ts` | Reads/writes `~/.claude.json` — MCP servers (global + per-project `projects` block, ownership-merged) and onboarding state |
| `src/mcpJson.ts` | Reads `{workspace}/.mcp.json` (migration import) + legacy cleanup of servers we once wrote there |

---

## Webview architecture

The settings panel (`src/panel.ts`) hosts a VS Code Webview. The HTML is assembled server-side in `src/webview/`:

| Module | Role |
|--------|------|
| `index.ts` | Assembles the full HTML page; injects `window.__DATA__` and `window.__ICON_BASE__` |
| `layout.ts` | Renders the Global scope card (the only scope in the panel) and preset/building-block sections, incl. provider brand tiles |
| `../providerIcons.ts` | Shared provider-flavor inference + brand tile catalog (used by panel layout and sidebar; mirrored browser-side in `media/webview.js`) |
| `components.ts` | Shared HTML primitives (chips, badges, form fields) |
| `drawers.ts` | Drawer HTML for editing Providers, MCP Groups, Dir Groups, Presets |
| `styles.ts` | All CSS as a tagged template literal |
| `script.ts` | Builds the `window.__DATA__` inline script (model catalogs, default IDs) |

All browser-side JavaScript lives in `media/webview.js` (plain JS, **not** inside a TypeScript template literal). The file is loaded via `<script src="...">` using a webview URI. Extension-side data is injected as `window.__DATA__` in a separate inline `<script>` tag built by `script.ts`.

The sidebar view follows the same pattern on a smaller scale: `src/sidebar.ts` (WebviewViewProvider, state projection, styles) + `media/sidebar.js` (plain JS renderer). Provider logos ship as SVGs in `media/provider-icons/` and are served via `asWebviewUri` (`img-src` is in both CSPs). Panel tile colors use `flavor-*` CSS classes because the CSP blocks inline `style` attributes; the sidebar sets colors via the CSSOM, which CSP permits.

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
