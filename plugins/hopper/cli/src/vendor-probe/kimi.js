// kimi vendor probe — Kimi Code provider JSON first, config-file fallback
// Anchor: cli/src/vendor-probe/kimi.js
//
// Kimi Code 0.14 added `kimi provider list --json`, which returns the
// configured providers/models passable to `-m`. Older/missing installs fall
// back to reading `[models."NAME"]` blocks from ~/.kimi-code/config.toml
// ($KIMI_CODE_HOME override), then legacy ~/.kimi/config.{toml,json}.

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCommandOnPath } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';

const PROBE_TIMEOUT_MS = 15_000;
const IS_WINDOWS = process.platform === 'win32';

/**
 * P1-fix: pure parser exposed for static-fixture tests. Returns
 * { models: string[], modelsCaps: [{ name, caps: string[] }] }.
 * Handles bare (`[models.default]`) and TOML-quoted (`[models."foo/bar"]`) keys.
 *
 * R2-P2: section regex now tolerates `]` inside TOML-quoted keys. A key
 * like `[models."a.b+key[1]"]` is matched as a single quoted segment
 * instead of being truncated at the first `]`.
 */
export function parseKimiTomlConfig(content) {
  // Section key segment: TOML basic string ("..."), TOML literal string ('...'),
  // or a bare key (no quotes, no whitespace, no `]`, no `.`).
  const sectionRe = /^\[models\.((?:"[^"]*"|'[^']*'|[^\].\s]+))\]/gm;
  const names = [];
  let m;
  while ((m = sectionRe.exec(content)) !== null) {
    let name = m[1].trim();
    if ((name.startsWith('"') && name.endsWith('"')) ||
        (name.startsWith("'") && name.endsWith("'"))) {
      name = name.slice(1, -1);
    }
    names.push(name);
  }
  const modelsCaps = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerRe = new RegExp(`^\\[models\\.(?:"${escaped}"|'${escaped}'|${escaped})\\]`, 'm');
    const m2 = content.match(headerRe);
    if (!m2) continue;
    const sectionStart = m2.index;
    const sectionEnd = content.indexOf('\n[', sectionStart + 1);
    const section = content.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);
    const capMatch = section.match(/capabilities\s*=\s*\[([^\]]*)\]/);
    if (capMatch) {
      const caps = capMatch[1].split(',').map((s) => s.trim().replace(/["']/g, '')).filter(Boolean);
      modelsCaps.push({ name, caps });
    }
  }
  return { models: names, modelsCaps };
}

/**
 * Parse `kimi provider list --json` output. Kimi may write unrelated warnings
 * to stderr; if a caller accidentally passes merged output, trim to the first
 * JSON object defensively.
 */
export function parseKimiProviderListJson(stdout) {
  const json = extractJsonObject(stdout);
  const parsed = JSON.parse(json);
  const modelsTable = parsed && parsed.models && typeof parsed.models === 'object'
    ? parsed.models
    : {};
  const providersTable = parsed && parsed.providers && typeof parsed.providers === 'object'
    ? parsed.providers
    : {};

  const models = [];
  const modelsCaps = [];
  for (const [name, meta] of Object.entries(modelsTable)) {
    models.push(name);
    if (meta && Array.isArray(meta.capabilities)) {
      modelsCaps.push({ name, caps: meta.capabilities.filter((c) => typeof c === 'string') });
    }
  }
  return {
    models,
    modelsCaps,
    providers: Object.keys(providersTable),
  };
}

function extractJsonObject(text) {
  const s = String(text || '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON object found');
  }
  return s.slice(start, end + 1);
}

function runOnce(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: !IS_WINDOWS,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => { timedOut = true; killProcessTree(child.pid, IS_WINDOWS); }, PROBE_TIMEOUT_MS);
    timer.unref();
    child.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: code ?? 1, stdout, stderr, timedOut }); });
    child.on('error', () => { clearTimeout(timer); resolve({ exitCode: 127, stdout, stderr, timedOut: false }); });
  });
}

