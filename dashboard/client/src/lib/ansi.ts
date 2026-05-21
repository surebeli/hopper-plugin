export interface AnsiState {
  className: string | null;
}

const ANSI = /\x1b\[([0-9;]*)m/g;

const colorClass: Record<number, string> = {
  30: 'text-muted-foreground',
  31: 'text-destructive',
  32: 'text-primary',
  33: 'text-warning',
  34: 'text-foreground',
  35: 'text-foreground',
  36: 'text-primary',
  37: 'text-foreground',
  90: 'text-muted-foreground',
  91: 'text-destructive',
  92: 'text-primary',
  93: 'text-warning',
  94: 'text-foreground',
  95: 'text-foreground',
  96: 'text-primary',
  97: 'text-foreground',
};

export function createAnsiState(): AnsiState {
  return { className: null };
}

export function ansiToHtml(input: string, state: AnsiState = createAnsiState()) {
  let output = '';
  let cursor = 0;
  for (const match of input.matchAll(ANSI)) {
    output += wrap(input.slice(cursor, match.index), state.className);
    applyCodes(match[1], state);
    cursor = match.index + match[0].length;
  }
  output += wrap(input.slice(cursor), state.className);
  return output;
}

function applyCodes(raw: string, state: AnsiState) {
  const codes = raw ? raw.split(';').map(Number) : [0];
  for (const code of codes) {
    if (code === 0 || code === 39) state.className = null;
    if (colorClass[code]) state.className = colorClass[code];
  }
}

function wrap(value: string, className: string | null) {
  const escaped = escapeHtml(value);
  if (!escaped) return '';
  return className ? `<span class="${className}">${escaped}</span>` : escaped;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
