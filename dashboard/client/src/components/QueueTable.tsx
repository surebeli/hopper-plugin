import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchQueue, queryKeys } from '@/lib/api';
import { cn } from '@/lib/utils';
import { priorityRank, statusOrder, statusRank } from '@/lib/status';
import type { Task, TaskStatus } from '@/lib/types';
import { StatusPill } from './StatusPill';

const columns: ColumnDef<Task>[] = [
  { accessorKey: 'id', header: 'ID', cell: ({ row }) => <span className="text-foreground">{row.original.id}</span> },
  { accessorKey: 'taskType', header: 'Type' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusPill status={row.original.status} /> },
  { accessorKey: 'vendor', header: 'Vendor', cell: ({ row }) => row.original.vendor || '—' },
  { accessorKey: 'brief', header: 'Brief', cell: ({ row }) => <span className="text-foreground">{row.original.brief}</span> },
];

export function QueueTable({ rows: providedRows }: { rows?: Task[] }) {
  const { id: routeTaskId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [keyboardSelectedId, setKeyboardSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { data = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.queue,
    queryFn: fetchQueue,
    enabled: !providedRows,
  });

  const sortedRows = useMemo(() => {
    const rows = [...(providedRows || data)];
    return rows.sort((a, b) => {
      const statusDelta = statusRank(a.status) - statusRank(b.status);
      if (statusDelta !== 0) return statusDelta;
      const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return a.id.localeCompare(b.id);
    });
  }, [data, providedRows]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sortedRows;
    return sortedRows.filter((row) => [row.id, row.taskType, row.vendor || '', row.brief].some((value) => value.toLowerCase().includes(needle)));
  }, [search, sortedRows]);
  const selectedId = routeTaskId || keyboardSelectedId || visibleRows[0]?.id;
  const table = useReactTable({ data: visibleRows, columns, getCoreRowModel: getCoreRowModel() });
  const groups = useMemo(() => {
    const rows = table.getRowModel().rows;
    return statusOrder
      .map((status) => ({ status, rows: rows.filter((row) => row.original.status === status) }))
      .filter((group) => group.rows.length > 0);
  }, [visibleRows, table]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key !== 'j' && event.key !== 'k' && event.key !== 'Enter') return;
      if (visibleRows.length === 0) return;
      if (event.key === 'Enter') {
        if (selectedId) {
          event.preventDefault();
          navigate(`/task/${selectedId}`);
        }
        return;
      }
      event.preventDefault();
      const nextId = nextQueueSelectionId(visibleRows, selectedId, event.key === 'j' ? 1 : -1);
      setKeyboardSelectedId(nextId);
      if (location.pathname.startsWith('/task/')) navigate(`/task/${nextId}`);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location.pathname, navigate, selectedId, visibleRows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Queue</CardTitle>
        <input
          aria-label="Search queue"
          className="h-7 w-56 rounded-sm border border-border bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          data-queue-search
          onChange={(event) => setSearch(event.target.value)}
          placeholder="search"
          value={search}
        />
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && !providedRows ? <div className="p-3 font-mono text-sm text-muted-foreground">[··· ] loading queue</div> : null}
        {isError ? <div className="p-3 font-mono text-sm text-destructive">queue request failed</div> : null}
        {!isLoading && sortedRows.length === 0 ? <div className="p-3 font-mono text-sm text-muted-foreground">[··· ] queue empty</div> : null}
        {!isLoading && sortedRows.length > 0 && visibleRows.length === 0 ? <div className="p-3 font-mono text-sm text-muted-foreground">no matching tasks</div> : null}
        {visibleRows.length > 0 ? (
          <Table className="table-fixed font-mono">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className={headerClassName(header.column.id)}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const isCollapsed = collapsed[group.status];
                return (
                  <FragmentGroup
                    key={group.status}
                    group={group}
                    selectedId={selectedId}
                    collapsed={isCollapsed}
                    onToggle={() => setCollapsed((next) => ({ ...next, [group.status]: !isCollapsed }))}
                    onSelect={(taskId) => {
                      setKeyboardSelectedId(taskId);
                      navigate(`/task/${taskId}`);
                    }}
                  />
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function nextQueueSelectionId(rows: Task[], currentId: string | null | undefined, delta: 1 | -1) {
  if (rows.length === 0) return '';
  const currentIndex = rows.findIndex((row) => row.id === currentId);
  const fallback = delta > 0 ? 0 : rows.length - 1;
  const nextIndex = currentIndex === -1 ? fallback : Math.min(rows.length - 1, Math.max(0, currentIndex + delta));
  return rows[nextIndex].id;
}

function FragmentGroup({
  group,
  selectedId,
  collapsed,
  onToggle,
  onSelect,
}: {
  group: { status: TaskStatus; rows: Row<Task>[] };
  selectedId?: string;
  collapsed?: boolean;
  onToggle: () => void;
  onSelect: (taskId: string) => void;
}) {
  const ToggleIcon = collapsed ? ChevronRight : ChevronDown;

  return (
    <>
      <TableRow className="bg-muted/20">
        <TableCell colSpan={5} className="h-8 px-2">
          <button className="inline-flex items-center gap-2 text-xs text-muted-foreground" onClick={onToggle} type="button">
            <ToggleIcon className="h-3 w-3" />
            {group.status} · {group.rows.length}
          </button>
        </TableCell>
      </TableRow>
      {!collapsed
        ? group.rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn('h-8 cursor-pointer hover:bg-muted/40', row.original.id === selectedId && 'bg-muted/30')}
              onClick={() => onSelect(row.original.id)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    'h-8 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground',
                    cell.column.id === 'id' && 'border-l-2 border-l-transparent',
                    cell.column.id === 'id' && row.original.id === selectedId && 'border-l-primary',
                    cell.column.id === 'id' && 'w-40',
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        : null}
    </>
  );
}

function headerClassName(id: string) {
  if (id === 'id') return 'w-40';
  if (id === 'taskType') return 'w-40';
  if (id === 'status') return 'w-32';
  if (id === 'vendor') return 'w-28';
  return '';
}
