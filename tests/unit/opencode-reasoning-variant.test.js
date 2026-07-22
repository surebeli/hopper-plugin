// OpenCode reasoning-variant dispatch contract.
// Anchor: tests/unit/opencode-reasoning-variant.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveAdapterOptsForTask } from '../../cli/src/dispatch.js';
import { opencodeAdapter } from '../../cli/src/vendors/opencode.js';
import { codexAdapter } from '../../cli/src/vendors/codex.js';

function withEnv(key, value, fn) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try { return fn(); } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

function resolvedFor(vendor) {
  return {
    vendor,
    task: { id: 'T-OPENCODE-VARIANT', taskType: 'code-impl', brief: 'inspect the source' },
    taskSpec: '',
    policy: { effortPolicy: '', modelRule: '' },
  };
}

function variant(argv) {
  const index = argv.indexOf('--variant');
  return index === -1 ? undefined : argv[index + 1];
}

test('OpenCode forwards explicit CLI reasoning as --variant, preserves safe implicit default, and gives env override precedence', () => {
  withEnv('HOPPER_OPENCODE_VARIANT', undefined, () => {
    const implicit = resolveAdapterOptsForTask(resolvedFor('opencode'), {});
    assert.equal(implicit.reasoning, 'xhigh');
    assert.equal(implicit.reasoningSource, 'default');
    assert.equal(variant(opencodeAdapter.args('p', implicit)), undefined,
      'the synthesized global default must not be sent to arbitrary OpenCode providers');

    const explicit = resolveAdapterOptsForTask(resolvedFor('opencode'), { reasoning: 'high' });
    assert.equal(explicit.reasoningSource, 'user-argv');
    assert.equal(variant(opencodeAdapter.args('p', explicit)), 'high',
      'an explicit Hopper --reasoning value must reach OpenCode as --variant verbatim');
    const rerun = resolveAdapterOptsForTask(resolvedFor('opencode'), explicit);
    assert.equal(rerun.reasoningSource, 'user-argv',
      'the explicit source must survive the second resolver pass used by execution paths');
    assert.equal(variant(opencodeAdapter.args('p', rerun)), 'high');

    const policy = resolveAdapterOptsForTask({
      ...resolvedFor('opencode'),
      policy: { effortPolicy: 'opencode:medium', modelRule: '' },
    }, {});
    assert.equal(policy.reasoningSource, 'policy');
    assert.equal(variant(opencodeAdapter.args('p', policy)), undefined,
      'an AGENTS.md effort policy must not force a variant onto an arbitrary OpenCode provider');

    const codex = resolveAdapterOptsForTask(resolvedFor('codex'), {});
    assert.ok(codexAdapter.args('p', codex).some((arg) => arg.includes('model_reasoning_effort="xhigh"')),
      'the new OpenCode provenance must not change another adapter\'s default-effort behavior');
  });

  withEnv('HOPPER_OPENCODE_VARIANT', 'provider-custom', () => {
    const explicit = resolveAdapterOptsForTask(resolvedFor('opencode'), { reasoning: 'low' });
    assert.equal(variant(opencodeAdapter.args('p', explicit)), 'provider-custom',
      'the established raw environment override must win and pass through verbatim');
  });
});
