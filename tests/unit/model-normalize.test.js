// V4: model-name normalization (user-said name → canonical bare name).
// Anchor: tests/unit/model-normalize.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeModel } from '../../cli/src/model-normalize.js';
import { resolveAdapterOptsForTask } from '../../cli/src/dispatch.js';

test('V4 normalizeModel: codex — case/dash/dot-insensitive, prefix-strip, FULL-key equality, passthrough', () => {
  const kg = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'];
  assert.equal(normalizeModel('codex', 'GPT-5.5', kg), 'gpt-5.5');
  assert.equal(normalizeModel('codex', 'gpt5.5', kg), 'gpt-5.5');
  assert.equal(normalizeModel('codex', 'openai-codex/gpt-5.5', kg), 'gpt-5.5'); // provider prefix stripped
  assert.equal(normalizeModel('codex', 'gpt-5.4', kg), 'gpt-5.4');             // must NOT become gpt-5.4-mini
  assert.equal(normalizeModel('codex', 'gpt-5.4-mini', kg), 'gpt-5.4-mini');
  assert.equal(normalizeModel('codex', 'gpt-6', kg), 'gpt-6');                 // unknown → passthrough
});

test('V4 normalizeModel: claude — [1m] variants stay distinct from the base alias', () => {
  const kg = ['sonnet', 'opus', 'opus[1m]'];
  assert.equal(normalizeModel('claude', 'Opus', kg), 'opus');
  assert.equal(normalizeModel('claude', 'opus 1m', kg), 'opus[1m]');
  assert.equal(normalizeModel('claude', 'opus', kg), 'opus'); // not opus[1m]
});

test('V4 normalizeModel: agy — fuzzy-matches a loose phrase to the exact display label', () => {
  const kg = ['Gemini 3.5 Flash (High)', 'Gemini 3.1 Pro (Low)'];
  assert.equal(normalizeModel('agy', 'gemini 3.5 flash high', kg), 'Gemini 3.5 Flash (High)');
  assert.equal(normalizeModel('agy', 'GEMINI-3.1-PRO-LOW', kg), 'Gemini 3.1 Pro (Low)');
});

test('V4 normalizeModel: mimo — exact + unambiguous tail match; prefix never invented', () => {
  const kg = ['mimo/mimo-auto', 'xiaomi/mimo-v2.5-pro', 'xiaomi/mimo-v2.5-pro-ultraspeed'];
  assert.equal(normalizeModel('mimo', 'xiaomi/mimo-v2.5-pro', kg), 'xiaomi/mimo-v2.5-pro');
  assert.equal(normalizeModel('mimo', 'mimo-v2.5-pro', kg), 'xiaomi/mimo-v2.5-pro'); // unique tail match
  assert.equal(normalizeModel('mimo', 'mimo-v9-nonexistent', kg), 'mimo-v9-nonexistent'); // passthrough
});

test('V4 normalizeModel: kimi — alias key only (no fuzzy rewrite to an upstream id)', () => {
  const kg = ['kimi-code/kimi-for-coding'];
  assert.equal(normalizeModel('kimi', 'kimi-code/kimi-for-coding', kg), 'kimi-code/kimi-for-coding');
  assert.equal(normalizeModel('kimi', 'some-other-alias', kg), 'some-other-alias'); // passthrough, never guess
});

test('V4 normalizeModel: empty / placeholder knownGood → passthrough', () => {
  assert.equal(normalizeModel('opencode', 'anthropic/claude-sonnet-4-6', ['<provider>/<model>']), 'anthropic/claude-sonnet-4-6');
  assert.equal(normalizeModel('codex', '', ['gpt-5.5']), '');
});

test('V4 integration: resolveAdapterOptsForTask normalizes against the resolved vendor knownGood', () => {
  const resolved = { vendor: 'codex', task: { taskType: 'code-impl', brief: 'x' }, taskSpec: '' };
  assert.equal(resolveAdapterOptsForTask(resolved, { model: 'GPT-5.5' }).model, 'gpt-5.5', 'normalized via the chokepoint');
  assert.equal(resolveAdapterOptsForTask(resolved, { model: 'gpt-9-future' }).model, 'gpt-9-future', 'unknown passes through');
});

// ─── review follow-ups: validation-legal loose forms, ambiguity/cross-vendor safety, hygiene ───

test('V4 normalizeModel: claude/agy — VALIDATION-LEGAL loose forms reach the canonical bracket/paren label', () => {
  // The dash/no-separator forms (what actually passes MODEL_PATTERN as --model) must
  // still collide onto the bracket/paren canonical names V2 ships.
  assert.equal(normalizeModel('claude', 'opus-1m', ['opus', 'opus[1m]']), 'opus[1m]');
  assert.equal(normalizeModel('claude', 'opus1m', ['opus', 'opus[1m]']), 'opus[1m]');
  const agyKg = ['Gemini 3.5 Flash (High)', 'Gemini 3.1 Pro (Low)'];
  assert.equal(normalizeModel('agy', 'gemini-3.5-flash-high', agyKg), 'Gemini 3.5 Flash (High)');
});

test('V4 normalizeModel: mimo AMBIGUOUS tail → passthrough (never invent a prefix)', () => {
  assert.equal(normalizeModel('mimo', 'shared', ['a/shared', 'b/shared']), 'shared', 'two providers share the tail → no guess');
});

test('V4 normalizeModel: cross-vendor safety — one vendor id offered to another passes through unchanged', () => {
  // codex catalog has gpt-5.3-codex-spark (canonKey gpt53codexspark) — a bare gpt-5.3-codex
  // (gpt53codex) must NOT collide onto it.
  assert.equal(normalizeModel('codex', 'gpt-5.3-codex', ['gpt-5.5', 'gpt-5.3-codex-spark']), 'gpt-5.3-codex');
  assert.equal(normalizeModel('grok', 'claude-opus-4.8', ['grok-build']), 'claude-opus-4.8');
});

test('V4 normalizeModel: input hygiene — non-string / nullish / bad knownGood never throw', () => {
  assert.equal(normalizeModel('codex', undefined, ['gpt-5.5']), undefined);
  assert.equal(normalizeModel('codex', null, ['gpt-5.5']), null);
  assert.equal(normalizeModel('codex', '   ', ['gpt-5.5']), '   ');
  assert.equal(normalizeModel('codex', 42, ['gpt-5.5']), 42);
  assert.equal(normalizeModel('codex', 'gpt-5.5', null), 'gpt-5.5', 'null knownGood → passthrough');
  assert.equal(normalizeModel('codex', 'gpt-5.5', undefined), 'gpt-5.5');
});

test('V4 normalizeModel: idempotent — normalizing the canonical output again is a fixpoint', () => {
  const kg = ['gpt-5.5', 'gpt-5.4-mini'];
  const once = normalizeModel('codex', 'GPT-5.5', kg);
  assert.equal(normalizeModel('codex', once, kg), once);
  const agyKg = ['Gemini 3.5 Flash (High)'];
  const a1 = normalizeModel('agy', 'gemini-3.5-flash-high', agyKg);
  assert.equal(normalizeModel('agy', a1, agyKg), a1);
});
