// Tasks library loader (T-PLUGIN-03)
// Anchor: cli/src/tasks.js
//
// Loads .hopper/tasks/<task-type>.md frame files. Frames are the task-type
// prompt scaffolds that get composed with task spec at dispatch time.
//
// Per spec §3 #5 + USAGE-GUIDE §3.4: frames describe TASK SHAPE not AGENT IDENTITY.
// Per codex v2.0.3 audit: anti-persona check is enforced at framework level
// (see verifyFrameAntiPersona).

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { validateTaskType } from './validation.js';

/**
 * Load a task-type frame from .hopper/tasks/<task-type>.md.
 *
 * @param {string} hopperDir          Path to .hopper/ directory
 * @param {string} taskType           e.g. "code-impl"
 * @returns {Promise<string>}         Frame markdown content
 * @throws {Error} If frame file missing or empty
 */
export async function loadTaskFrame(hopperDir, taskType) {
  // Per codex final strict audit P1 (Category E security): taskType flows from
  // queue.md into a file path. Validate first to prevent ../escape attacks.
  validateTaskType(taskType);

  const framePath = join(hopperDir, 'tasks', `${taskType}.md`);

  // Belt-and-braces: also verify resolved path stays inside <hopperDir>/tasks/
  const tasksDir = join(hopperDir, 'tasks');
  const resolvedPath = resolve(framePath);
  const resolvedTasksDir = resolve(tasksDir);
  if (!resolvedPath.startsWith(resolvedTasksDir + sep) && resolvedPath !== resolvedTasksDir) {
    throw new Error(`loadTaskFrame: resolved path "${resolvedPath}" escapes tasks/ — refusing.`);
  }

  let content;
  try {
    content = await readFile(framePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Task-type frame not found: ${framePath}. Available frames: see .hopper/tasks/`);
    }
    throw err;
  }
  if (!content.trim()) {
    throw new Error(`Task-type frame empty: ${framePath}`);
  }
  return content;
}

/**
 * List all available task-type frames.
 *
 * @param {string} hopperDir
 * @returns {Promise<string[]>}       Task-type names (filenames without .md)
 */
export async function listTaskTypes(hopperDir) {
  const tasksDir = join(hopperDir, 'tasks');
  let entries;
  try {
    entries = await readdir(tasksDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3));
}

/**
 * Verify a frame is anti-persona-clean (no identity-claiming phrases).
 * Per spec §3 #5 verifier + codex v2.0.3 audit F3 fix (warning text rewritten
 * to NOT contain banned phrases, allowing this grep to actually work).
 *
 * @param {string} frameContent
 * @returns {{ ok: boolean, hits: string[] }}
 */
export function verifyFrameAntiPersona(frameContent) {
  const bannedPatterns = [
    /\byou are a\b/i,
    /\bact as\b/i,
    /\bthink like\b/i,
    /\bas the (critic|builder|leader|reviewer|architect|engineer)\b/i,
    /\bpretend to be\b/i,
    /\bpretend you('re| are)\b/i,
    /\bimpersonate\b/i,
  ];
  const hits = [];
  for (const pattern of bannedPatterns) {
    const match = frameContent.match(pattern);
    if (match) hits.push(match[0]);
  }
  return { ok: hits.length === 0, hits };
}

/**
 * Compose final dispatch prompt from frame + task spec.
 *
 * @param {string} frameContent       Output of loadTaskFrame
 * @param {string} taskSpec           Task spec section (from leader-tasklist.md or similar)
 * @returns {string}                  Composed prompt to send to vendor adapter
 */
export function composePrompt(frameContent, taskSpec) {
  return `${frameContent.trim()}\n\n---\n\n## Task spec\n\n${taskSpec.trim()}\n`;
}
