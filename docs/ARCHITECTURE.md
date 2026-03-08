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
| `{workspace}/.claude/settings.json` | Workspace-scope overrides (written by resolver) |
| `{workspace}/.mcp.json` | Workspace MCP servers (written by resolver) |

The profile store is managed by `src/profiles.ts` (`readProfileStore` / `writeProfileStore`). A migration in `readProfileStore` handles the v0.2.1 rename of `projectScopes` → `workspaceScopes`.

---

## Scope resolution

`src/resolver.ts` contains the full resolution pipeline:

1. **`resolvePreset(store, presetId)`** — looks up the Preset, finds its Provider and referenced Groups, and flattens everything into a `ResolvedConfig` (`env`, `allowedDirectories`, `mcpServers`, `awsAuthRefresh`).
2. **`applyGlobalConfig(resolved)`** — merges resolved env vars into `~/.claude/settings.json`, preserving any keys not in `MANAGED_ENV_KEYS`.
3. **`applyProjectConfig(resolved, workspaceRoot)`** — same merge into `{workspace}/.claude/settings.json` plus `.mcp.json`; also calls `ensureVscodeignore`.
4. **`cleanProjectConfig(workspaceRoot)`** — removes all managed keys from the project settings file (used when workspace scope is set to Inherit).
5. **`applyAllScopes(store, workspaceRoot)`** — orchestrates the above: resolves global scope, then workspace scope (or calls `cleanProjectConfig` if it inherits).

`MANAGED_ENV_KEYS` (defined in `src/models.ts`) is the authoritative list of env var names the extension owns. Non-managed keys are preserved across writes via `preserveUnmanagedEnv()`.

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
npm run watch        # esbuild in watch mode
# Press F5 in VS Code to launch Extension Development Host
# Open the settings panel via the Command Palette: "Open Claude Code Personae"
# To inspect the webview, run "Developer: Open Webview Developer Tools" from the palette
```
