// Phase 6b vendor probe tests
// Anchor: tests/unit/vendor-probe.test.js
//
// Each adapter's probe() returns a standard shape. Live spawn-based probe
// is NOT tested here (requires real vendor CLIs installed + auth); instead
// we test the structural contract + the zero-spawn vendors (kimi, agy).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { probeVendor, listAdapters } from '../../cli/src/vendors/index.js';

test('probeVendor throws on unknown vendor name', async () => {
  await assert.rejects(
    () => probeVendor('nonexistent'),
    /No vendor adapter registered/
  );
});

test('agy probe returns introspection_supported=none, no spawn', async () => {
  const r = await probeVendor('agy');
  assert.equal(r.introspection_supported, 'none');
  assert.ok(Array.isArray(r.models));
  assert.ok(Array.isArray(r.reasoning_levels));
  assert.equal(r.reasoning_levels.length, 0, 'agy has no reasoning enum');
  assert.ok(typeof r.duration_ms === 'number');
});

test('kimi probe declares config-only introspection', async () => {
  const r = await probeVendor('kimi');
  assert.equal(r.introspection_supported, 'config-only');
  assert.ok(Array.isArray(r.models));
  assert.deepEqual(r.reasoning_levels, ['--thinking', '--no-thinking'],
    'kimi reasoning is binary, not enumerated');
  // duration ms should be fast (file-read only, no spawn)
  assert.ok(r.duration_ms < 5000, `kimi probe should be <5s (no spawn); got ${r.duration_ms}ms`);
});

test('all 5 adapters have a probe-module that exports probe()', async () => {
  for (const name of listAdapters()) {
    const mod = await import(`../../cli/src/vendor-probe/${name}.js`);
    assert.equal(typeof mod.probe, 'function', `${name} must export probe()`);
  }
});

test('probe result shape is consistent across all adapters', async () => {
  // Only probe the zero-spawn ones to keep tests deterministic + fast.
  for (const name of ['agy', 'kimi']) {
    const r = await probeVendor(name);
    assert.ok(['full', 'partial', 'config-only', 'none'].includes(r.introspection_supported),
      `${name} introspection_supported must be one of valid levels; got ${r.introspection_supported}`);
    assert.ok('models' in r);
    assert.ok('models_source' in r);
    assert.ok('reasoning_levels' in r);
    assert.ok('notes' in r);
    assert.ok('duration_ms' in r);
    assert.ok(typeof r.duration_ms === 'number');
  }
});

test('codex probe-module: codex.probe parses .slug field (not .name/.id)', async () => {
  // Read the source to confirm the slug-field fix landed
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const src = readFileSync(join(REPO_ROOT, 'cli', 'src', 'vendor-probe', 'codex.js'), 'utf-8');
  assert.match(src, /m\.slug/, 'codex probe must extract .slug field per Phase 6b research');
});

test('zero-spawn discovery surface unchanged: --check / --capabilities still spawn-free', async () => {
  // The path-resolve.js + vendors/index.js + adapter files must STILL be
  // spawn-free. Vendor-probe/*.js MAY spawn (that's the carve-out).
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');

  const discoveryHotPath = [
    join(REPO_ROOT, 'cli', 'src', 'path-resolve.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'index.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'codex.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'kimi.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'opencode.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'copilot.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'agy.js'),
  ];
  for (const f of discoveryHotPath) {
    const src = readFileSync(f, 'utf-8');
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const noStrings = noComments.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
    const noImports = noStrings.replace(/^\s*import\s*\{[^}]*\}\s*from[^;\n]+;?/gm, '');
    assert.ok(!/\bspawn\s*\(/.test(noImports),
      `${f.split(/[/\\]/).pop()}: contains spawn() call site — would break --check/--capabilities zero-spawn proof`);
  }
});

// ─── P1-fix: static-fixture tests for the 4 parser paths ───────────────

test('codex parser: extracts .slug from JSON array', async () => {
  const { parseCodexModelsJson } = await import('../../cli/src/vendor-probe/codex.js');
  const stdout = JSON.stringify([
    { slug: 'gpt-5.5', name: 'GPT 5.5 (display)', id: 'm-1' },
    { slug: 'gpt-5.4' },
  ]);
  assert.deepEqual(parseCodexModelsJson(stdout), ['gpt-5.5', 'gpt-5.4']);
});

