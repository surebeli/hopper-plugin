import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ansiToHtml, createAnsiState } from '@/lib/ansi';

interface LogChunk {
  offset: number;
  nextOffset: number;
  chunk: string;
}

const MAX_LINES = 10000;

export function LiveLog({ id }: { id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const ansiRef = useRef(createAnsiState());
  const reconnectRef = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [follow, setFollow] = useState(true);
  const [state, setState] = useState('connecting');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !id) return undefined;
    container.textContent = '';
    lineRef.current = null;
    offsetRef.current = 0;
    ansiRef.current = createAnsiState();
    setFollow(true);
    let closed = false;
    let source: EventSource | null = null;

    const connect = () => {
      setState('connecting');
      source = new EventSource(`/events/log/${encodeURIComponent(id)}?offset=${offsetRef.current}`);
      source.onopen = () => setState('live');
      source.onerror = () => {
        source?.close();
        if (!closed && reconnectRef.current == null) {
          reconnectRef.current = window.setTimeout(() => {
            reconnectRef.current = null;
            connect();
          }, 500);
        }
        setState('retrying');
      };
      source.addEventListener('log', (event) => {
        try {
          const payload = JSON.parse(event.data) as LogChunk;
          if (payload.nextOffset <= offsetRef.current) return;
          appendChunk(container, lineRef, ansiRef.current, payload.chunk);
          offsetRef.current = payload.nextOffset;
          setOffset(payload.nextOffset);
        } catch (err) {
          console.warn(`[LiveLog] parse error on ${id}:`, err);
        }
      });
    };

    connect();
    return () => {
      closed = true;
      source?.close();
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    };
  }, [id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 items-center justify-between border-b border-border px-3 font-mono text-xs text-muted-foreground">
        <span>offset {offset}</span>
        <span>{follow ? 'follow' : 'locked'} · {state}</span>
      </div>
      <div
        ref={containerRef}
        aria-label="live log"
        className="min-h-0 flex-1 overflow-auto bg-background p-3 font-mono text-xs leading-5 text-foreground"
        onScroll={(event) => {
          const nextFollow = isNearBottom(event.currentTarget);
          setFollow(nextFollow);
        }}
        role="log"
        tabIndex={0}
        data-follow={follow}
        data-offset={offset}
        data-state={state}
        data-testid="live-log"
        data-line-cap={MAX_LINES}
        data-scroll-lock={!follow}
      />
    </div>
  );
}

function appendChunk(
  container: HTMLDivElement,
  lineRef: MutableRefObject<HTMLDivElement | null>,
  ansiState: ReturnType<typeof createAnsiState>,
  chunk: string,
) {
  const shouldFollow = isNearBottom(container);
  const normalized = chunk.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n');
  parts.forEach((part, index) => {
    if (!lineRef.current) lineRef.current = appendLine(container);
    lineRef.current.insertAdjacentHTML('beforeend', ansiToHtml(part, ansiState));
    if (index < parts.length - 1) lineRef.current = appendLine(container);
  });
  while (container.childElementCount > MAX_LINES) container.firstElementChild?.remove();
  if (shouldFollow) container.scrollTop = container.scrollHeight;
}

function appendLine(container: HTMLDivElement) {
  const line = document.createElement('div');
  line.className = 'min-h-5 whitespace-pre-wrap break-words';
  container.appendChild(line);
  return line;
}

function isNearBottom(container: HTMLDivElement) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 24;
}
