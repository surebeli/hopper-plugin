// kimi vendor probe — config-file-only (ZERO subprocess spawn)
// Anchor: cli/src/vendor-probe/kimi.js
//
// Per Phase 6b research: kimi has NO `kimi models` introspection command.
// `~/.kimi/config.{toml,json}` is the authoritative source — `[models.NAME]`
// blocks define the aliases user can pass to `-m`. We read the file directly.

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
  // Try TOML first (canonical), then JSON variant.
  const candidates = [
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
        modelsSource = `~/.kimi/config.toml (${parsed.models.length} [models.X] block(s))`;
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
          modelsSource = `~/.kimi/config.json (${models.length} models entry/entries)`;
        }
      }
      break;
    } catch (err) {
      notes.push(`failed to parse ${path}: ${err.message}`);
    }
  }

  if (models.length === 0 && notes.length === 0) {
    notes.push('No ~/.kimi/config.{toml,json} found OR no [models.NAME] blocks defined. Run `kimi login` or define aliases.');
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
    // Kimi reasoning is binary toggle (--thinking / --no-thinking), not an enum
    reasoning_levels: ['--thinking', '--no-thinking'],
    notes,
    duration_ms: Date.now() - t0,
  };
}