test('codex parser: handles { models: [...] } envelope', async () => {
  const { parseCodexModelsJson } = await import('../../cli/src/vendor-probe/codex.js');
  const stdout = JSON.stringify({ models: [{ slug: 'foo' }, { slug: 'bar' }] });
  assert.deepEqual(parseCodexModelsJson(stdout), ['foo', 'bar']);
});

test('codex parser: falls back to .name then .id when .slug missing', async () => {
  const { parseCodexModelsJson } = await import('../../cli/src/vendor-probe/codex.js');
  const stdout = JSON.stringify([{ name: 'fallback-name' }, { id: 'fallback-id' }]);
  assert.deepEqual(parseCodexModelsJson(stdout), ['fallback-name', 'fallback-id']);
});

test('codex parser: filters out entries with no identifier', async () => {
  const { parseCodexModelsJson } = await import('../../cli/src/vendor-probe/codex.js');
  const stdout = JSON.stringify([{ slug: 'good' }, {}, { other: 'x' }, { slug: 'good2' }]);
  assert.deepEqual(parseCodexModelsJson(stdout), ['good', 'good2']);
});

test('codex parser: throws on malformed JSON', async () => {
  const { parseCodexModelsJson } = await import('../../cli/src/vendor-probe/codex.js');
  assert.throws(() => parseCodexModelsJson('not json {'));
});

test('opencode parser: strips ANSI codes', async () => {
  const { stripAnsi } = await import('../../cli/src/vendor-probe/opencode.js');
  // ESC[31m red ESC[0m reset
  const colored = '\x1B[31mclaude-opus-4-7\x1B[0m';
  assert.equal(stripAnsi(colored), 'claude-opus-4-7');
});

test('opencode parser: extracts model identifiers and EXCLUDES header lines', async () => {
  const { parseOpencodeModelsList } = await import('../../cli/src/vendor-probe/opencode.js');
  const stdout = [
    '\x1B[1mAvailable models:\x1B[0m',         // R2-P1: header MUST be excluded
    'Available models:',                         // bare header form too
    'Models in catalog (13):',                  // another header form
    '',
    'opencode/claude-opus-4-7',
    'opencode/claude-sonnet-4-6',
    'deepseek/v4-flash',
    'xiaomi/mimo-coder-pro:thinking',
    '  ',
    '(some prose with parens)',
    '# comment-like',
    '* asterisk leader',
  ].join('\n');
  const got = parseOpencodeModelsList(stdout);
  assert.ok(got.includes('opencode/claude-opus-4-7'));
  assert.ok(got.includes('deepseek/v4-flash'));
  assert.ok(got.includes('xiaomi/mimo-coder-pro:thinking'));
  // R2-P1 regression: lines with whitespace / prose must NOT be included
  assert.ok(!got.includes('Available models:'),
    `R2-P1: header line must be excluded; got models: ${got.join(', ')}`);
  assert.ok(!got.some((m) => m.includes(' ')),
    `no identifier may contain whitespace; got: ${got.join(', ')}`);
  assert.ok(!got.some((m) => m.includes(':') && m.endsWith(':')),
    `no identifier may end with ':' (that would indicate a header); got: ${got.join(', ')}`);
  // Exactly the 4 real models present
  assert.equal(got.length, 4, `expected 4 model identifiers, got ${got.length}: ${got.join(', ')}`);
});

test('kimi parser: handles bare TOML section names', async () => {
  const { parseKimiTomlConfig } = await import('../../cli/src/vendor-probe/kimi.js');
  const content = `
[models.default]
capabilities = ["thinking", "vision"]

[models.fast]
capabilities = ["thinking"]
`;
  const r = parseKimiTomlConfig(content);
  assert.deepEqual(r.models, ['default', 'fast']);
  assert.equal(r.modelsCaps.length, 2);
  assert.deepEqual(r.modelsCaps[0].caps, ['thinking', 'vision']);
});