export async function probe() {
  const t0 = Date.now();
  const notes = [];

  const resolved = resolveCommandOnPath('kimi');
  const binaryPath = resolved && resolved.resolvedPath ? resolved.resolvedPath : null;
  let version = null;
  let providerListFailed = false;

  if (resolved && resolved.resolvedPath) {
    const cmd = resolved.command;
    const prepend = resolved.prependArgs;

    const verResult = await runOnce(cmd, [...prepend, '--version']);
    if (verResult.exitCode === 0 && verResult.stdout) {
      const m = verResult.stdout.match(/[\d]+\.[\d]+\.[\d]+/);
      if (m) version = m[0];
    } else if (verResult.timedOut) {
      notes.push('kimi --version timed out');
    }

    const providerResult = await runOnce(cmd, [...prepend, 'provider', 'list', '--json']);
    if (providerResult.exitCode === 0 && providerResult.stdout.trim()) {
      try {
        const parsed = parseKimiProviderListJson(providerResult.stdout);
        const modelsCaps = parsed.modelsCaps;
        if (modelsCaps.length > 0) {
          const capNotes = modelsCaps.map(({ name, caps }) => `${name}: [${caps.join(', ')}]`);
          notes.push(`Per-model capabilities: ${capNotes.join(' | ').slice(0, 400)}`);
        }
        if (parsed.providers.length > 0) {
          notes.push(`Configured providers: ${parsed.providers.join(', ').slice(0, 300)}`);
        }
        return {
          introspection_supported: 'partial',
          binary_path: binaryPath,
          version,
          models: parsed.models,
          models_source: 'kimi provider list --json (configured aliases)',
          reasoning_levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          notes,
          duration_ms: Date.now() - t0,
        };
      } catch (err) {
        providerListFailed = true;
        notes.push(`kimi provider list JSON parse failed: ${err.message}`);
      }
    } else if (providerResult.timedOut) {
      providerListFailed = true;
      notes.push('kimi provider list --json timed out; falling back to config file');
    } else {
      providerListFailed = true;
      notes.push(`kimi provider list --json exited ${providerResult.exitCode}; stderr: ${providerResult.stderr.slice(0, 200)}; falling back to config file`);
    }
  } else {
    notes.push('kimi binary not found on PATH; falling back to config file');
  }

  // Parse config-file for [models.NAME] block keys.
  // New Kimi Code 0.x path first (TOML-only, $KIMI_CODE_HOME override), then
  // legacy ~/.kimi/ (Python kimi-cli 1.x) as fallback.
  const codeHome = process.env.KIMI_CODE_HOME || join(homedir(), '.kimi-code');
  const candidates = [
    { path: join(codeHome, 'config.toml'), format: 'toml' },
    { path: join(homedir(), '.kimi', 'config.toml'), format: 'toml' },
    { path: join(homedir(), '.kimi', 'config.json'), format: 'json' },
  ];

  let models = [];
  let modelsSource = '';
  let modelsCaps = [];   // capability flags per model (thinking | always_thinking)

  for (const { path, format } of candidates) {
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf-8');
      if (format === 'toml') {
        const parsed = parseKimiTomlConfig(content);
        models = parsed.models;
        modelsCaps.push(...parsed.modelsCaps);
        modelsSource = `${path} (${parsed.models.length} [models.X] block(s))`;
      } else {
        // JSON variant
        const parsed = JSON.parse(content);
        if (parsed.models && typeof parsed.models === 'object') {
          models = Object.keys(parsed.models);
          for (const name of models) {
            const block = parsed.models[name];
            if (block && Array.isArray(block.capabilities)) {
              modelsCaps.push({ name, caps: block.capabilities });
            }
          }
          modelsSource = `${path} (${models.length} models entry/entries)`;
        }
      }
      break;
    } catch (err) {
      notes.push(`failed to parse ${path}: ${err.message}`);
    }
  }

  if (models.length === 0 && notes.length === 0) {
    notes.push('No ~/.kimi-code/config.toml (or $KIMI_CODE_HOME / legacy ~/.kimi/config.{toml,json}) found OR no [models.NAME] blocks defined. Run `kimi` then `/login`, or define aliases.');
    modelsSource = 'no config file';
  } else if (models.length === 0) {
    notes.push('No configured Kimi model aliases found in config fallback. Run `kimi provider list --json` or `kimi` then `/login` to refresh Kimi Code configuration.');
    modelsSource = modelsSource || 'no config file';
  }

  // Capability summary as notes
  if (modelsCaps.length > 0) {
    const capNotes = modelsCaps.map(({ name, caps }) => `${name}: [${caps.join(', ')}]`);
    notes.push(`Per-model capabilities: ${capNotes.join(' | ').slice(0, 400)}`);
  }

  return {
    introspection_supported: 'config-only',
    binary_path: binaryPath,
    version,
    models,
    models_source: providerListFailed && modelsSource ? `${modelsSource} (fallback)` : modelsSource,
    // Kimi Code 0.x: reasoning is config-driven [thinking].effort (no argv flag).
    // Effort enum (CONFIRMED via binary); mode is auto|on|off, default_thinking bool.
    reasoning_levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    notes,
    duration_ms: Date.now() - t0,
  };
}
