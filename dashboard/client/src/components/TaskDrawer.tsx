import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ProgressTimeline } from '@/components/ProgressTimeline';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { fetchTask, queryKeys } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import type { TaskDetail } from '@/lib/types';

export function TaskDrawer({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.task(id),
    queryFn: () => fetchTask(id),
    enabled: Boolean(id),
  });
  useSSE(`/events/task/${id}`, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.task(id) });
  }, { enabled: Boolean(id) });

  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => !open && navigate('/')}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{id || 'task detail'}</SheetTitle>
          <SheetDescription>public task attestation</SheetDescription>
        </SheetHeader>
        <TaskStatusStrip detail={data} />
        <TaskDetailPanel detail={data} id={id} isError={isError} isLoading={isLoading} />
      </SheetContent>
    </Sheet>
  );
}

export function TaskDetailPanel({
  detail,
  id = '',
  isError = false,
  isLoading = false,
}: {
  detail?: TaskDetail;
  id?: string;
  isError?: boolean;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <div className="p-3 font-mono text-sm text-muted-foreground">[··· ] loading task</div>;
  }
  if (isError) {
    return <div className="p-3 font-mono text-sm text-destructive">task request failed</div>;
  }

  return (
    <Tabs defaultValue="details">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="progress">Progress</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="overflow-auto">
        <TaskSummaryTable detail={detail} />
      </TabsContent>
      <TabsContent value="progress" className="flex flex-col overflow-auto p-3">
        <ProgressTimeline id={id || detail?.id || ''} />
      </TabsContent>
    </Tabs>
  );
}

export function TaskStatusStrip({ detail }: { detail?: TaskDetail }) {
  const status = detail?.status || '—';
  const terminal = detail ? (detail.terminal ? 'yes' : 'no') : '—';

  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2 font-mono text-xs text-muted-foreground">
      <span>Status: <span className="text-foreground">{status}</span></span>
      <span>
        Terminal: <span className={terminal === 'yes' ? 'text-primary' : 'text-foreground'}>{terminal}</span>
      </span>
    </div>
  );
}

export function TaskSummaryTable({ detail }: { detail?: TaskDetail }) {
  const rows = [
    ['Task', detail?.id],
    ['Status', detail?.status],
    ['Terminal', detail ? (detail.terminal ? 'yes' : 'no') : null],
    ['Requested selector', detail?.selector.requested],
    ['Effective selector', detail?.selector.effective],
    ['Selector kind', detail?.selector.kind],
    ['Selector source', detail?.selector.source],
    ['Observed models', detail?.observedModels.join(', ')],
    ['Resolution', detail?.resolution.status],
    ['Resolution detail', detail?.resolution.detail],
    ['Binary availability', detail?.inventory.binaryAvailability],
    ['Binary', detail?.inventory.binaryBasename],
    ['Catalog source', detail?.inventory.sourceLabel],
    ['Diagnostic', detail?.inventory.diagnosticCode],
  ];

  return (
    <Table className="font-mono text-xs">
      <TableBody>
        {rows.map(([label, value]) => (
          <TableRow key={label} className="h-8">
            <TableCell className="h-8 w-40 text-muted-foreground">{label}</TableCell>
            <TableCell className="h-8 truncate text-foreground">{formatValue(value)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatValue(value: string | null | undefined) {
  return value ? value : '—';
}
