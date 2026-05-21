import { Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function StatusPill({ label = 'pending' }: { label?: string }) {
  return (
    <Badge variant="outline">
      <Circle className="h-2 w-2 text-muted-foreground" />
      {label}
    </Badge>
  );
}
