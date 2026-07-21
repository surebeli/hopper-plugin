import { RefreshCw } from 'lucide-react';
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
import { normalizeVendorDisplay, type Vendor } from '@/lib/types';

interface VendorCardProps {
  isProbing: boolean;
  onProbe: (vendor: string) => void;
  vendor: Vendor;
}

export function VendorCard({ isProbing, onProbe, vendor }: VendorCardProps) {
  const display = normalizeVendorDisplay(vendor);
  const name = typeof vendor?.name === 'string' && vendor.name.trim() ? vendor.name : 'unavailable';
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>{name}</CardTitle>
          <div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">inventory</Badge></div>
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
              <AlertDialogTitle>Probe {name}</AlertDialogTitle>
              <AlertDialogDescription>
                Refresh vendor capability cache for {name}? This will spawn hopper-dispatch and may take 10-30 seconds.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProbing}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={isProbing} onClick={() => onProbe(name)}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 font-mono text-xs">
        <Metric label="source" value={display.source} />
        <Metric label="binary" value={display.binary} />
        <Metric label="diagnostic" value={display.diagnostic} />
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
