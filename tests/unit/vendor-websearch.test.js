// T3: multi-vendor web-search — argv forwarding (codex/claude) + the per-adapter
// capability declarations that drive `--setup`'s WebSrch column.
// Anchor: tests/unit/vendor-websearch.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getAdapter } from '../../cli/src/vendors/index.js';

test('T3: web-search argv forwarding — codex --search, claude --allowedTools WebSearch (incl. read-only)', () => {
  assert.match(getAdapter('codex').args('x', { webSearch: true }).join(' '), /--search/);
  assert.match(getAdapter('claude').args('x', { webSearch: true }).join(' '), /--allowedTools WebSearch/);

  // read-only research path (the load-bearing case): claude still gets WebSearch, and it
  // is NOT under --dangerously-skip-permissions (so the allow entry is meaningful).
  const claudeRo = getAdapter('claude').args('x', { webSearch: true, sandbox: 'read-only' }).join(' ');
  assert.match(claudeRo, /--allowedTools WebSearch/);
  assert.doesNotMatch(claudeRo, /--dangerously-skip-permissions/);

  // off when not requested
  assert.doesNotMatch(getAdapter('claude').args('x', {}).join(' '), /WebSearch/);
  assert.doesNotMatch(getAdapter('codex').args('x', {}).join(' '), /--search/);
});

test('T3: non-forwarding vendors emit NO web-search argv even when opts.webSearch is set', () => {
  // grok/kimi auto-search (no flag); copilot read-only token unverified; mimo/opencode env; agy none.
  for (const v of ['grok', 'kimi', 'copilot', 'mimo', 'opencode', 'agy']) {
    const on = getAdapter(v).args('x', { webSearch: true, sandbox: 'read-only' }).join(' ');
    assert.doesNotMatch(on, /--search|--allowedTools WebSearch|--allow-tool web_search/, `${v} must not forward web-search argv`);
  }
});

test('T3: every adapter declares a webSearch capability matching the 2026 research', () => {
  // hopper-enabled (yes): codex, claude, grok, kimi
  for (const v of ['codex', 'claude', 'grok', 'kimi']) {
    const ws = getAdapter(v).capabilities.webSearch;
    assert.equal(ws.hopperEnabled, true, `${v} hopperEnabled`);
    assert.equal(ws.headless, true, `${v} headless`);
    assert.equal(typeof ws.how, 'string');
  }
  // manual (headless but not auto-forwarded): copilot (read-only token unverified), mimo (env)
  for (const v of ['copilot', 'mimo']) {
    assert.equal(getAdapter(v).capabilities.webSearch.headless, true, `${v} headless`);
    assert.equal(getAdapter(v).capabilities.webSearch.hopperEnabled, false, `${v} not auto-forwarded`);
  }
  // not headless out of the box: opencode (config-gated), agy (none)
  assert.equal(getAdapter('opencode').capabilities.webSearch.headless, false);
  assert.equal(getAdapter('agy').capabilities.webSearch.headless, false);
});
