import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTaskProgress, queryKeys } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import { cn } from '@/lib/utils';
import type { ProgressEvent, TaskProgressResponse } from '@/lib/types';

const MAX_ROWS = 5;
const MAX_EVENTS = 50;

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
    <div role="list" aria-label="Progress timeline" className="min-h-0 flex-1 overflow-auto bg-background p-3 font-mono text-xs leading-5">
      {rows.map((event) => <ProgressEventRow key={event.seq} event={event} />)}
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
    if (terminal && event.seq === terminal.seq) continue;
    rows.push(event);
  }
  return rows;
}

const ProgressEventRow = React.memo(function ProgressEventRow({ event }: { event: ProgressEvent }) {
  return (
    <div
      role="listitem"
      className={cn(
        'grid grid-cols-[64px_120px_minmax(0,1fr)_72px] items-start gap-2 border-b border-border py-1.5 text-foreground',
        event.terminal && 'border-l-2 border-l-primary pl-2 text-primary',
      )}
      data-progress-row={event.seq}
    >
      <span className="text-muted-foreground">#{event.seq}</span>
      <span>{event.phase}/{event.kind}</span>
      <span className="truncate text-muted-foreground">{event.status}</span>
      <span>{event.terminal ? 'terminal' : 'active'}</span>
    </div>
  );
});
