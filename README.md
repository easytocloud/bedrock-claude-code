# Claude Code Bedrock Settings

A VS Code settings panel for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that lets you configure:

- **AWS Bedrock** — IAM profile, region, cross-region inference models, auth-refresh command
- **Local / Compatible API** — any OpenAI-compatible server (Ollama, vLLM, LM Studio, LiteLLM …)
- **MCP servers** — user-scope (`~/.claude.json`) and project-scope (`.mcp.json`) with full add / edit / delete
- **Allowed directories** — file-system paths Claude Code may access
- **Model tiers** — Sonnet (primary), Haiku (small/fast), Opus (complex), with live model discovery

All settings are written to `~/.claude/settings.json` and work seamlessly with both the Claude Code VS Code extension and the `claude` terminal CLI.

---

## Getting Started

### AWS Bedrock

1. Open the Command Palette → **Open Claude Code Bedrock Settings**.
2. On the **Provider** tab select **AWS Bedrock** and fill in your AWS profile and region.
3. On the **Models** tab pick which model to use for each tier (cross-region inference profiles are recommended).
4. Click **Save Settings**.

### Local / Compatible API (Ollama, vLLM, LM Studio, …)

1. Start your local server.
2. Go to the **Provider** tab → select **Local / Compatible API**.
3. Enter the **Base URL** — without a trailing `/v1` (e.g. `http://localhost:11434` for Ollama, `http://localhost:8000` for vLLM).  
   Claude Code appends `/v1/messages` automatically; the Refresh button fetches `/v1/models`.
4. Open the **Models** tab and click **⟳ Refresh** to load the model list, then choose a model for each tier.
5. Click **Save Settings**.

---

## Features

| Feature | Detail |
|---|---|
| Provider switching | Toggle between AWS Bedrock and any OpenAI-compatible local server |
| Live model discovery | Refresh button fetches `/v1/models` from your local server |
| MCP server management | Add/edit/delete servers at user or project scope |
| Dirty indicator | Title bar shows `●` when unsaved changes exist |
| Disable login prompt | Suppress the Anthropic login prompt when using Bedrock or a local server |

---

## Requirements

- VS Code 1.98 or later
- For Bedrock: AWS CLI configured with a named profile (`aws configure --profile <name>`)
- For Local API: a running OpenAI-compatible server

---

## Extension Settings

This extension does not add VS Code settings. All configuration is written to `~/.claude/settings.json`.

---

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
