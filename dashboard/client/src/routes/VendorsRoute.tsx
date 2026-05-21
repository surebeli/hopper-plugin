import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VendorCard } from '@/components/VendorCard';
import { fetchVendors, probeVendor, queryKeys } from '@/lib/api';

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
  });

  if (isLoading) {
    return <section className="font-mono text-sm text-muted-foreground">[··· ]</section>;
  }

  if (isError) {
    return <section className="font-mono text-sm text-destructive">vendor inventory unavailable</section>;
  }

  return (
    <section className="min-w-0">
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
