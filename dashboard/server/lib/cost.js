import { readFile } from 'node:fs/promises';

export async function parseCostLog(filePath) {
  let content = '';
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return parseCostLogContent(content);
}

export function parseCostLogContent(content) {
  const rows = [];
  let header = null;
  let separatorSeen = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) {
      header = null;
      separatorSeen = false;
      continue;
    }

    const cells = parseRowCells(line);
    if (!header) {
      const mapped = mapCostColumns(cells);
      header = mapped.isCostTable ? mapped : null;
      separatorSeen = false;
      continue;
    }

    if (!separatorSeen) {
      separatorSeen = cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
      if (!separatorSeen) header = null;
      continue;
    }

    const row = extractCostRow(cells, header);
    if (row) rows.push(row);
  }

  return {
    rows,
    totals: summarizeRows(rows),
    byVendor: summarizeByVendor(rows),
  };
}

function parseRowCells(line) {
  const trimmed = line.replace(/^\|/, '').replace(/\|\s*$/, '');
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const ch of trimmed) {
    if (escaped) {
      cell += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function mapCostColumns(cells) {
  const normalized = cells.map((cell) => cell.toLowerCase().replace(/\s+/g, ' ').trim());
  const map = {
    date: indexOf(normalized, ['date']),
    task: indexOf(normalized, ['task', 'trigger']),
    role: indexOf(normalized, ['role', 'task-type', 'task type']),
    model: indexOf(normalized, ['model']),
    tokensInOut: indexOf(normalized, ['tokens in/out', 'tokens']),
    approxUsd: indexOf(normalized, ['approx $', 'approx usd', 'cost']),
    tier: indexOf(normalized, ['tier']),
    notes: indexOf(normalized, ['notes']),
  };
  return {
    ...map,
    isCostTable: map.date != null && map.task != null && map.model != null && map.approxUsd != null,
  };
}

function indexOf(cells, names) {
  for (const name of names) {
    const idx = cells.indexOf(name);
    if (idx !== -1) return idx;
  }
  return null;
}

function extractCostRow(cells, map) {
  const date = getCell(cells, map.date);
  const task = getCell(cells, map.task);
  const model = getCell(cells, map.model);
  if (!date || !task || !model) return null;

  const tokens = parseTokens(getCell(cells, map.tokensInOut));
  return {
    date,
    task,
    role: getCell(cells, map.role),
    model,
    vendor: inferVendor(model),
    tokensIn: tokens.tokensIn,
    tokensOut: tokens.tokensOut,
    approxUsd: parseUsd(getCell(cells, map.approxUsd)),
    tier: getCell(cells, map.tier),
    notes: getCell(cells, map.notes),
  };
}

function getCell(cells, idx) {
  return idx == null ? '' : (cells[idx] || '').trim();
}

function parseTokens(value) {
  const normalized = value.replace(/,/g, '').replace(/~/g, '');
  if (normalized.includes('/')) {
    const [input, output] = normalized.split('/');
    return { tokensIn: parseInteger(input), tokensOut: parseInteger(output) };
  }
  return { tokensIn: parseInteger(normalized), tokensOut: 0 };
}

function parseInteger(value) {
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function parseUsd(value) {
  const match = value.replace(/,/g, '').match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function summarizeRows(rows) {
  return rows.reduce(
    (acc, row) => ({
      rows: acc.rows + 1,
      tokensIn: acc.tokensIn + row.tokensIn,
      tokensOut: acc.tokensOut + row.tokensOut,
      approxUsd: roundUsd(acc.approxUsd + row.approxUsd),
    }),
    { rows: 0, tokensIn: 0, tokensOut: 0, approxUsd: 0 },
  );
}

function summarizeByVendor(rows) {
  const groups = new Map();
  for (const row of rows) {
    const current = groups.get(row.vendor) || { vendor: row.vendor, tokensIn: 0, tokensOut: 0, approxUsd: 0, count: 0 };
    current.tokensIn += row.tokensIn;
    current.tokensOut += row.tokensOut;
    current.approxUsd = roundUsd(current.approxUsd + row.approxUsd);
    current.count += 1;
    groups.set(row.vendor, current);
  }
  return [...groups.values()].sort((a, b) => b.approxUsd - a.approxUsd || b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut) || a.vendor.localeCompare(b.vendor));
}

function inferVendor(model) {
  const lower = model.toLowerCase();
  const via = lower.match(/via\s+([a-z0-9_-]+)/);
  if (via) return cleanVendor(via[1]);
  const known = ['codex', 'kimi', 'opencode', 'copilot', 'agy', 'grok', 'claude', 'deepseek', 'gemini'];
  const match = known.find((prefix) => lower.startsWith(prefix));
  if (match) return match;
  return cleanVendor(lower.split(/\s|-/)[0] || 'unknown');
}

function cleanVendor(value) {
  const cleaned = value.replace(/[^a-z0-9_-]/g, '');
  return cleaned.length >= 3 ? cleaned : 'unknown';
}

function roundUsd(value) {
  return Math.round(value * 10000) / 10000;
}
