import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTaskProgress, queryKeys } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import { cn } from '@/lib/utils';
import type { ProgressEvent, TaskProgressResponse } from '@/lib/types';

const MAX_ROWS = 5;
const MAX_EVENTS = 50;
const MESSAGE_LIMIT = 120;

export function ProgressTimeline({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.taskProgress(id),
    queryFn: () => fetchTaskProgress(id, MAX_EVENTS),
    enabled: Boolean(id),
  });

  useSSE<{ events: ProgressEvent[] }>(`/events/progress/${id}`, (payload) => {
    if (!payload?.events?.length) return;
    queryClient.setQueryData(queryKeys.taskProgress(id), (prev: TaskProgressResponse | undefined) => (
      mergeProgressEvents(id, prev, payload.events)
    ));
  }, { enabled: Boolean(id) });

  if (isLoading) return <div className="p-3 font-mono text-sm text-muted-foreground">[··· ] loading progress</div>;
  if (isError) return <div className="p-3 font-mono text-sm text-destructive">progress request failed</div>;
  return <ProgressTimelineRows events={(data?.events || []).slice(-MAX_EVENTS)} />;
}

export function ProgressTimelineRows({ events }: { events: ProgressEvent[] }) {
  const rows = useMemo(() => prepareProgressRows(events), [events]);
  if (!rows.length) {
    return <div className="p-3 font-mono text-sm text-muted-foreground">[··· ] no progress events</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background p-3 font-mono text-xs leading-5">
      {rows.map((event) => (
        <ProgressEventRow key={`${event.seq}-${event.ts}`} event={event} />
      ))}
    </div>
  );
}

export function mergeProgressEvents(
  id: string,
  prev: TaskProgressResponse | undefined,
  incoming: ProgressEvent[],
): TaskProgressResponse {
  const seen = new Map<number, ProgressEvent>();
  for (const event of [...(prev?.events || []), ...incoming]) seen.set(event.seq, event);
  return {
    id,
    events: [...seen.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENTS),
  };
}

export function prepareProgressRows(events: ProgressEvent[]) {
  const terminal = [...events].reverse().find((event) => event.terminal);
  const newest = [...events].reverse();
  const rows: ProgressEvent[] = [];
  if (terminal) rows.push(terminal);
  for (const event of newest) {
    if (rows.length >= MAX_ROWS) break;
    if (terminal && event.seq === terminal.seq && event.ts === terminal.ts) continue;
    rows.push(event);
  }
  return rows;
}

function ProgressEventRow({ event }: { event: ProgressEvent }) {
  const message = truncate(event.message, MESSAGE_LIMIT);
  const metadata = formatMetadata(event);

  return (
    <div
      className={cn(
        'grid grid-cols-[48px_72px_112px_minmax(0,1fr)] items-start gap-2 border-b border-border py-1.5 text-foreground',
        event.terminal && 'border-l-2 border-l-primary pl-2 text-primary',
      )}
      data-progress-row={event.seq}
    >
      <span className="text-muted-foreground">#{event.seq}</span>
      <span className="text-muted-foreground" title={event.ts}>{relativeTime(event.ts)}</span>
      <span>{event.phase}/{event.kind}</span>
      <span className="min-w-0">
        <span className="block truncate" title={event.message}>{message}</span>
        {metadata ? <span className="block truncate text-muted-foreground">{metadata}</span> : null}
      </span>
    </div>
  );
}

function formatMetadata(event: ProgressEvent) {
  const fields = [];
  if (event.status !== undefined) fields.push(`status=${event.status}`);
  if (event.exit_code !== undefined) fields.push(`exit_code=${event.exit_code}`);
  if (event.duration_ms !== undefined) fields.push(`duration_ms=${event.duration_ms}`);
  if (event.adapter_status !== undefined) fields.push(`adapter_status=${event.adapter_status}`);
  if (event.timed_out !== undefined && event.timed_out !== null) fields.push(`timed_out=${event.timed_out}`);
  return fields.join(' ');
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export function relativeTime(ts: string) {
  const time = Date.parse(ts);
  if (!Number.isFinite(time)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
