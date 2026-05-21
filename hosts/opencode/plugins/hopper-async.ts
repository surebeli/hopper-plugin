// hopper-async — OpenCode plugin for Tier C #2 native async dispatch
// Anchor: hosts/opencode/plugins/hopper-async.ts
//
// Per spec v2.1.0 §14.9: OpenCode is the strongest host for native async
// because it exposes POST /session/:id/prompt_async + plugin lifecycle
// hooks (session.idle, session.error). This plugin uses both.
//
// Pattern modeled on kdcokenny/opencode-background-agents (validated
// production precedent for plugin-driven fire-and-forget dispatch).
//
// What this plugin does:
//   1. Registers a `hopper_dispatch` tool that an OpenCode model can call
//   2. Tool creates an isolated session, posts the dispatch prompt via
//      prompt_async (returns immediately), and registers a session.idle
//      callback
//   3. When session.idle fires, plugin reads the transcript, writes
//      .hopper/handoffs/<task-id>-output.md frontmatter (status flipping
//      to done/failed) + sidecar .log with raw transcript
//
// Single-spawn invariant (spec §3 #4 + §14.6) preserved: the plugin invokes
// opencode's session ONCE per dispatch; opencode runs the prompt ONCE;
// no retry, no fallback.
//
// Installation: place this file under .opencode/plugins/ or reference it
// via opencode.json `plugins` field. Requires `opencode serve` running for
// the prompt_async + idle hook mechanism to work.
//
// Falls back gracefully: if `opencode serve` is not running OR the plugin
// can't reach the SDK, the dispatcher CLI's own --background flag (via
// hopper-runner) remains available — but this plugin path is the native-
// preferred route per spec §14.4 constraint #4.

import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

interface PluginContext {
  client: any;     // OpenCode SDK client (talks to opencode serve)
  project: { directory: string };
  $: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  directory: string;
}

interface ToolArgs {
  taskId: string;
  // Per codex Phase 5 audit F4: hopperDir tool-arg REMOVED. The plugin now
  // derives hopperDir exclusively from the project context (or HOPPER_DIR
  // env), which is set before plugin load. Accepting it as a tool arg let
  // a model put `/anywhere/with/.hopper` and the plugin would write there.
  adapterArgv?: string[];
  systemPrompt?: string;
}

/**
 * Minimal frontmatter writer matching cli/src/background.js semantics.
 * Duplicated here so the plugin can run without importing dispatcher code
 * (OpenCode plugins are sandboxed to their own module space).
 */
function writeFrontmatter(path: string, fm: Record<string, any>): void {
  const { _body = '', ...rest } = fm;
  const lines: string[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    let emitted: string;
    if (v === null) emitted = 'null';
    else if (typeof v === 'boolean') emitted = v ? 'true' : 'false';
    else if (typeof v === 'number') emitted = String(v);
    else {
      const s = String(v);
      if (/[:#\n\r]|^\s|\s$|^(?:true|false|null|~)$|^-?\d+$/.test(s)) {
        emitted = `"${s.replace(/"/g, '\\"')}"`;
      } else {
        emitted = s;
      }
    }
    lines.push(`${k}: ${emitted}`);
  }
  const out = `---\n${lines.join('\n')}\n---\n${_body}`;
  // Per codex Phase 5 audit P1 #4: unique tmp filename per writer to prevent
  // concurrent clobber. Mirrors cli/src/background.js semantics.
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, out, 'utf-8');
  renameSync(tmp, path);
}

const TASK_ID_RE = /^[A-Za-z][A-Za-z0-9._-]{0,99}$/;

/**
 * OpenCode plugin entry point. Receives the plugin context, returns hook
 * handlers + tools.
 */
