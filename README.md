# Claude Code Personae

A VS Code extension for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) configurations through composable, reusable presets.

![Claude Code Personae screenshot](images/screenshot.png)

## Concept

Instead of editing JSON files by hand, this extension lets you build **presets** from three types of building blocks:

- **Providers** — API backends: Anthropic Direct, AWS Bedrock, or any Anthropic-compatible proxy (LiteLLM, OpenRouter, Ollama, vLLM, LM Studio, …)
- **MCP Server Groups** — named collections of MCP servers
- **Directory Groups** — additional directories Claude Code may access

A **preset** bundles one provider + any number of MCP server groups + any number of directory groups into a single switchable configuration.

Presets are then assigned to **scopes**:

| Scope | Config files written | Dropdown options |
|---|---|---|
| **Global** | `~/.claude/settings.json`, `~/.claude.json` | Any preset, or Manual |
| **Workspace** | `{workspace}/.claude/settings.json`, `.mcp.json` | Any preset, Inherit from Global, or Manual |

Switching a scope's preset instantly reconfigures Claude Code — no manual file editing required.

## Storage

All building blocks, presets, and scope assignments are stored in a single file:

```
~/.claude/coder-profiles.json
```

On **Save All**, the extension resolves the active presets and writes the resulting flat configuration into Claude Code's own files. When a workspace scope is set to **Inherit from Global**, any previously written workspace-level settings are cleaned up automatically.

A sample configuration is included in [`examples/coder-profiles.json`](examples/coder-profiles.json).

## Getting Started

1. Open the Command Palette → **Open Claude Code Settings**
2. Create a **Provider** (e.g. AWS Bedrock with your profile and region)
3. Optionally create **MCP Server Groups** and **Directory Groups**
4. Create a **Preset** that combines your provider with any groups
5. Assign the preset to the **Global** or **Workspace** scope
6. Click **Save All**

### AWS Bedrock

- Select provider type **Bedrock**, fill in your AWS profile name and region
- Pick models from the smart presets or click **Fetch models from AWS** to discover all inference profiles and foundation models in your account
- Optionally set an auth-refresh command (e.g. `aws sso login --profile my-profile`)
- Claude Code's login/logout commands are automatically disabled when using Bedrock
- If `$AWS_CONFIG_FILE` is set or `~/.aws/config` is a symlink, the resolved config path is shown as **AWS Config** (read-only). If you use [easytocloud aws-envs](https://github.com/easytocloud/aws-envs), an **AWS Env** dropdown appears instead — each provider stores its own env selection in `coder-profiles.json`, so different providers can point to different AWS environments independently

### Local / Other (Ollama, vLLM, LM Studio, LiteLLM, OpenRouter, …)

- Select provider type **Local / Other**, enter the base URL (e.g. `http://localhost:11434`)
- Click **Fetch available models** to discover models from `/v1/models`
  - Single-model endpoints auto-select the model for all tiers
  - Multi-model endpoints show a selection-only dropdown (sorted alphabetically, with slot-matching models listed first)
  - If the endpoint does not expose `/v1/models`, the fetch fails gracefully and you can type model IDs manually
- **Test models** — each model slot has a **Test** pill that sends a minimal request to `POST /v1/messages` to verify Anthropic API compatibility. Results (OK / Fail) are persisted on the provider
- **Credential** — enter an API key or token directly, or use an `op://Vault/Item/field` 1Password reference. A compact pill toggle switches between **API Key** (`x-api-key` header) and **Token** (`Authorization: Bearer`). The value is preserved when toggling
- **Standalone mode** is on by default — it blocks all traffic to Anthropic (telemetry, updates, login prompt). Disable it only if your proxy forwards requests to Anthropic directly and you need the Anthropic login flow.

### OpenRouter

- Select provider type **Local / Other**, enter `https://openrouter.ai` as the base URL (the `/api` suffix is added automatically; `/v1` is stripped if pasted)
- The auth pill auto-switches to **Token** when an `openrouter.ai` URL is detected. Paste your [OpenRouter API key](https://openrouter.ai/settings/keys) or use an `op://` reference for 1Password
- Click **Test** on each model slot to verify compatibility before saving

### Anthropic Direct

- The built-in **Anthropic** provider is always available
- Optionally set your API key in the provider editor
- Model selection is not shown — Claude Code uses its built-in defaults (Sonnet for primary, Haiku for small/fast tasks, Opus for complex tasks)

## Features

| Feature | Detail |
|---|---|
| Composable presets | Mix and match providers, MCP servers, and directories |
| Scope management | Global and per-workspace configurations with inheritance |
| Provider types | Anthropic Direct, AWS Bedrock, Local / Other (any Anthropic-compatible proxy) |
| MCP server groups | Reusable named collections of MCP servers (stdio, HTTP, SSE) |
| Directory groups | Additional directories Claude Code may access |
| Live model discovery | Fetch available models queries `/v1/models`; auto-selects single-model endpoints |
| Model compatibility testing | Per-slot **Test** pill verifies the model speaks Anthropic's `/v1/messages` API; results persisted per provider |
| 1Password support | Enter `op://Vault/Item/field` as the credential — the extension writes `apiKeyHelper` for Claude Code to resolve at startup |
| Filterable dropdowns | Type-to-filter combobox for AWS profiles (100+) and model lists (500+ OpenRouter) — slot-matching models grouped first, alphabetical sort, keyboard nav, match highlighting |
| Quick-switch status bar | Click the status bar item to switch presets for global or workspace scope without opening the panel |
| Import / Export | Share presets between machines or team members — credentials are scrubbed on export, recipients fill in their own |
| Draft auto-save | Unsaved changes persist across panel close and are restored on re-open |
| Dirty indicator | Title bar shows `●` when unsaved changes exist |
| Drawer-based editing | Slide-out panels for editing all building blocks |
| Inherit mode | Workspace scope can inherit from global — cleans up workspace files |
| Login prompt suppression | Automatic for Bedrock (always on) and Proxy (on by default, overridable). Sets both env vars in `~/.claude/settings.json` and the `claudeCode.disableLoginPrompt` VS Code setting at the right scope (global or workspace). |

## Requirements

- VS Code 1.98 or later
- For Bedrock: AWS CLI configured with a named profile (`aws configure --profile <name>`)
- For Local / Other: a running Anthropic-compatible server (`/v1/messages` endpoint)
- For 1Password credentials: [1Password CLI](https://developer.1password.com/docs/cli/) (`op`) installed and signed in

## Extension Settings

This extension does not add VS Code settings. All configuration is managed through `~/.claude/coder-profiles.json` and resolved into Claude Code's own files on save.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
