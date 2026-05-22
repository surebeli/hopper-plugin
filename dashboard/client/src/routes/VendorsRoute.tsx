import { lazy, Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VendorCard } from '@/components/VendorCard';
import { fetchVendors, probeVendor, queryKeys } from '@/lib/api';

const ToastHost = lazy(() => import('@/components/ToastHost'));

export function probeErrorMessage(err: Error, vendor: string) {
  return `probe ${vendor} failed: ${err.message}`;
}

export async function showProbeError(err: Error, vendor: string) {
  const { toast } = await import('sonner');
  toast.error(probeErrorMessage(err, vendor));
}

export default function VendorsRoute() {
  const queryClient = useQueryClient();
  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.vendors,
    queryFn: fetchVendors,
  });
  const probe = useMutation({
    mutationFn: probeVendor,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vendors });
    },
    onError: (err, vendor) => {
      void showProbeError(err, vendor);
    },
  });

  if (isLoading) {
    return <section className="font-mono text-sm text-muted-foreground">[··· ]</section>;
  }

  if (isError) {
    return <section className="font-mono text-sm text-destructive">vendor inventory unavailable</section>;
  }

  return (
    <section className="min-w-0">
      <Suspense fallback={null}>
        <ToastHost />
      </Suspense>
      {data?.vendors.every((vendor) => vendor.cachedModels.length === 0) ? (
        <div className="mb-3 rounded-sm border border-border bg-muted/20 p-3 font-mono text-sm text-muted-foreground">
          no cached models yet; probe vendors to populate capability data
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.vendors.map((vendor) => (
          <VendorCard
            key={vendor.name}
            isProbing={probe.isPending && probe.variables === vendor.name}
            onProbe={(name) => probe.mutate(name)}
            vendor={vendor}
          />
        ))}
      </div>
    </section>
  );
}
