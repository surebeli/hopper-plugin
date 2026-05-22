import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchCost, queryKeys } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import type { CostByVendor, CostRow } from '@/lib/types';

export function CostBars() {
  const queryClient = useQueryClient();
  const refreshCost = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cost });
  }, [queryClient]);
  useSSE('/events/cost', refreshCost);
  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.cost,
    queryFn: fetchCost,
  });

  if (isLoading) {
    return <section className="font-mono text-sm text-muted-foreground">[··· ] loading cost log</section>;
  }

  if (isError || !data) {
    return <section className="font-mono text-sm text-destructive">cost log unavailable</section>;
  }

  const maxCost = Math.max(...data.byVendor.map((row) => row.approxUsd), 0);

  return (
    <section className="min-w-0 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="rows" value={data.totals.rows.toLocaleString()} />
        <StatCard label="tokens" value={(data.totals.tokensIn + data.totals.tokensOut).toLocaleString()} />
        <StatCard label="approx $" value={formatUsd(data.totals.approxUsd)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cost by vendor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.byVendor.length > 0 ? data.byVendor.map((row) => <CostBar key={row.vendor} max={maxCost} row={row} />) : (
            <div className="font-mono text-sm text-muted-foreground">no cost rows</div>
          )}
        </CardContent>
      </Card>
      <CostTable rows={data.rows} />
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="font-mono text-lg text-foreground">{value}</CardContent>
    </Card>
  );
}

function CostBar({ row, max }: { row: CostByVendor; max: number }) {
  const pct = max > 0 ? (row.approxUsd / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="w-24 truncate text-muted-foreground">{row.vendor}</span>
      <div className="h-4 flex-1 rounded-sm bg-muted/40" data-cost-bar={row.vendor}>
        <div className="h-4 rounded-sm bg-primary" style={{ width: pct > 0 ? `max(${pct.toFixed(1)}%, 2px)` : '0' }} />
      </div>
      <span className="w-20 text-right text-foreground">{formatUsd(row.approxUsd)}</span>
    </div>
  );
}

function CostTable({ rows }: { rows: CostRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Detail</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="table-fixed font-mono">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Date</TableHead>
              <TableHead className="w-36">Task</TableHead>
              <TableHead className="w-28">Vendor</TableHead>
              <TableHead className="w-32 text-right">Tokens</TableHead>
              <TableHead className="w-24 text-right">Approx $</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.date}-${row.task}-${index}`} className="hover:bg-muted/40">
                <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">{row.date}</TableCell>
                <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-foreground">{row.task}</TableCell>
                <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block max-w-full truncate">{row.vendor}</span>
                      </TooltipTrigger>
                      <TooltipContent>{row.model}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{(row.tokensIn + row.tokensOut).toLocaleString()}</TableCell>
                <TableCell className="text-right text-foreground">{formatUsd(row.approxUsd)}</TableCell>
                <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">{row.notes || row.model}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function formatUsd(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}
