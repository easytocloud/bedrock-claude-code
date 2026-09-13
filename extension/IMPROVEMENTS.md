# Improvement Backlog — bedrock-claude-code

Last reviewed: 2026-08-04

> Paths below predate the monorepo restructure in places: engine code that was
> `src/*.ts` now lives in `core/src/`, and VS Code-only code in `extension/src/`.

---

## Open

### AUTH-1: Credential env vars not unconditionally cleared per scope
**Files**: `core/src/resolver.ts:141-153` (proxy credential block), same gap likely
applies to the `bedrock`/`anthropic` branches (`core/src/resolver.ts:69-93`) —
unverified, needs checking.

**Problem**: Claude Code merges `env` blocks **per-key** across scopes (managed >
project-local > project > user), confirmed via
[docs.claude.com/settings](https://code.claude.com/docs/en/settings) — "a managed
settings entry overrides the same variable in user or project settings." A key
*absent* from a project's `env` block is silently inherited from the user
(global) `env` block; it is not treated as "unset."

`resolvePreset()`'s credential block writes **at most one** of
`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `apiKeyHelper` into
`resolved.env` / `resolved.apiKeyHelper` per call — the other two are left
**absent**, not explicitly `''`. `filterForProject()` (resolver.ts:277-284)
already exists to decide whether an empty-string override is needed to shadow
a meaningful parent value — but it can only act on keys that are actually
present in `resolved.env`. Since the losing credential keys are never even
included, `filterForProject` never sees them, and a stale key from a
different-provider parent scope survives into the merged environment.

**Concrete repro**: global preset uses `provider.type === 'anthropic'` with an
`ANTHROPIC_API_KEY` (apikey mode). A workspace preset points at a different
provider (e.g. a proxy in `authtoken` mode) and writes only
`ANTHROPIC_AUTH_TOKEN` at the project scope. The project's `.claude/settings.json`
never mentions `ANTHROPIC_API_KEY`, so it inherits the global value. Claude Code
now sees both vars set and (per
[docs.claude.com/authentication#authentication-precedence](https://code.claude.com/docs/en/authentication#authentication-precedence))
warns at startup: *"⚠ Both ANTHROPIC_AUTH_TOKEN and ANTHROPIC_API_KEY set · auth
may not work as expected."* Reproduced live in this project on 2026-09-12.
Confirmed **not fatal** — Claude Code's documented precedence
(`ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_API_KEY` > `apiKeyHelper`) means the higher
one silently wins — but it is a confusing, avoidable warning and a fragile state
(e.g. if the workspace later unsets its own token, the stale global key takes
over invisibly).

**Why not "depend on current global state"**: an earlier design sketch proposed
having the credential block ask `filterForProject`-style "does global currently
hold a conflicting value?" before deciding whether to write an explicit `''`
override. Rejected: that makes a project's `.claude/settings.json` correctness
depend on a snapshot of global state *at the moment the preset was applied*.
If global later changes — through this tool, by hand, or via dotfile sync from
another machine — every previously-applied project file becomes stale (missing
an override it now needs, or carrying a needless one) with nothing to
re-trigger a refresh.

**Fix**: make the credential block unconditional and scope-agnostic, mirroring
how the model-override triplet already behaves (resolver.ts:158-168, always
writes all three keys regardless of provider). Whichever of
`{apiKeyHelper, ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN}` a preset's resolved
mode selects, explicitly set the other two to `''` / delete them in
`resolved.env` / `resolved.apiKeyHelper` — every single resolve, not
conditionally. This makes each scope's file self-consistent on its own terms,
independent of what any parent scope currently contains, and requires no
rewrite of other scopes' files when one scope's provider changes.

**Also verify**: whether `bedrock`/`anthropic` provider branches
(resolver.ts:69-93) have the same sparse-write gap, or whether it's confined to
the `proxy` branch's three-way credential choice.

**Effort**: Small — contained to the credential-resolution block in
`resolvePreset()`.

### ARCH-2: Discriminated ScopeAssignment type
**File**: `src/types.ts:90-93`
`presetId` is optional on all modes but assumed present when `mode === 'preset'`. Runtime hazard invisible to the compiler.

**Fix**:
```typescript
export type ScopeAssignment =
  | { mode: 'preset'; presetId: string }
  | { mode: 'manual' }
  | { mode: 'inherit' };
```
**Effort**: Small — type change + update call sites.

### IMPORT-3 (partial): Contextual scrub placeholders
**File**: `core/src/transfer.ts`
All scrubbed values use a generic `<REPLACE_ME>` — contextual placeholders
(`<REPLACE_ME: anthropicApiKey>`) would tell recipients which credential goes where.

**Fix**: Make `scrubValue()` placeholder context-aware.
**Effort**: Small.

> The credential-leak half of IMPORT-3 (`proxyCredential` not scrubbed) is **fixed** —
> see `scrubProvider()` in `core/src/transfer.ts`.

### UX-2: Empty state in scope cards
**File**: `src/webview/layout.ts:49-56`
When no presets exist, the scope card preset dropdown is empty with no guidance.

**Fix**: Show inline "No presets yet — create one below" when preset list is empty.
**Effort**: Small.

---

## Completed

| ID | Description | Version |
|----|-------------|---------|
| SEC-1 | Draft credentials — verified not a real issue | v0.3.0 |
| AWS-1 | AWS region validated against allowed list | v0.3.3 |
| AWS-2 | AWS CLI errors surfaced with detail | v0.3.3 |
| AWS-3 | Bedrock model cache (1-hour TTL) | v0.3.3 |
| UX-4 | Editing state consolidated into objects | v0.3.3 |
| UX-5 | Inline styles replaced with CSS classes | v0.3.3 |
| STATUS-1 | Status bar distinguishes inherited vs unconfigured | v0.3.3 |
| STATUS-2 | Quick-switch shows workspace name + provider type | v0.3.3 |
| ARCH-5 | Env-var filtering deduplicated | v0.3.3 |
| ARCH-6 | Chip rendering unified | v0.3.3 |
| DX-2 | esbuild bundler | v0.3.3 |
| DX-3 | ESLint rules tightened | v0.3.3 |
| DX-4 | tsconfig strictness flags | v0.3.3 |
| DX-5 | ARCHITECTURE.md created | v0.3.3 |
| DX-6 | CHANGELOG Unreleased section | v0.3.3 |
| UX-8 | Confirmation dialogs (via VS Code modal) | v0.3.14 |
| UX-9 | Fetch button loading spinners | v0.3.14 |
| UX-10 | Combobox Tab key handling | v0.3.14 |
| IMPORT-3 (leak) | `proxyCredential` scrubbed on export | — |
| IMPORT-1 | Import validates referential integrity; `ccp validate` added | Unreleased |
| UX-* | Full UX/UI design system pass (labels, ARIA, spacing, cards, colors, toggles, empty states, error styles) | v0.3.3–v0.3.14 |

## Dropped

| ID | Reason |
|----|--------|
| ARCH-1 | panel.ts (737 lines) works fine; decompose if it grows |
| ARCH-3 | JSON validation unnecessary — extension is the only writer; corrupt files handled |
| ARCH-4 | Strategy pattern overkill for 3 provider types |
| TEST-1 | Large effort, revisit when needed |
| IMPORT-2 | Draft/store conflict too niche (requires manual JSON editing) |
| UX-1 (remaining) | Advanced ARIA roles (radiogroup, switch, combobox role, drawer focus trap) — low user impact for a desktop VS Code extension |
| UX-3 | Stale nested drawer dropdown — partially working, edge case |
| DX-1 | Keyboard shortcut for quick-switch — skipped by choice |
