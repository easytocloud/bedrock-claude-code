# Improvement Backlog — bedrock-claude-code

Last reviewed: 2026-08-04

> Paths below predate the monorepo restructure in places: engine code that was
> `src/*.ts` now lives in `core/src/`, and VS Code-only code in `extension/src/`.

---

## Open

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
