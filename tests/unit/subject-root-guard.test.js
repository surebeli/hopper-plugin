import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SUBJECT_ROOT_SBPL,
  prepareSubjectRootGuard,
  validateSubjectRootArgument,
  wrapSubjectRootInvocation,
} from '../../cli/src/subject-root-guard.js';
import { runSubprocessOnce } from '../../cli/src/subprocess.js';

test('subject-root syntax requires an absolute control-character-free path', () => {
  assert.equal(validateSubjectRootArgument('/tmp/project'), '/tmp/project');
  for (const bad of ['', 'relative/project', '/tmp/a\u0000b', '/tmp/a\n']) {
    assert.throws(() => validateSubjectRootArgument(bad));
  }
});

test('subject-root guard uses a fixed profile and discrete argv parameters', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-subject-unit-'));
  const home = join(tmp, 'home');
  const subject = join(tmp, 'project');
  mkdirSync(home);
  mkdirSync(subject);
  try {
    const guard = prepareSubjectRootGuard({
      subjectRoot: subject,
      sandbox: 'read-only',
      platform: 'darwin',
      sandboxExecPath: '/fake/sandbox-exec',
      exists: () => true,
      home: () => home,
    });
    assert.equal(guard.command, '/fake/sandbox-exec');
    assert.equal(guard.prefixArgs[0], '-p');
    assert.equal(guard.prefixArgs[1], SUBJECT_ROOT_SBPL);
    assert.deepEqual(guard.prefixArgs.slice(2), ['-D', `SUBJECT_ROOT=${guard.subjectRoot}`]);
    const invocation = wrapSubjectRootInvocation('/fake/vendor', ['--safe', 'value'], guard);
    assert.deepEqual(invocation.args.slice(-3), ['/fake/vendor', '--safe', 'value']);
    assert.ok(!SUBJECT_ROOT_SBPL.includes(subject), 'path must not be interpolated into SBPL');
    assert.match(SUBJECT_ROOT_SBPL, /\(deny file-link \(literal \(param "SUBJECT_ROOT"\)\)\)/);
    assert.match(SUBJECT_ROOT_SBPL, /\(deny file-link \(subpath \(param "SUBJECT_ROOT"\)\)\)/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('subject-root fails closed for wrong sandbox, unsupported backend, broad roots, and missing paths', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-subject-invalid-'));
  const home = join(tmp, 'home');
  const subject = join(tmp, 'project');
  mkdirSync(home);
  mkdirSync(subject);
  try {
    assert.throws(() => prepareSubjectRootGuard({ subjectRoot: subject, sandbox: 'workspace-write', platform: 'darwin', exists: () => true }), /effective sandbox/);
    assert.throws(() => prepareSubjectRootGuard({ subjectRoot: subject, sandbox: 'read-only', platform: 'linux', exists: () => false }), /requires macOS/);
    assert.throws(() => prepareSubjectRootGuard({ subjectRoot: '/', sandbox: 'read-only', platform: 'darwin', exists: () => true }), /too broad/);
    assert.throws(() => prepareSubjectRootGuard({ subjectRoot: join(tmp, 'missing'), sandbox: 'read-only', platform: 'darwin', exists: () => true }), /resolve successfully/);
    assert.throws(() => prepareSubjectRootGuard({ subjectRoot: home, sandbox: 'read-only', platform: 'darwin', exists: () => true, home: () => home }), /too broad/);
    assert.throws(() => prepareSubjectRootGuard({
      subjectRoot: subject,
      sandbox: 'read-only',
      platform: 'darwin',
      exists: () => true,
      home: () => home,
      realpath: (value) => value === subject ? 'not-an-absolute-path' : home,
    }), /absolute path/);
    assert.throws(() => prepareSubjectRootGuard({
      subjectRoot: subject,
      sandbox: 'read-only',
      platform: 'darwin',
      exists: () => true,
      home: () => home,
      realpath: (value) => value === subject ? '/tmp/project\n' : home,
    }), /control characters/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('unsupported subject-root backend prevents the vendor spawn entirely', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-subject-no-spawn-'));
  const subject = join(tmp, 'project');
  const counter = join(tmp, 'counter');
  mkdirSync(subject);
  writeFileSync(counter, '0');
  try {
    await assert.rejects(() => runSubprocessOnce({
      command: process.execPath,
      args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(counter)}, '1')`],
      stdinInput: null,
      timeoutMs: 5_000,
      subjectRoot: subject,
      sandbox: 'read-only',
      subjectGuardOptions: { platform: 'linux', exists: () => false },
    }), /requires macOS/);
    assert.equal(readFileSync(counter, 'utf8'), '0');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
