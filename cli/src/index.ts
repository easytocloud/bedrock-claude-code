import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';
import {
  readProfileStore,
  writeProfileStore,
  ensureDefaults,
  applyAllScopes,
  ensureOnboardingComplete,
  findPresetByNameOrId,
  scrubStore,
  PLACEHOLDER,
  parseIncomingStore,
  mergeIncomingStore,
  providersNeedingCredentials,
  ProfileStore,
  ScopeAssignment,
  Preset,
} from '@easytocloud/claude-personae-core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const VERSION: string = require('../package.json').version;

const HELP = `claude-personae (ccp) — switch Claude Code provider presets from the shell

Operates on the same profile store as the "Claude Code Personae" VS Code
extension (~/.claude/coder-profiles.json). Use the extension to author
providers/presets; use this CLI to switch and apply them.

USAGE
  ccp <command> [options]

COMMANDS
  list [presets|providers|scopes]   List configured items (default: all)
  current                           Show the active global + workspace preset
  switch <preset> [scope]           Set the active preset and apply it
  apply                             Re-apply the stored scopes to disk
  export                            Print the store as JSON (credentials scrubbed)
  import <file|->                   Import a store from a file or stdin

SCOPE (for \`switch\`)
  --global, -g            Set the global preset (default)
  --workspace, -w         Set the preset for a workspace (uses CWD)
  --path <dir>            Workspace directory to target (implies --workspace)
  --inherit               Workspace inherits the global preset (clears overrides)
  --manual                Workspace is managed manually (CLI leaves files alone)

OPTIONS
  --json                  Machine-readable JSON output (list, current)
  --out, -o <file>        Write export to a file instead of stdout
  --no-scrub              Export without scrubbing credentials (dangerous)
  --mode <merge|replace>  Import mode (default: merge)
  --help, -h              Show this help
  --version, -v           Show version

EXAMPLES
  ccp list presets
  ccp switch bedrock-prod            # set global preset
  ccp switch dev --workspace         # set preset for the current project
  ccp switch --workspace --inherit   # project inherits global again
  ccp apply                          # reprovision config files from the store
  ccp export -o presets.json
  cat presets.json | ccp import - --mode replace
`;

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function providerName(store: ProfileStore, providerId: string): string {
  return store.providers.find(p => p.id === providerId)?.name ?? '(unknown provider)';
}

function describeScope(store: ProfileStore, scope: ScopeAssignment | undefined): string {
  if (!scope) { return 'not set'; }
  if (scope.mode === 'manual') { return 'manual (CLI/GUI leave files alone)'; }
  if (scope.mode === 'inherit') { return 'inherit from global'; }
  const preset = scope.presetId ? store.presets.find(p => p.id === scope.presetId) : undefined;
  return preset ? `${preset.name} → ${providerName(store, preset.providerId)}` : '(preset missing)';
}

function resolvePresetArg(store: ProfileStore, query: string | undefined): Preset {
  if (!query) { fail('a preset name or id is required'); }
  const preset = findPresetByNameOrId(store, query);
  if (!preset) {
    const names = store.presets.map(p => p.name).join(', ');
    fail(`no preset matching "${query}". Available: ${names || '(none)'}`);
  }
  return preset;
}

// ---------------------------------------------------------------------------

type Values = ReturnType<typeof parse>['values'];

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      global: { type: 'boolean', short: 'g', default: false },
      workspace: { type: 'boolean', short: 'w', default: false },
      path: { type: 'string' },
      inherit: { type: 'boolean', default: false },
      manual: { type: 'boolean', default: false },
      mode: { type: 'string' },
      out: { type: 'string', short: 'o' },
      'no-scrub': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
}

