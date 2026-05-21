import { Circle, CircleSlash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { statusPresentation } from '@/lib/status';
import type { TaskStatus } from '@/lib/types';

export function StatusPill({ status = 'pending' }: { status?: TaskStatus }) {
  const meta = statusPresentation[status] || statusPresentation.pending;
  const Icon = meta.icon === 'x' ? XCircle : meta.icon === 'slash' ? CircleSlash2 : Circle;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={meta.tooltip}
            className="inline-flex rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            tabIndex={0}
          >
            <Badge variant="outline" className={cn('w-fit', meta.className)} data-status={status}>
              <Icon className={cn('h-2.5 w-2.5', meta.iconClassName)} />
              {meta.label}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent>{meta.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
