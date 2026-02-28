# Changelog

All notable changes to this extension will be documented here.

## [0.1.0] — 2026-02-28

### Added
- Initial release
- AWS Bedrock configuration: IAM profile, region, cross-region inference models
- Local / Compatible API provider: Ollama, vLLM, LM Studio, LiteLLM support
- Live model discovery via `/v1/models` endpoint
- MCP server management at user scope (`~/.claude.json`) and project scope (`.mcp.json`)
- Model tier selection: Sonnet, Haiku, Opus
- Allowed directory management
- Disable login prompt toggle
- Dirty indicator (● in panel title when unsaved changes exist)
