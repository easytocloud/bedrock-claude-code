import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreset } from '../src/resolver';
import { isGatewayDiscoverableId, MANAGED_ENV_KEYS } from '../src/models';
import type { ProfileStore, ProviderProfile } from '../src/types';

function storeWith(provider: Partial<ProviderProfile>): ProfileStore {
  return {
    providers: [{
      id: 'p', name: 'LM Studio', type: 'proxy', proxyPreset: 'lmstudio',
      proxyBaseUrl: 'http://localhost:1234', primaryModel: '', smallFastModel: '', opusModel: '',
      ...provider,
    } as ProviderProfile],
    mcpGroups: [], directoryGroups: [],
    presets: [{ id: 'x', name: 'x', providerId: 'p', mcpGroupIds: [], directoryGroupIds: [] }],
  } as unknown as ProfileStore;
}

describe('runtime model discovery', () => {
  test('only anthropic/-prefixed gateway IDs are discoverable', () => {
    assert.equal(isGatewayDiscoverableId('anthropic/qwen3.5-9b'), true);
    assert.equal(isGatewayDiscoverableId('anthropic/qwen/qwen3-coder-next'), true);
    assert.equal(isGatewayDiscoverableId('qwen3.5-9b'), false);
    assert.equal(isGatewayDiscoverableId('google/gemma-4-e4b'), false);
  });

  test('flag on writes CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1 for proxy providers', () => {
    const r = resolvePreset(storeWith({ runtimeModelDiscovery: true }), 'x');
    assert.equal(r?.env['CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY'], '1');
  });

  test('flag off writes an empty value so it overrides an inherited one', () => {
    const r = resolvePreset(storeWith({ runtimeModelDiscovery: false }), 'x');
    assert.equal(r?.env['CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY'], '');
  });

  test('empty model slots stay empty in runtime mode (no stray pins)', () => {
    const r = resolvePreset(storeWith({ runtimeModelDiscovery: true }), 'x');
    assert.equal(r?.env['ANTHROPIC_DEFAULT_SONNET_MODEL'], '');
  });

  test('runtime mode wins over stored pins (mutually exclusive)', () => {
    const r = resolvePreset(storeWith({
      runtimeModelDiscovery: true, primaryModel: 'a', smallFastModel: 'b', opusModel: 'c',
    }), 'x');
    assert.equal(r?.env['ANTHROPIC_DEFAULT_SONNET_MODEL'], '');
    assert.equal(r?.env['ANTHROPIC_DEFAULT_HAIKU_MODEL'], '');
    assert.equal(r?.env['ANTHROPIC_DEFAULT_OPUS_MODEL'], '');
    const off = resolvePreset(storeWith({ primaryModel: 'a' }), 'x');
    assert.equal(off?.env['ANTHROPIC_DEFAULT_SONNET_MODEL'], 'a');
  });

  test('key is managed so stale values are cleared on apply', () => {
    assert.ok(MANAGED_ENV_KEYS.has('CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY'));
  });
});
