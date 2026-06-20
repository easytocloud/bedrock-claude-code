# Claude Code Personae

Composable, preset-based configuration for [Claude Code](https://claude.com/claude-code) —
switch between Anthropic and a curated set of 3rd-party providers (Amazon Bedrock,
OpenRouter, Ollama, LM Studio, oMLX, vLLM, LiteLLM, or a custom Anthropic-compatible
proxy) with reusable MCP server and directory groups.

This repository is an **npm workspaces monorepo** with three packages:

| Package | What it is | Ships to |
|---|---|---|
| [`extension/`](extension) | The **VS Code extension** — a GUI for authoring and switching presets. | VS Code Marketplace (`easytocloud.bedrock-claude-code`) |
| [`cli/`](cli) | The **`claude-personae` / `ccp` CLI** — switch and apply presets from the shell (headless, SSH, CI). | npm (`@easytocloud/claude-personae`) |
| [`core/`](core) | The shared **engine** — preset resolution, profile store I/O, AWS config detection. Bundled into both consumers; not published. | — |

The extension and the CLI operate on the **same profile store**
(`~/.claude/coder-profiles.json`) and write the same Claude Code config files
(`~/.claude/settings.json`, `.mcp.json`). Author your providers/presets in the GUI;
switch them from either the GUI or the CLI.

## Quick start

```bash
# VS Code extension
code --install-extension easytocloud.bedrock-claude-code

# CLI
npm install -g @easytocloud/claude-personae
ccp list presets
ccp switch bedrock-prod
```

## Development

```bash
npm install            # link workspaces, install deps
npm run build          # build core → extension → cli (in that order)
npm run compile        # type-check (tsc -b)
npm run lint           # lint the extension

npm run package:extension   # build the .vsix (vsce package --no-dependencies)
```

- **Extension F5 debugging:** open the repo in VS Code and press F5 — the launch
  config (`.vscode/launch.json`) points at `extension/` and the `watch-extension`
  task builds `core` first via TypeScript project references.
- **CLI:** `node cli/dist/cli.js <command>` after a build, or `npm link` inside `cli/`.

See [`extension/README.md`](extension/README.md) for the full feature guide and
[`cli/README.md`](cli/README.md) for the command reference.

## License

MIT — see [LICENSE](LICENSE).
