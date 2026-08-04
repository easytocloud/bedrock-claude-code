import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOwned } from '../src/claudeJson';
import type { McpServerConfig } from '../src/types';

const srv = (command: string): McpServerConfig => ({ type: 'stdio', command });

/**
 * `mergeOwned` is the guard against destroying a user's MCP configuration.
 * Applying a preset must remove exactly the servers we wrote last time and
 * leave everything else — servers added by hand via `claude mcp add`, or by a
 * teammate — untouched. A regression here silently deletes config the
 * extension never created, which the user has no way to recover.
 */
describe('mergeOwned', () => {
  test('leaves hand-added servers alone while replacing our own', () => {
    const existing = { mine: srv('ours-v1'), theirs: srv('hand-added') };
    const merged = mergeOwned(existing, { mine: srv('ours-v2') }, ['mine']);

    assert.deepEqual(merged, { mine: srv('ours-v2'), theirs: srv('hand-added') });
  });

  test('never removes a server it does not own', () => {
    const existing = { theirs: srv('hand-added') };
    // Switching to a preset with no MCP servers at all.
    const merged = mergeOwned(existing, {}, []);

    assert.deepEqual(merged, { theirs: srv('hand-added') });
  });

  test('drops servers we owned but the new preset no longer includes', () => {
    const existing = { gone: srv('old'), kept: srv('hand-added') };
    const merged = mergeOwned(existing, {}, ['gone']);

    assert.deepEqual(merged, { kept: srv('hand-added') });
  });

  test('returns undefined when nothing remains, so the key is deleted not left empty', () => {
    // The caller uses undefined to `delete updated.mcpServers` — writing `{}`
    // instead would leave a stray empty object in the user's ~/.claude.json.
    assert.equal(mergeOwned({ mine: srv('ours') }, {}, ['mine']), undefined);
    assert.equal(mergeOwned(undefined, {}, []), undefined);
  });

  test('a name in both previouslyOwned and the new preset survives with new config', () => {
    // Delete-then-assign ordering matters: if the delete ran after the assign,
    // applying a preset would wipe the very server it was meant to install.
    const merged = mergeOwned({ dup: srv('stale') }, { dup: srv('fresh') }, ['dup']);

    assert.deepEqual(merged, { dup: srv('fresh') });
  });

  test('handles a missing mcpServers key on first apply', () => {
    const merged = mergeOwned(undefined, { fresh: srv('new') }, []);

    assert.deepEqual(merged, { fresh: srv('new') });
  });

  test('does not mutate the caller-supplied existing map', () => {
    const existing = { mine: srv('ours'), theirs: srv('hand-added') };
    mergeOwned(existing, { other: srv('new') }, ['mine']);

    assert.deepEqual(
      existing,
      { mine: srv('ours'), theirs: srv('hand-added') },
      'mergeOwned must copy — the caller still reads `existing` afterwards'
    );
  });
});
