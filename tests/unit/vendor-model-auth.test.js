// V2/V5: agy auth misclassification fix + agy --model + bare-model knownGood corrections.
// Anchor: tests/unit/vendor-model-auth.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { agyAdapter } from '../../cli/src/vendors/agy.js';
import { getAdapter } from '../../cli/src/vendors/index.js';

// ─── V5: agy never-auth was a false positive (boot noise + non-TTY stdout drop) ───

test('V5 agy parseResult: boot-time auth noise + a success marker is NOT auth-fail', () => {
  // The exact reproduced shape: exit 0, empty stdout (non-TTY drop), log has transient
  // "not logged in" boot noise THEN the authoritative success markers.
  const r = agyAdapter.parseResult({
    exitCode: 0, timedOut: false, durationMs: 43000, stdout: '', stderr: '',
    logFileContent: [
      'printmode.go:190 Print mode: not authenticated, trying silent auth',
      'You are not logged into Antigravity',
      'Failed to get OAuth token: error getting token source',
      'auth.go:132 ChainedAuth: authenticated via keyring (effective: keyring)',
      'server_oauth.go:217 OAuth: authenticated successfully as user@example.com',
      'printmode.go:192 Print mode: silent auth succeeded',
      '<full conversation streamed> ... clean shutdown',
    ].join('\n'),
  });
  assert.notEqual(r.status, 'auth-fail', 'boot noise + success marker must NOT be auth-fail');
  assert.equal(r.status, 'unknown-fail');
  assert.match(r.error, /non-TTY stdout drop|--result <id> --full/, 'explains the real cause (non-TTY drop)');
});

test('V5 agy parseResult: a REAL auth failure marker (no success) is still auth-fail', () => {
  const r = agyAdapter.parseResult({
    exitCode: 1, timedOut: false, durationMs: 1200, stdout: '', stderr: '',
    logFileContent: 'Print mode: silent auth failed, triggering OAuth\nkeyringAuth: timed out',
  });
  assert.equal(r.status, 'auth-fail');
});

test('V5 agy parseResult: exit 0 + real stdout + auth marker = success', () => {
  const r = agyAdapter.parseResult({
    exitCode: 0, timedOut: false, durationMs: 5000, stdout: 'THE ANSWER', stderr: '',
    logFileContent: 'ChainedAuth: authenticated via keyring',
  });
  assert.equal(r.status, 'success');
  assert.equal(r.text, 'THE ANSWER');
});

// ─── V2: agy --model + bare-model knownGood corrections ───

test('V2 agy: --model forwarded as a verbatim label; modelArg freeform with the 4 labels', () => {
  const a = agyAdapter.args('p', { model: 'Gemini 3.1 Pro (High)' });
  const i = a.indexOf('--model');
  assert.ok(i >= 0 && a[i + 1] === 'Gemini 3.1 Pro (High)', 'forwards the full label verbatim');
  assert.ok(!agyAdapter.args('p', {}).includes('--model'), 'no --model when unset');
  assert.equal(agyAdapter.capabilities.modelArg.accepted, 'freeform');
  assert.ok(agyAdapter.capabilities.modelArg.knownGood.includes('Gemini 3.5 Flash (High)'));
});

test('V2 knownGood corrections: grok drops stale grok-4.3; codex includes gpt-5.4', () => {
  const grok = getAdapter('grok').capabilities.modelArg.knownGood;
  assert.ok(grok.includes('grok-build') && grok.includes('grok-composer-2.5-fast'));
  assert.ok(!grok.includes('grok-4.3'), 'stale grok-4.3 removed');
  const codex = getAdapter('codex').capabilities.modelArg.knownGood;
  assert.ok(codex.includes('gpt-5.4') && codex.includes('gpt-5.5'), 'codex now lists gpt-5.4');
  const claude = getAdapter('claude').capabilities.modelArg.knownGood;
  assert.ok(claude.includes('opusplan') && claude.includes('sonnet[1m]'), 'claude lists compound aliases');
  assert.ok(getAdapter('copilot').capabilities.modelArg.knownGood.includes('auto'), 'copilot populated');
});
