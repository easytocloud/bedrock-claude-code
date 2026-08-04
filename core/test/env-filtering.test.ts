import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { preserveUnmanagedEnv, filterForGlobal, filterForProject } from '../dist/resolver.js';

/**
 * `preserveUnmanagedEnv` decides what survives a preset apply. Everything in
 * MANAGED_ENV_KEYS is ours to overwrite; everything else belongs to the user
 * and must come through untouched. Getting this wrong silently deletes env
 * vars the user set by hand in settings.json.
 */
describe('preserveUnmanagedEnv', () => {
  test('keeps user-defined vars', () => {
    const preserved = preserveUnmanagedEnv({
      MY_PROXY: 'http://corp:8080',
      EDITOR: 'vim',
    });

    assert.deepEqual(preserved, { MY_PROXY: 'http://corp:8080', EDITOR: 'vim' });
  });

  test('strips every key the extension manages', () => {
    const preserved = preserveUnmanagedEnv({
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_PROFILE: 'prod',
      ANTHROPIC_BASE_URL: 'https://example',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      KEEP_ME: 'yes',
    });

    assert.deepEqual(preserved, { KEEP_ME: 'yes' });
  });

  test('strips deprecated managed keys so stale values do not linger', () => {
    // These are in MANAGED_ENV_KEYS specifically so a previously-written value
    // gets cleared on the next apply.
    const preserved = preserveUnmanagedEnv({
      ANTHROPIC_MODEL: 'old-name',
      ANTHROPIC_SMALL_FAST_MODEL: 'deprecated',
      DISABLE_AUTOUPDATER: '1',
      USER_VAR: 'kept',
    });

    assert.deepEqual(preserved, { USER_VAR: 'kept' });
  });

  test('preserves a user value that merely looks managed', () => {
    // Prefix similarity must not be enough to strip it.
    const preserved = preserveUnmanagedEnv({ AWS_PROFILE_OVERRIDE: 'mine' });

    assert.deepEqual(preserved, { AWS_PROFILE_OVERRIDE: 'mine' });
  });

  test('empty input yields empty output', () => {
    assert.deepEqual(preserveUnmanagedEnv({}), {});
  });
});

/**
 * Global settings have no parent to override, so a no-op value is pure noise.
 * These rules have been corrected twice (v0.3.8, v0.3.19) — the empty-string
 * case in particular is load-bearing: Claude Code treats any non-empty value
 * of CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, including "0", as ON.
 */
describe('filterForGlobal', () => {
  test('drops empty strings', () => {
    assert.deepEqual(filterForGlobal({ ANTHROPIC_BASE_URL: '', REAL: 'v' }), { REAL: 'v' });
  });

  test('drops the off-by-default bedrock and mantle flags', () => {
    assert.deepEqual(
      filterForGlobal({ CLAUDE_CODE_USE_BEDROCK: '0', CLAUDE_CODE_USE_MANTLE: '0' }),
      {}
    );
  });

  test('keeps those flags when actually enabled', () => {
    assert.deepEqual(
      filterForGlobal({ CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_MANTLE: '1' }),
      { CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_MANTLE: '1' }
    );
  });

  test('keeps "0" for keys where it is a meaningful value', () => {
    // Only USE_BEDROCK and USE_MANTLE treat "0" as a no-op.
    assert.deepEqual(
      filterForGlobal({ CLAUDE_CODE_ATTRIBUTION_HEADER: '0' }),
      { CLAUDE_CODE_ATTRIBUTION_HEADER: '0' }
    );
  });
});

/**
 * At workspace level a no-op IS worth writing when the global env has that key
 * set to something meaningful — otherwise the workspace silently inherits the
 * global value instead of overriding it. This is what makes "a workspace preset
 * with Bedrock off, under a global Bedrock preset" behave correctly.
 */
describe('filterForProject', () => {
  test('writes a no-op when it must override a meaningful global value', () => {
    assert.deepEqual(
      filterForProject({ CLAUDE_CODE_USE_BEDROCK: '0' }, { CLAUDE_CODE_USE_BEDROCK: '1' }),
      { CLAUDE_CODE_USE_BEDROCK: '0' },
      'without this the workspace inherits global bedrock=1'
    );
  });

  test('drops a no-op when global does not set the key', () => {
    assert.deepEqual(filterForProject({ CLAUDE_CODE_USE_BEDROCK: '0' }, {}), {});
  });

  test('drops a no-op when global is itself a no-op', () => {
    assert.deepEqual(
      filterForProject({ CLAUDE_CODE_USE_BEDROCK: '0' }, { CLAUDE_CODE_USE_BEDROCK: '0' }),
      {}
    );
  });

  test('writes an empty string to clear a meaningful global URL', () => {
    assert.deepEqual(
      filterForProject({ ANTHROPIC_BASE_URL: '' }, { ANTHROPIC_BASE_URL: 'https://proxy' }),
      { ANTHROPIC_BASE_URL: '' },
      'a workspace on Anthropic direct must clear a global proxy URL'
    );
  });

  test('always keeps meaningful values regardless of global', () => {
    assert.deepEqual(
      filterForProject({ AWS_PROFILE: 'dev' }, { AWS_PROFILE: 'prod' }),
      { AWS_PROFILE: 'dev' }
    );
  });
});
