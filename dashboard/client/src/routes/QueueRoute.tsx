import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueueTable } from '@/components/QueueTable';
import { queryKeys } from '@/lib/api';
import { useSSE } from '@/lib/sse';

export default function QueueRoute() {
  const queryClient = useQueryClient();
  const refreshQueue = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.queue });
  }, [queryClient]);
  useSSE('/events/queue', refreshQueue);

  return <QueueTable />;
}