function workspaceDir(values: Values): string {
  return values.path ? path.resolve(String(values.path)) : process.cwd();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList(store: ProfileStore, what: string | undefined, values: Values): void {
  const which = what ?? 'all';
  if (values.json) {
    const out: Record<string, unknown> = {};
    if (which === 'all' || which === 'presets') { out.presets = store.presets; }
    if (which === 'all' || which === 'providers') { out.providers = store.providers.map(p => ({ id: p.id, name: p.name, type: p.type })); }
    if (which === 'all' || which === 'scopes') { out.globalScope = store.globalScope; out.workspaceScopes = store.workspaceScopes; }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  if (which === 'all' || which === 'providers') {
    process.stdout.write('Providers:\n');
    for (const p of store.providers) {
      process.stdout.write(`  ${p.name}  [${p.type}]\n`);
    }
    process.stdout.write('\n');
  }
  if (which === 'all' || which === 'presets') {
    process.stdout.write('Presets:\n');
    for (const p of store.presets) {
      const bits = [`provider ${providerName(store, p.providerId)}`];
      if (p.mcpGroupIds.length) { bits.push(`${p.mcpGroupIds.length} MCP group(s)`); }
      if (p.directoryGroupIds.length) { bits.push(`${p.directoryGroupIds.length} dir group(s)`); }
      process.stdout.write(`  ${p.name}  —  ${bits.join(' · ')}\n`);
    }
    process.stdout.write('\n');
  }
  if (which === 'all' || which === 'scopes') {
    process.stdout.write('Scopes:\n');
    process.stdout.write(`  global: ${describeScope(store, store.globalScope)}\n`);
    for (const [ws, scope] of Object.entries(store.workspaceScopes)) {
      process.stdout.write(`  ${ws}: ${describeScope(store, scope)}\n`);
    }
  }
}

function cmdCurrent(store: ProfileStore, values: Values): void {
  const ws = workspaceDir(values);
  const wsScope = store.workspaceScopes[ws];
  if (values.json) {
    process.stdout.write(JSON.stringify({
      global: store.globalScope,
      workspace: { path: ws, scope: wsScope ?? null },
    }, null, 2) + '\n');
    return;
  }
  process.stdout.write(`global:    ${describeScope(store, store.globalScope)}\n`);
  process.stdout.write(`workspace: ${describeScope(store, wsScope)}  (${ws})\n`);
}

function cmdSwitch(store: ProfileStore, presetArg: string | undefined, values: Values): void {
  const toWorkspace = values.workspace || values.path !== undefined || values.inherit || values.manual;

  if (toWorkspace && !values.global) {
    const ws = workspaceDir(values);
    let scope: ScopeAssignment;
    let summary: string;
    if (values.inherit) {
      scope = { mode: 'inherit' };
      summary = 'inherit from global';
    } else if (values.manual) {
      scope = { mode: 'manual' };
      summary = 'manual';
    } else {
      const preset = resolvePresetArg(store, presetArg);
      scope = { mode: 'preset', presetId: preset.id };
      summary = `${preset.name} → ${providerName(store, preset.providerId)}`;
    }
    store.workspaceScopes[ws] = scope;
    writeProfileStore(store);
    ensureOnboardingComplete();
    applyAllScopes(store, ws);
    process.stdout.write(`workspace (${ws}): ${summary}\n`);
    return;
  }

  // Global (default)
  const preset = resolvePresetArg(store, presetArg);
  store.globalScope = { mode: 'preset', presetId: preset.id };
  writeProfileStore(store);
  ensureOnboardingComplete();
  applyAllScopes(store, undefined);
  process.stdout.write(`global: ${preset.name} → ${providerName(store, preset.providerId)}\n`);
}

function cmdApply(store: ProfileStore, values: Values): void {
  const ws = workspaceDir(values);
  ensureOnboardingComplete();
  applyAllScopes(store, ws);
  process.stdout.write(`applied — global: ${describeScope(store, store.globalScope)}\n`);
  process.stdout.write(`          workspace (${ws}): ${describeScope(store, store.workspaceScopes[ws])}\n`);
}

function cmdExport(store: ProfileStore, values: Values): void {
  const out = values['no-scrub'] ? store : scrubStore(store);
  const content = JSON.stringify(out, null, 2) + '\n';
  if (values.out) {
    fs.writeFileSync(String(values.out), content, 'utf8');
    process.stderr.write(`exported to ${values.out}\n`);
  } else {
    process.stdout.write(content);
  }
  if (!values['no-scrub'] && content.includes(PLACEHOLDER)) {
    process.stderr.write(`note: credentials were replaced with ${PLACEHOLDER} — recipients must fill in their own.\n`);
  }
}

function cmdImport(src: string | undefined, values: Values): void {
  if (!src) { fail('import requires a file path or "-" for stdin'); }
  let raw: string;
  try {
    raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  } catch (err) {
    fail(`cannot read ${src}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let incoming: ProfileStore;
  try {
    incoming = parseIncomingStore(raw);
  } catch (err) {
    fail(`import failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const mode = String(values.mode ?? 'merge');
  if (mode !== 'merge' && mode !== 'replace') { fail(`--mode must be "merge" or "replace"`); }

  if (mode === 'replace') {
    const store = ensureDefaults(incoming);
    writeProfileStore(store);
    process.stdout.write('presets replaced from import.\n');
    return;
  }

  const store = mergeIncomingStore(readProfileStore(), incoming);
  writeProfileStore(store);
  process.stdout.write(
    `imported ${incoming.presets.length} preset(s), ${incoming.providers.length} provider(s), ` +
    `${incoming.mcpGroups.length} MCP group(s), ${incoming.directoryGroups.length} directory group(s).\n`
  );
  const placeholders = providersNeedingCredentials(store);
  if (placeholders.length > 0) {
    process.stderr.write(`note: these providers have placeholder credentials to replace: ${placeholders.join(', ')}\n`);
  }
}

// ---------------------------------------------------------------------------

function main(): void {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(process.argv.slice(2));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  const { values, positionals } = parsed;

  if (values.version) { process.stdout.write(`${VERSION}\n`); return; }

  const command = positionals[0];
  if (!command || values.help) { process.stdout.write(HELP); return; }

  const store = readProfileStore();

  switch (command) {
    case 'list':     cmdList(store, positionals[1], values); break;
    case 'current':  cmdCurrent(store, values); break;
    case 'switch':   cmdSwitch(store, positionals[1], values); break;
    case 'apply':    cmdApply(store, values); break;
    case 'export':   cmdExport(store, values); break;
    case 'import':   cmdImport(positionals[1], values); break;
    case 'help':     process.stdout.write(HELP); break;
    default:         fail(`unknown command "${command}". Run \`ccp --help\`.`);
  }
}

main();
