// HOPPER-3: codex adapter isolates the dispatched codex from the host's global
// config (skills / hooks / project docs) so dispatch stays deterministic.
// Anchor: tests/unit/codex-isolation.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexAdapter, codexIsolationConfig, resolveIsolatedCodexHome } from '../../cli/src/vendors/codex.js';

function withEnv(key, value, fn) {
  return withEnvs({ [key]: value }, fn);
}

function withEnvs(map, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(map)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// Build a fake "real" CODEX_HOME with auth + a global skill + config.
function makeFakeCodexHome() {
  const real = mkdtempSync(join(tmpdir(), 'codex-real-'));
  writeFileSync(join(real, 'auth.json'), '{"OPENAI_API_KEY":"sk-fake"}');
  writeFileSync(join(real, 'config.toml'), 'model = "gpt-5.5"\nnotify = ["beep"]\n');
  mkdirSync(join(real, 'skills', 'my-global-skill'), { recursive: true });
  writeFileSync(join(real, 'skills', 'my-global-skill', 'SKILL.md'), '# global skill\n');
  const iso = join(mkdtempSync(join(tmpdir(), 'codex-iso-')), 'home');
  return { real, iso };
}

test('HOPPER-3: codex args() isolate project docs + notify hook by default', () => {
  const argv = codexAdapter.args('hi', {});
  const joined = argv.join(' ');
  assert.match(joined, /-c project_doc_max_bytes=0/, 'must disable AGENTS.md/project-doc loading');
  assert.match(joined, /-c notify=\[\]/, 'must disable the notify hook');
});

test('HOPPER-3: isolation overrides are separate -c argv elements (codex -c contract)', () => {
  const argv = codexAdapter.args('hi', {});
  const i = argv.indexOf('project_doc_max_bytes=0');
  assert.ok(i > 0 && argv[i - 1] === '-c', 'project_doc_max_bytes must be preceded by its own -c');
  const j = argv.indexOf('notify=[]');
  assert.ok(j > 0 && argv[j - 1] === '-c', 'notify must be preceded by its own -c');
});

test('HOPPER-3: reasoning override coexists with isolation overrides', () => {
  const argv = codexAdapter.args('hi', { reasoning: 'high' });
  assert.ok(argv.some((a) => a.includes('model_reasoning_effort="high"')));
  assert.ok(argv.includes('project_doc_max_bytes=0'));
});

test('HOPPER-3: HOPPER_CODEX_ISOLATE=0 escape hatch disables isolation', () => {
  withEnv('HOPPER_CODEX_ISOLATE', '0', () => {
    assert.deepEqual(codexIsolationConfig(), []);
    const argv = codexAdapter.args('hi', {});
    assert.doesNotMatch(argv.join(' '), /project_doc_max_bytes/);
    assert.doesNotMatch(argv.join(' '), /notify=/);
  });
});

test('HOPPER-3: HOPPER_CODEX_EXTRA_CONFIG appends extra -c overrides', () => {
  withEnv('HOPPER_CODEX_EXTRA_CONFIG', 'features.web_search=false, sandbox_workspace_write=false', () => {
    const cfg = codexIsolationConfig();
    assert.ok(cfg.includes('features.web_search=false'));
    assert.ok(cfg.includes('sandbox_workspace_write=false'));
    // Still flat -c pairs.
    const idx = cfg.indexOf('features.web_search=false');
    assert.equal(cfg[idx - 1], '-c');
  });
});

test('HOPPER-3: extra-config is ignored when isolation is disabled', () => {
  withEnv('HOPPER_CODEX_ISOLATE', '0', () => {
    withEnv('HOPPER_CODEX_EXTRA_CONFIG', 'x=1', () => {
      assert.deepEqual(codexIsolationConfig(), []);
    });
  });
});

// ─── auto-isolated CODEX_HOME (zero user setup) ───────────────────────

test('HOPPER-3: resolveIsolatedCodexHome builds a login-preserving home WITHOUT global skills', () => {
  const { real, iso } = makeFakeCodexHome();
  try {
    withEnvs({ CODEX_HOME: real, HOPPER_CODEX_HOME: iso, HOPPER_CODEX_ISOLATE: undefined }, () => {
      const result = resolveIsolatedCodexHome();
      assert.equal(result, iso);
      // auth carried over (login preserved) ...
      assert.ok(existsSync(join(iso, 'auth.json')), 'auth.json must be present in the isolated home');
      assert.equal(readFileSync(join(iso, 'auth.json'), 'utf-8'), '{"OPENAI_API_KEY":"sk-fake"}');
      // ... config carried over ...
      assert.ok(existsSync(join(iso, 'config.toml')), 'config.toml should be copied');
      // ... but the host's global skills are NOT.
      assert.equal(existsSync(join(iso, 'skills')), false, 'global skills must NOT leak into the isolated home');
    });
  } finally {
    rmSync(real, { recursive: true, force: true });
    rmSync(iso, { recursive: true, force: true });
  }
});

test('HOPPER-3: codexAdapter.env() points CODEX_HOME at the isolated home', () => {
  const { real, iso } = makeFakeCodexHome();
  try {
    withEnvs({ CODEX_HOME: real, HOPPER_CODEX_HOME: iso, HOPPER_CODEX_ISOLATE: undefined }, () => {
      const env = codexAdapter.env({});
      assert.equal(env.CODEX_HOME, iso);
    });
  } finally {
    rmSync(real, { recursive: true, force: true });
    rmSync(iso, { recursive: true, force: true });
  }
});

test('HOPPER-3: HOPPER_CODEX_ISOLATE=0 disables the CODEX_HOME swap', () => {
  const { real, iso } = makeFakeCodexHome();
  try {
    withEnvs({ CODEX_HOME: real, HOPPER_CODEX_HOME: iso, HOPPER_CODEX_ISOLATE: '0' }, () => {
      assert.equal(resolveIsolatedCodexHome(), null);
      assert.deepEqual(codexAdapter.env({}), {});
    });
  } finally {
    rmSync(real, { recursive: true, force: true });
    rmSync(iso, { recursive: true, force: true });
  }
});

test('HOPPER-3: refuses an isolated home that lives inside the real CODEX_HOME', () => {
  const { real, iso } = makeFakeCodexHome();
  try {
    // HOPPER_CODEX_HOME pointed INSIDE the real home must be rejected (no
    // writing/symlinking into the real ~/.codex tree).
    withEnvs({ CODEX_HOME: real, HOPPER_CODEX_HOME: join(real, 'sub'), HOPPER_CODEX_ISOLATE: undefined }, () => {
      assert.equal(resolveIsolatedCodexHome(), null);
      assert.equal(existsSync(join(real, 'sub')), false, 'must not create anything inside the real home');
    });
  } finally {
    rmSync(real, { recursive: true, force: true });
    rmSync(iso, { recursive: true, force: true });
  }
});

test('HOPPER-3: no discoverable auth → no isolation (codex keeps its default home)', () => {
  const empty = mkdtempSync(join(tmpdir(), 'codex-noauth-'));
  const iso = join(mkdtempSync(join(tmpdir(), 'codex-iso2-')), 'home');
  try {
    withEnvs({
      CODEX_HOME: empty, HOPPER_CODEX_HOME: iso, HOPPER_CODEX_ISOLATE: undefined,
      CODEX_API_KEY: undefined, OPENAI_API_KEY: undefined,
    }, () => {
      assert.equal(resolveIsolatedCodexHome(), null);
      assert.deepEqual(codexAdapter.env({}), {});
    });
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(iso, { recursive: true, force: true });
  }
});