test('kimi parser: P2-fix — handles TOML-quoted section names with slashes', async () => {
  const { parseKimiTomlConfig } = await import('../../cli/src/vendor-probe/kimi.js');
  const content = `
[models."kimi-code/kimi-for-coding"]
capabilities = ["thinking"]

[models.'single-quoted/name']
capabilities = ["always_thinking"]
`;
  const r = parseKimiTomlConfig(content);
  assert.deepEqual(r.models, ['kimi-code/kimi-for-coding', 'single-quoted/name']);
  // Both capability blocks must be extracted (regression: original indexOf missed quoted keys)
  assert.equal(r.modelsCaps.length, 2,
    `expected 2 modelsCaps, got ${r.modelsCaps.length}: ${JSON.stringify(r.modelsCaps)}`);
  assert.deepEqual(r.modelsCaps[0].caps, ['thinking']);
  assert.deepEqual(r.modelsCaps[1].caps, ['always_thinking']);
});

test('kimi parser: R2-P2 — handles brackets inside TOML-quoted keys', async () => {
  const { parseKimiTomlConfig } = await import('../../cli/src/vendor-probe/kimi.js');
  const content = `
[models."a.b+key[1]"]
capabilities = ["thinking"]

[models."weird]name"]
capabilities = ["vision"]

[models.plain]
capabilities = ["fast"]
`;
  const r = parseKimiTomlConfig(content);
  // Bracket-containing quoted keys must be captured fully
  assert.ok(r.models.includes('a.b+key[1]'),
    `R2-P2: bracket-containing key must survive; got models: ${r.models.join(', ')}`);
  assert.ok(r.models.includes('plain'));
  // Capability extraction must work even for the bracket-key section
  const bracketCap = r.modelsCaps.find((c) => c.name === 'a.b+key[1]');
  assert.ok(bracketCap, 'expected capabilities for the bracket-key model');
  assert.deepEqual(bracketCap.caps, ['thinking']);
});

test('kimi parser: empty config returns empty result', async () => {
  const { parseKimiTomlConfig } = await import('../../cli/src/vendor-probe/kimi.js');
  const r = parseKimiTomlConfig('# just comments\n# no model blocks\n');
  assert.deepEqual(r.models, []);
  assert.deepEqual(r.modelsCaps, []);
});

test('copilot scanner: lists *.agent.md files with name stripping', async (t) => {
  const { scanAgentMdFiles } = await import('../../cli/src/vendor-probe/copilot.js');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: pathJoin } = await import('node:path');
  const dir = mkdtempSync(pathJoin(tmpdir(), 'copilot-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(pathJoin(dir, 'reviewer.agent.md'), '---\nname: reviewer\n---\n');
  writeFileSync(pathJoin(dir, 'planner.agent.md'), '---\nname: planner\n---\n');
  writeFileSync(pathJoin(dir, 'README.md'), 'not an agent');           // ignored: wrong suffix
  writeFileSync(pathJoin(dir, '.gitignore'), '');                       // ignored
  const got = scanAgentMdFiles(dir);
  assert.ok(got.includes('reviewer'), `expected reviewer; got ${got.join(', ')}`);
  assert.ok(got.includes('planner'), `expected planner; got ${got.join(', ')}`);
  assert.ok(!got.some((s) => s.includes('README')), `README must not be listed; got ${got.join(', ')}`);
  assert.equal(got.length, 2);
});

test('copilot scanner: applies suffix when provided', async (t) => {
  const { scanAgentMdFiles } = await import('../../cli/src/vendor-probe/copilot.js');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: pathJoin } = await import('node:path');
  const dir = mkdtempSync(pathJoin(tmpdir(), 'copilot-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(pathJoin(dir, 'foo.agent.md'), '');
  const got = scanAgentMdFiles(dir, ' (project)');
  assert.deepEqual(got, ['foo (project)']);
});

test('copilot scanner: missing dir returns empty array (does not throw)', async () => {
  const { scanAgentMdFiles } = await import('../../cli/src/vendor-probe/copilot.js');
  assert.deepEqual(scanAgentMdFiles('/no/such/path/should/not/exist'), []);
});

test('vendor-probe modules are NOT pulled into --check/--capabilities (lazy import)', async () => {
  // Verify vendors/index.js uses dynamic import for probe modules so they
  // are not loaded by --check or --capabilities (which don't probe).
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const indexSrc = readFileSync(join(REPO_ROOT, 'cli', 'src', 'vendors', 'index.js'), 'utf-8');
  // Must contain a dynamic import for vendor-probe
  assert.match(indexSrc, /await\s+import\s*\(\s*['"`]\.\.\/vendor-probe\//,
    'vendors/index.js must lazy-import vendor-probe modules so --check/--capabilities stay spawn-free');
});
