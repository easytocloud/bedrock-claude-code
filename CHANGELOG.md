# Changelog

All notable changes to this extension will be documented here.

## [0.2.1] — 2026-03-05

### Changed
- Renamed "Project Scope" to "Workspace Scope" — better reflects VS Code workspace semantics
- MCP server command field now auto-splits if arguments are included (e.g. `npx -y @pkg` → command=`npx`, args=[`-y`, `@pkg`])
- Updated command/args placeholders in MCP server drawer for clarity

### Fixed
- Drawer save buttons now show validation errors (red toast) instead of failing silently when required fields are missing
- Validation covers: names, provider type-specific fields (AWS profile, proxy URL), MCP server URLs/commands
- Adding servers/directories to not-yet-saved groups no longer silently loses items
- Migration from v0.2.0 `projectScopes` key to `workspaceScopes` preserves existing scope assignments

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
