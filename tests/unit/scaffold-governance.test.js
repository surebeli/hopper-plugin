import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildGovernanceMarkdown, scaffoldGovernance } from '../../cli/src/scaffold.js';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('buildGovernanceMarkdown lists every registered adapter as an overlay row', () => {
  const md = buildGovernanceMarkdown();
  assert.match(md, /\*\*Constitution\*\*/);
  assert.match(md, /## Vendor overlays/);
  for (const v of ['codex', 'kimi', 'opencode', 'grok']) {
    assert.match(md, new RegExp(`\\|\\s*${v}\\s*\\|`));
  }
});

test('scaffoldGovernance writes GOVERNANCE.md and vendors the constitution with --from', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-initgov-'));
  try {
    const hopperDir = join(tmp, '.hopper'); mkdirSync(hopperDir);
    const src = join(tmp, 'core-src.md');
    writeFileSync(src, 'UPSTREAM CORE');
    const res = scaffoldGovernance(hopperDir, { from: src });
    assert.ok(existsSync(join(hopperDir, 'GOVERNANCE.md')));
    const vendored = join(hopperDir, 'governance', 'portable-agent-core.md');
    assert.ok(existsSync(vendored));
    assert.match(readFileSync(vendored, 'utf-8'), /UPSTREAM CORE/);
    assert.match(readFileSync(vendored, 'utf-8'), /provenance/i);
    assert.match(readFileSync(join(hopperDir, 'GOVERNANCE.md'), 'utf-8'),
      /Constitution\*\*:\s*\.hopper\/governance\/portable-agent-core\.md/);
    assert.ok(res.written.length >= 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('scaffoldGovernance refuses to overwrite without force', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-initgov-'));
  try {
    const hopperDir = join(tmp, '.hopper'); mkdirSync(hopperDir);
    writeFileSync(join(hopperDir, 'GOVERNANCE.md'), 'existing');
    assert.throws(() => scaffoldGovernance(hopperDir, {}), /exist/i);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
