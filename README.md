# Claude Code Personae

**One CLI. Every backend.** Run [Claude Code](https://claude.com/claude-code) against whichever model fits the moment — and switch in a single click.

Claude Code Personae lets you point the same Claude Code CLI at four very different kinds of backends:

- **Anthropic Direct** — Claude.ai Max/Pro login or an `sk-ant-…` API key from console.anthropic.com.
- **AWS Bedrock** — your AWS account, your region, your bill. Profiles, regions, and aws-envs are first-class.
- **Local models** on your own hardware — **Ollama**, **LM Studio**, **oMLX**, **vLLM**. No data leaves the machine.
- **Proxies and gateways** — **OpenRouter**, **LiteLLM**, or any custom Anthropic-compatible endpoint.

Each combination of backend, MCP servers, and allowed directories is a **Preset** you can apply globally or per workspace. Spin up "Bedrock for client work, Ollama for offline experiments, OpenRouter for a model the others don't have" — and switch from the status bar without touching `~/.claude/settings.json` by hand.

This repository is an **npm workspaces monorepo** with three packages:

| Package | What it is | Ships to |
|---|---|---|
| [`extension/`](extension) | The **VS Code extension** — a GUI for authoring and switching presets. | VS Code Marketplace (`easytocloud.bedrock-claude-code`) |
| [`cli/`](cli) | The **`claude-personae` / `ccp` CLI** — switch and apply presets from the shell (headless, SSH, CI). | npm (`@easytocloud/claude-personae`) |
| [`core/`](core) | The shared **engine** — preset resolution, profile store I/O, AWS config detection. Bundled into both consumers; not published. | — |

The extension and the CLI operate on the **same profile store**
(`~/.claude/coder-profiles.json`) and write the same Claude Code config files
(`~/.claude/settings.json`, `~/.claude.json`). Author your providers/presets in the GUI;
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

## CI

Every pull request and every push to `main` runs
[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Step | Why |
|---|---|
| `npm ci` | Fails if `package.json` was edited without regenerating `package-lock.json`. |
| `npm run build` | Builds core → extension → cli; `tsc -b` surfaces type errors. |
| `npm run lint` | |
| `vsce package --no-dependencies` | Packaging has monorepo-specific gotchas; catch them on the PR, not at release time. |

A separate `audit` job reports `npm audit` findings but does **not** fail the
run, so a newly-published advisory in a dev dependency can't block an unrelated PR.

## Releasing

Releases are **tag-triggered**. Merging a PR — including dependency updates —
never publishes anything; publishing is a deliberate act of pushing a tag.

The tag prefix selects what ships, which keeps the versioning policy
("same minor = same engine") enforceable:

| Tag | Publishes |
|---|---|
| `ext-v0.9.2` | Extension only → VS Code Marketplace |
| `cli-v0.9.1` | CLI only → npm |
| `v0.10.0` | Both — use for any release that changes `core/` |

To release:

```bash
# 1. bump the version in the manifest(s) you're releasing, update CHANGELOG.md
# 2. commit and push to main
git tag ext-v0.9.2
git push origin ext-v0.9.2
```

[`.github/workflows/release.yml`](.github/workflows/release.yml) then builds,
lints, and publishes. The `plan` job **fails the run if the tag doesn't match
the version in the manifest it would publish**, so a mistyped tag stops before
reaching a registry.

### Dry runs

Run the **Release** workflow manually from the Actions tab with
**"Build and verify without publishing"** checked. It verifies credentials,
build, lint, and packaging without publishing, and should finish **green** —
the publish job is skipped. Use this after changing release credentials.

### Credentials

The **Marketplace token** lives in **1Password**, not in GitHub. Only the
service account token is a GitHub secret:

| Where | What |
|---|---|
| GitHub org secret `OP_SERVICE_ACCOUNT_TOKEN` | 1Password service account, read access to the `cicd` vault. Must be scoped to include public repositories. |
| `op://cicd/vsce/credential` | Azure DevOps PAT for `vsce publish`. PATs expire — max one year. |

Rotating the PAT needs no workflow change: update the item in 1Password and
the next run picks it up.

**npm uses no token.** The CLI is published with npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC): the
publish job has `id-token: write`, upgrades npm to ≥ 11.5.1, and runs
`npm publish`, which also attaches a provenance attestation. (npm is
deprecating 2FA-bypass tokens, so a stored token would stop working.) This
relies on a Trusted Publisher configured on the
`@easytocloud/claude-personae` package at npmjs.com:

| Field | Value |
|---|---|
| Repository | `easytocloud/bedrock-claude-code` |
| Workflow | `release.yml` |
| Environment | `release` |
| Allowed actions | **`npm publish`** (`stage publish` alone fails with `E403 OIDC permission denied`) |

A new npm version can take a few minutes to appear in the registry after the
workflow reports success.

### Recovering a partial release

A tag can publish one artifact and fail on the other (the extension and CLI
steps run in sequence). Registries refuse republishing a version, so don't
re-tag the same artifact. Fix the cause, then either re-run only the failed
steps (`gh run rerun <id> --failed`) or, if the workflow itself had to change,
push a single-artifact tag (e.g. `cli-v0.15.0`) on a commit that contains the
fix — the old tag still points at the old workflow.

The `release` [environment](https://github.com/easytocloud/bedrock-claude-code/settings/environments)
restricts deployments to `v*`, `ext-v*`, and `cli-v*` tags, so publishing
cannot be triggered from a branch.

## License

MIT — see [LICENSE](LICENSE).
