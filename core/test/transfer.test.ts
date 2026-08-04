import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  scrubStore,
  mergeIncomingStore,
  parseIncomingStore,
  findBrokenReferences,
  PLACEHOLDER,
} from '../dist/transfer.js';
import type { ProfileStore } from '../dist/types.js';

const store = (over: Partial<ProfileStore> = {}): ProfileStore => ({
  version: 1,
  providers: [],
  mcpGroups: [],
  directoryGroups: [],
  presets: [],
  globalScope: { mode: 'inherit' },
  workspaceScopes: {},
  ...over,
});

/**
 * Export must never carry a real credential off the machine, and import must
 * never destroy a working one. Both directions have bitten before: the
 * proxyCredential field was once missed by the scrubber entirely.
 */
describe('scrubStore', () => {
  test('replaces every credential field with the placeholder', () => {
    const scrubbed = scrubStore(store({
      providers: [{
        id: 'p', name: 'X', type: 'proxy',
        anthropicApiKey: 'sk-ant-real-key-value-1234567890',
        proxyCredential: 'sk-or-real-key-value-1234567890',
      } as ProfileStore['providers'][0]],
    }));

    const p = scrubbed.providers[0];
    assert.equal(p.anthropicApiKey, PLACEHOLDER);
    assert.equal(p.proxyCredential, PLACEHOLDER, 'proxyCredential was historically missed');
  });

  test('drops machine-local mcpOwnership, which is meaningless elsewhere', () => {
    const scrubbed = scrubStore(store({
      mcpOwnership: { global: ['a'], workspaces: { '/tmp/x': ['b'] } },
    }));

    assert.equal(scrubbed.mcpOwnership, undefined);
  });

  test('keeps op:// references, which are not secrets themselves', () => {
    const scrubbed = scrubStore(store({
      providers: [{
        id: 'p', name: 'X', type: 'proxy',
        proxyCredential: 'op://vault/item/credential',
      } as ProfileStore['providers'][0]],
    }));

    assert.equal(scrubbed.providers[0].proxyCredential, 'op://vault/item/credential');
  });
});

describe('mergeIncomingStore', () => {
  const withCred = (cred: string) => store({
    providers: [{ id: 'p1', name: 'P', type: 'proxy', proxyCredential: cred } as ProfileStore['providers'][0]],
  });

  test('a scrubbed import does not clobber a working local credential', () => {
    const merged = mergeIncomingStore(withCred('real-working-key'), withCred(PLACEHOLDER));

    assert.equal(
      merged.providers[0].proxyCredential,
      'real-working-key',
      'importing a shared export must not break the local setup'
    );
  });

  test('a real incoming credential does overwrite', () => {
    const merged = mergeIncomingStore(withCred('old'), withCred('new-real-key'));

    assert.equal(merged.providers[0].proxyCredential, 'new-real-key');
  });

  test('upserts by id — re-importing the same export is idempotent', () => {
    const base = store({ presets: [{ id: 'x', name: 'One', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] }] });
    const incoming = store({ presets: [{ id: 'x', name: 'One Renamed', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] }] });

    const merged = mergeIncomingStore(base, incoming);

    assert.equal(merged.presets.length, 1, 'same id must update, not duplicate');
    assert.equal(merged.presets[0].name, 'One Renamed');
  });

  test('merge never deletes local items absent from the import', () => {
    const base = store({ presets: [{ id: 'keep', name: 'Local', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] }] });
    const merged = mergeIncomingStore(base, store());

    assert.equal(merged.presets.length, 1);
  });

  test('reports added and updated counts', () => {
    const base = store({ presets: [{ id: 'a', name: 'A', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] }] });
    const incoming = store({ presets: [
      { id: 'a', name: 'A2', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] },
      { id: 'b', name: 'B', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] },
    ] });
    const result = { added: 0, updated: 0 };

    mergeIncomingStore(base, incoming, result);

    assert.deepEqual(result, { added: 1, updated: 1 });
  });
});

describe('parseIncomingStore', () => {
  test('rejects a file that is not a profile store', () => {
    assert.throws(() => parseIncomingStore('{"nope":true}'), /Not a valid profile store/);
  });

  test('defaults group arrays omitted by older exports', () => {
    // Previously these threw a raw TypeError further down in mergeIncomingStore.
    const parsed = parseIncomingStore(JSON.stringify({
      version: 1,
      providers: [],
      presets: [{ id: 'p', name: 'P', providerId: 'x' }],
    }));

    assert.deepEqual(parsed.mcpGroups, []);
    assert.deepEqual(parsed.directoryGroups, []);
    assert.deepEqual(parsed.presets[0].mcpGroupIds, []);
    assert.deepEqual(parsed.presets[0].directoryGroupIds, []);
  });
});

/**
 * A preset pointing at a deleted provider does not throw — `resolvePreset`
 * skips it and produces a config with no backend, so Claude Code quietly runs
 * against the wrong thing. Detection is the only signal the user gets.
 */
describe('findBrokenReferences', () => {
  test('finds a preset whose provider is missing', () => {
    const broken = findBrokenReferences(store({
      presets: [{ id: 'p', name: 'Orphan', providerId: 'gone', mcpGroupIds: [], directoryGroupIds: [] }],
    }));

    assert.equal(broken.length, 1);
    assert.equal(broken[0].kind, 'provider');
    assert.equal(broken[0].missingId, 'gone');
  });

  test('finds missing MCP and directory groups', () => {
    const broken = findBrokenReferences(store({
      providers: [{ id: 'prov', name: 'P', type: 'anthropic' } as ProfileStore['providers'][0]],
      presets: [{ id: 'p', name: 'X', providerId: 'prov', mcpGroupIds: ['m'], directoryGroupIds: ['d'] }],
    }));

    assert.deepEqual(broken.map(b => b.kind).sort(), ['directoryGroup', 'mcpGroup']);
  });

  test('a fully resolvable store reports nothing', () => {
    const broken = findBrokenReferences(store({
      providers: [{ id: 'prov', name: 'P', type: 'anthropic' } as ProfileStore['providers'][0]],
      mcpGroups: [{ id: 'm', name: 'M', servers: [] }],
      directoryGroups: [{ id: 'd', name: 'D', directories: [] }],
      presets: [{ id: 'p', name: 'X', providerId: 'prov', mcpGroupIds: ['m'], directoryGroupIds: ['d'] }],
    }));

    assert.deepEqual(broken, []);
  });

  test('tolerates a store missing arrays entirely', () => {
    // `validate` reads from disk, where the shape is not guaranteed.
    const broken = findBrokenReferences({ version: 1, presets: [] } as unknown as ProfileStore);

    assert.deepEqual(broken, []);
  });
});
