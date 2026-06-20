// T3: multi-vendor web-search — argv forwarding (codex/claude/copilot) + the
// per-adapter capability declarations that drive `--setup`'s WebSrch column.
// Anchor: tests/unit/vendor-websearch.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getAdapter } from '../../cli/src/vendors/index.js';

test('T3: web-search argv forwarding — codex --search, claude --allowedTools WebSearch, copilot --allow-tool web_search', () => {
  const codex = getAdapter('codex').args('x', { webSearch: true }).join(' ');
  assert.match(codex, /--search/);

  const claude = getAdapter('claude').args('x', { webSearch: true }).join(' ');
  assert.match(claude, /--allowedTools WebSearch/);

  const copilot = getAdapter('copilot').args('x', { webSearch: true }).join(' ');
  assert.match(copilot, /--allow-tool web_search/);

  // off when not requested
  assert.doesNotMatch(getAdapter('claude').args('x', {}).join(' '), /WebSearch/);
  assert.doesNotMatch(getAdapter('copilot').args('x', {}).join(' '), /web_search/);
  assert.doesNotMatch(getAdapter('codex').args('x', {}).join(' '), /--search/);
});

test('T3: every adapter declares a webSearch capability matching the 2026 research', () => {
  // hopper-enabled (yes): codex, claude, grok, copilot, kimi
  for (const v of ['codex', 'claude', 'grok', 'copilot', 'kimi']) {
    const ws = getAdapter(v).capabilities.webSearch;
    assert.equal(ws.hopperEnabled, true, `${v} hopperEnabled`);
    assert.equal(ws.headless, true, `${v} headless`);
    assert.equal(typeof ws.how, 'string');
  }
  // manual (env/config): mimo headless but not auto-forwarded
  assert.equal(getAdapter('mimo').capabilities.webSearch.headless, true);
  assert.equal(getAdapter('mimo').capabilities.webSearch.hopperEnabled, false);
  // not headless out of the box: opencode (config-gated), agy (none)
  assert.equal(getAdapter('opencode').capabilities.webSearch.headless, false);
  assert.equal(getAdapter('agy').capabilities.webSearch.headless, false);
});
