import { RefreshCw, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Vendor } from '@/lib/types';

interface VendorCardProps {
  isProbing: boolean;
  onProbe: (vendor: string) => void;
  vendor: Vendor;
}

export function VendorCard({ isProbing, onProbe, vendor }: VendorCardProps) {
  const modelPreview = vendor.cachedModels.slice(0, 4);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>{vendor.name}</CardTitle>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="outline">{vendor.installStatus}</Badge>
            {vendor.stale ? <Badge variant="outline">[STALE]</Badge> : <Badge variant="outline">fresh</Badge>}
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={isProbing} size="sm" variant="outline">
              {isProbing ? (
                <span className="font-mono">[··· ]</span>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Probe
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Probe {vendor.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Refresh vendor capability cache for {vendor.name}? This will spawn hopper-dispatch and may take 10-30 seconds.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProbing}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={isProbing} onClick={() => onProbe(vendor.name)}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 font-mono text-xs">
        <Metric label="cache" value={vendor.staleness} />
        <Metric label="models" value={`${vendor.cachedModels.length}`} />
        <Metric label="source" value={vendor.modelsSource || '—'} />
        <div className="min-h-10 rounded-sm border border-border bg-background p-2 text-muted-foreground">
          {modelPreview.length > 0 ? modelPreview.join(', ') : 'no cached models'}
          {vendor.cachedModels.length > modelPreview.length ? ` +${vendor.cachedModels.length - modelPreview.length}` : ''}
        </div>
        {vendor.notes.length > 0 || vendor.cacheError ? (
          <div className="flex items-start gap-2 text-muted-foreground">
            <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{vendor.cacheError || vendor.notes[0]}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[14rem] truncate text-foreground">{value}</span>
    </div>
  );
}
