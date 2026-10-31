import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreset } from '../src/resolver';
import { dropStaleLegacyCredentials } from '../src/profiles';
import type { ProfileStore, ProviderProfile } from '../src/types';

function storeWith(provider: Partial<ProviderProfile>): ProfileStore {
  return {
    providers: [{
      id: 'p', name: 'LM Link', type: 'proxy', proxyPreset: 'lmstudio',
      proxyBaseUrl: 'http://localhost:1234', primaryModel: '', smallFastModel: '', opusModel: '',
      ...provider,
    } as ProviderProfile],
    mcpGroups: [], directoryGroups: [],
    presets: [{ id: 'x', name: 'x', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] }],
  } as unknown as ProfileStore;
}

describe('"No authentication" ignores stale legacy credentials', () => {
  test('legacy op:// proxyAuthToken is not turned into an apiKeyHelper', () => {
    const r = resolvePreset(storeWith({
      proxyAuthMode: 'none',
      proxyAuthToken: 'op://Generic/openrouter/credential',
    }), 'x');
    assert.equal(r?.apiKeyHelper, undefined);
    assert.equal(r?.env['ANTHROPIC_AUTH_TOKEN'], 'none');
    assert.equal(r?.env['ANTHROPIC_API_KEY'], undefined);
  });

  test('legacy plain proxyApiKey is not sent either', () => {
    const r = resolvePreset(storeWith({ proxyAuthMode: 'none', proxyApiKey: 'sk-or-stale' }), 'x');
    assert.equal(r?.env['ANTHROPIC_API_KEY'], undefined);
    assert.equal(r?.env['ANTHROPIC_AUTH_TOKEN'], 'none');
  });

  test('legacy-only records (no mode) still work', () => {
    const r = resolvePreset(storeWith({ proxyPreset: 'custom', proxyAuthToken: 'tok' }), 'x');
    assert.equal(r?.env['ANTHROPIC_AUTH_TOKEN'], 'tok');
  });

  test('a real credential with an explicit mode is unaffected', () => {
    const r = resolvePreset(storeWith({ proxyAuthMode: 'authtoken', proxyCredential: 'secret' }), 'x');
    assert.equal(r?.env['ANTHROPIC_AUTH_TOKEN'], 'secret');
  });
});

describe('dropStaleLegacyCredentials', () => {
  test('drops legacy fields when mode is none', () => {
    const s = storeWith({ proxyAuthMode: 'none', proxyAuthToken: 'op://x/y/z', proxyApiKey: 'k' });
    dropStaleLegacyCredentials(s);
    assert.equal(s.providers[0].proxyAuthToken, undefined);
    assert.equal(s.providers[0].proxyApiKey, undefined);
  });

  test('drops legacy fields superseded by proxyCredential', () => {
    const s = storeWith({ proxyAuthMode: 'authtoken', proxyCredential: 'new', proxyAuthToken: 'old' });
    dropStaleLegacyCredentials(s);
    assert.equal(s.providers[0].proxyAuthToken, undefined);
    assert.equal(s.providers[0].proxyCredential, 'new');
  });

  test('keeps legacy-only credentials (not yet migrated)', () => {
    const s = storeWith({ proxyAuthToken: 'tok' });
    dropStaleLegacyCredentials(s);
    assert.equal(s.providers[0].proxyAuthToken, 'tok');
  });
});
