import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { publicModelIdentifier, publicModelIdentifiers } from '../../cli/src/public-identifiers.js';
import { validateModelName } from '../../cli/src/validation.js';

test('shared public model projection preserves grammar-safe and declared adapter identifiers', () => {
  assert.equal(publicModelIdentifier('fable', 'claude'), 'fable');
  assert.equal(publicModelIdentifier('tokenbox-kimi-k27/kimi-k2.7-code', 'opencode'), 'tokenbox-kimi-k27/kimi-k2.7-code');
  assert.equal(publicModelIdentifier('deepseek/deepseek-v4-pro', 'opencode'), 'deepseek/deepseek-v4-pro');
  assert.equal(publicModelIdentifier('opus[1m]', 'claude'), 'opus[1m]');
  assert.equal(publicModelIdentifier('Gemini 3.5 Flash (High)', 'agy'), 'Gemini 3.5 Flash (High)');
  assert.deepEqual(publicModelIdentifiers(['fable', 'fable', 'deepseek/deepseek-v4-pro'], 'opencode'), [
    'fable', 'deepseek/deepseek-v4-pro',
  ]);
});

test('shared public model projection drops credentials, paths, URLs, controls, and overlong values', () => {
  const hostile = [
    'sk_live_0123456789abcdefghijklmnop',
    'ghp_0123456789abcdefghijklmnop',
    'glpat-0123456789abcdefghijklmnop',
    'xoxb-0123456789abcdefghijklmnop',
    'xai-0123456789abcdefghijklmnop',
    'C:\\private\\model',
    '/private/model',
    'https://private.example/model',
    'safe\u0000model',
    `m${'a'.repeat(128)}`,
  ];
  for (const value of hostile) assert.equal(publicModelIdentifier(value, 'claude'), null, value);
});

test('model argv validation rejects credential-shaped values without echoing the secret', () => {
  const secret = 'sk_live_0123456789abcdefghijklmnop';
  assert.throws(() => validateModelName(secret), (error) => {
    assert.match(error.message, /unsafe model identifier/i);
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});