export default async function hopperAsync(ctx: PluginContext) {
  const { client, project, directory } = ctx;
  const hopperDir = process.env.HOPPER_DIR || join(project?.directory || directory, '.hopper');
  const handoffDir = join(hopperDir, 'handoffs');

  // Track active dispatches by OpenCode session ID → output paths
  const active = new Map<string, { taskId: string; outputMdPath: string; logPath: string; startTime: string }>();

  // ─── tool: hopper_dispatch ─────────────────────────────────────────

  const hopperDispatchTool = {
    name: 'hopper_dispatch',
    description: 'Dispatch a hopper task via OpenCode native async (EXPERIMENTAL — see plugin README §14.9 + Phase 5 F5: this path bypasses dispatcher resolveDispatch / task-frames / heterogeneous-only warning; for parity, use Tier A `hopper-dispatch --background`).',
    args: {
      taskId: { type: 'string', description: 'Task ID from .hopper/queue.md. Must match ^[A-Za-z][A-Za-z0-9._-]{0,99}$ and not contain "..".' },
      systemPrompt: { type: 'string', optional: true, description: 'System prompt to set for the dispatched session' },
      // Per codex Phase 5 audit F4: hopperDir REMOVED — derived from project context only.
    },
    async execute(args: ToolArgs) {
      const { taskId } = args;

      if (!TASK_ID_RE.test(taskId)) {
        throw new Error(`hopper_dispatch: task-id "${taskId}" contains unsafe characters (^[A-Za-z][A-Za-z0-9._-]{0,99}$)`);
      }
      if (taskId.includes('..')) {
        throw new Error(`hopper_dispatch: task-id "${taskId}" contains '..' (path traversal)`);
      }

      // Per codex Phase 5 audit F4: hopperDir is ALWAYS derived from project
      // context — tool arg removed. The closure-bound `hopperDir` is set at
      // plugin load from HOPPER_DIR env OR project.directory/.hopper.
      const taskHopperDir = hopperDir;
      mkdirSync(join(taskHopperDir, 'handoffs'), { recursive: true });
      const outputMdPath = join(taskHopperDir, 'handoffs', `${taskId}-output.md`);
      const logPath = outputMdPath.replace(/\.md$/, '.log');
      const startTime = new Date().toISOString();

      // Preflight: refuse if already in-progress
      if (existsSync(outputMdPath)) {
        const content = readFileSync(outputMdPath, 'utf-8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const statusMatch = fmMatch[1].match(/^status:\s*(\S+)/m);
          if (statusMatch && statusMatch[1] === 'in-progress') {
            throw new Error(`hopper_dispatch: ${taskId} is already in-progress. Run --reap if stale.`);
          }
        }
      }

      // Seed frontmatter
      writeFrontmatter(outputMdPath, {
        task_id: taskId,
        adapter: 'opencode',
        status: 'in-progress',
        pid: null,
        start_time: startTime,
        end_time: null,
        exit_code: null,
        duration_ms: null,
        mode: 'background',
        host_native: 'opencode',
        session_id: null,
        log: `./${basename(logPath)}`,
        _body: `\n# ${taskId} — opencode (background, in-progress)\n\n` +
               `Started via OpenCode plugin hopper-async. ` +
               `Output streaming to \`${basename(logPath)}\`.\n`,
      });

      // Create new isolated session via OpenCode SDK
      const session = await client.session.create({ title: `hopper:${taskId}` });
      if (!session?.id) {
        throw new Error('hopper_dispatch: could not create OpenCode session');
      }

      // Update frontmatter with session ID
      const seedContent = readFileSync(outputMdPath, 'utf-8');
      const seedMatch = seedContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (seedMatch) {
        // Patch session_id in
        const newFm = seedMatch[1].replace(/^session_id:.*$/m, `session_id: ${session.id}`);
        writeFileSync(outputMdPath, `---\n${newFm}\n---\n${seedMatch[2]}`, 'utf-8');
      }

      // Track for session.idle hook
      active.set(session.id, { taskId, outputMdPath, logPath, startTime });

      // Fire prompt_async — returns 204 immediately
      const promptText = args.systemPrompt
        ? `${args.systemPrompt}\n\n---\n\nTask: ${taskId}`
        : `Execute hopper task ${taskId}. See .hopper/handoffs/leader-tasklist.md for spec.`;

      await client.session.prompt_async({
        sessionId: session.id,
        message: { content: promptText },
      });

      return {
        task_id: taskId,
        opencode_session_id: session.id,
        output_md: outputMdPath,
        status: 'dispatched',
        message: `Dispatched in background. Status will flip when session.idle fires.`,
      };
    },
  };

  // ─── hooks: session.idle + session.error ───────────────────────────

  async function onSessionIdle(event: { sessionId: string }) {
    const tracked = active.get(event.sessionId);
    if (!tracked) return; // not one of ours

    const { taskId, outputMdPath, logPath, startTime } = tracked;
    const endTime = new Date().toISOString();
    const duration_ms = Date.parse(endTime) - Date.parse(startTime);

    // Read session transcript via SDK
    let transcript = '';
    let status = 'done';
    let exitCode = 0;
    try {
      const messages = await client.session.messages({ sessionId: event.sessionId });
      transcript = messages.map((m: any) => `[${m.role}]\n${m.content}\n`).join('\n---\n');
      // Best-effort failure detection: if no assistant messages, treat as failed
      if (!messages.some((m: any) => m.role === 'assistant')) {
        status = 'failed';
        exitCode = 1;
      }
    } catch (err) {
      transcript = `Error reading session: ${err instanceof Error ? err.message : String(err)}`;
      status = 'failed';
      exitCode = 1;
    }

    // Write log sidecar
    writeFileSync(logPath, transcript, 'utf-8');

    // Update frontmatter atomically
    const content = readFileSync(outputMdPath, 'utf-8');
    const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    let body = '';
    let existingFm: Record<string, any> = {};
    if (m) {
      body = m[2];
      for (const line of m[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          existingFm[k] = v;
        }
      }
    }

    writeFrontmatter(outputMdPath, {
      ...existingFm,
      status,
      end_time: endTime,
      exit_code: exitCode,
      duration_ms,
      _body: body +
        `\n## Status (opencode session.idle)\n` +
        `- exit_code: ${exitCode}\n` +
        `- duration_ms: ${duration_ms}\n` +
        `- end_time: ${endTime}\n` +
        `- transcript: see \`${basename(logPath)}\`\n`,
    });

    active.delete(event.sessionId);
  }

  async function onSessionError(event: { sessionId: string; error: any }) {
    const tracked = active.get(event.sessionId);
    if (!tracked) return;

    const { outputMdPath, logPath, startTime } = tracked;
    const endTime = new Date().toISOString();
    const duration_ms = Date.parse(endTime) - Date.parse(startTime);
    const errMsg = event.error?.message || String(event.error || 'unknown error');

    writeFileSync(logPath, `OpenCode session error:\n${errMsg}\n`, 'utf-8');

    const content = existsSync(outputMdPath) ? readFileSync(outputMdPath, 'utf-8') : '';
    const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    let body = '';
    let existingFm: Record<string, any> = {};
    if (m) {
      body = m[2];
      for (const line of m[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) existingFm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }

    writeFrontmatter(outputMdPath, {
      ...existingFm,
      status: 'failed',
      end_time: endTime,
      exit_code: 1,
      duration_ms,
      _body: body + `\n## Failed (opencode session.error)\n${errMsg}\n`,
    });

    active.delete(event.sessionId);
  }

  return {
    tools: [hopperDispatchTool],
    hooks: {
      'session.idle': onSessionIdle,
      'session.error': onSessionError,
    },
  };
}
