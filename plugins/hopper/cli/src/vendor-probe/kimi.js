// kimi vendor probe — config-file-only (ZERO subprocess spawn)
// Anchor: cli/src/vendor-probe/kimi.js
//
// Kimi has NO `kimi models` introspection command; the config file is the
// authoritative source — `[models."NAME"]` blocks define the aliases passable
// to `-m`. T-KIMI-MIGRATE (2026-05-23): Kimi Code 0.x moved the config to
// ~/.kimi-code/config.toml (TOML-only, overridable via $KIMI_CODE_HOME); the
// legacy ~/.kimi/config.{toml,json} (Python kimi-cli 1.x) is now a fallback.
// We read the new path first, then fall back. Stays zero-spawn.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCommandOnPath } from '../path-resolve.js';

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

export async function probe() {
  const t0 = Date.now();
  const notes = [];

  const resolved = resolveCommandOnPath('kimi');
  const binaryPath = resolved && resolved.resolvedPath ? resolved.resolvedPath : null;

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
  }

  // Capability summary as notes
  if (modelsCaps.length > 0) {
    const capNotes = modelsCaps.map(({ name, caps }) => `${name}: [${caps.join(', ')}]`);
    notes.push(`Per-model capabilities: ${capNotes.join(' | ').slice(0, 400)}`);
  }

  return {
    introspection_supported: 'config-only',
    binary_path: binaryPath,
    version: null,  // kimi version requires subprocess; we keep this probe zero-spawn
    models,
    models_source: modelsSource,
    // Kimi Code 0.x: reasoning is config-driven [thinking].effort (no argv flag).
    // Effort enum (CONFIRMED via binary); mode is auto|on|off, default_thinking bool.
    reasoning_levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    notes,
    duration_ms: Date.now() - t0,
  };
}
