import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { runSubprocessOnce } from '../../cli/src/subprocess.js';

const macOnly = platform() !== 'darwin' ? 'sandbox-exec subject guard is macOS-only' : false;

async function guardedNode(subjectRoot, source) {
  return runSubprocessOnce({
    command: process.execPath,
    args: ['-e', source],
    stdinInput: null,
    timeoutMs: 10_000,
    subjectRoot,
    sandbox: 'read-only',
  });
}

test('sandbox-exec subject root allows reads, subject-external writes, and loopback network with special path characters', { skip: macOnly }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper subject ("quoted")-'));
  const subject = join(tmp, 'project with spaces');
  const outside = join(tmp, 'outside.txt');
  const inside = join(subject, 'read.txt');
  try {
    mkdirSync(subject);
    writeFileSync(inside, 'readable');
    const server = createServer((_req, res) => res.end('loopback-ok'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      const source = `
        const fs = require('node:fs');
        const http = require('node:http');
        if (fs.readFileSync(${JSON.stringify(inside)}, 'utf8') !== 'readable') process.exit(10);
        fs.writeFileSync(${JSON.stringify(outside)}, 'outside-ok');
        http.get('http://127.0.0.1:${port}', (r) => { let s=''; r.on('data', c => s += c); r.on('end', () => process.exit(s === 'loopback-ok' ? 0 : 11)); }).on('error', () => process.exit(12));
      `;
      const result = await guardedNode(subject, source);
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(readFileSync(outside, 'utf8'), 'outside-ok');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('sandbox-exec subject root denies create, overwrite, delete, and rename', { skip: macOnly }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-subject-deny-'));
  const subject = join(tmp, 'subject');
  try {
    mkdirSync(subject);
    const existing = join(subject, 'existing.txt');
    const renamed = join(subject, 'renamed.txt');
    writeFileSync(existing, 'original');
    const attempts = [
      `require('node:fs').writeFileSync(${JSON.stringify(join(subject, 'created.txt'))}, 'x')`,
      `require('node:fs').writeFileSync(${JSON.stringify(existing)}, 'overwritten')`,
      `require('node:fs').unlinkSync(${JSON.stringify(existing)})`,
      `require('node:fs').renameSync(${JSON.stringify(existing)}, ${JSON.stringify(renamed)})`,
    ];
    for (const source of attempts) {
      const result = await guardedNode(subject, source);
      assert.notEqual(result.exitCode, 0, `operation unexpectedly succeeded: ${source}`);
    }
    assert.equal(readFileSync(existing, 'utf8'), 'original');
    assert.equal(existsSync(renamed), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('sandbox-exec subject root denies linking a subject file to an external alias', { skip: macOnly }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-subject-hard-link-'));
  const subject = join(tmp, 'subject');
  try {
    mkdirSync(subject);
    const original = join(subject, 'original.txt');
    const alias = join(tmp, 'external-alias.txt');
    writeFileSync(original, 'original');
    const result = await guardedNode(subject, `require('node:fs').linkSync(${JSON.stringify(original)}, ${JSON.stringify(alias)})`);
    assert.notEqual(result.exitCode, 0, `hard-link creation unexpectedly succeeded: ${result.stderr}`);
    assert.equal(existsSync(alias), false, 'a denied link must not leave an external alias behind');
    assert.equal(readFileSync(original, 'utf8'), 'original', 'the protected source must remain unchanged');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('sandbox-exec subject root is inherited by a vendor child process', { skip: macOnly }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-subject-child-'));
  const subject = join(tmp, 'subject');
  try {
    mkdirSync(subject);
    const blocked = join(subject, 'child-write.txt');
    const source = `
      const { spawnSync } = require('node:child_process');
      const child = spawnSync(process.execPath, ['-e', ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(blocked)}, 'no')`)}]);
      process.exit(child.status === 0 ? 20 : 0);
    `;
    const result = await guardedNode(subject, source);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(existsSync(blocked), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
