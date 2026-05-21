import type { TaskStatus } from './types';

export const statusOrder: TaskStatus[] = ['in-progress', 'pending', 'failed', 'done', 'removed'];

export const priorityOrder = {
  high: 0,
  normal: 1,
  low: 2,
} as const;

export function priorityRank(priority: keyof typeof priorityOrder) {
  return priorityOrder[priority] ?? priorityOrder.normal;
}

export function statusRank(status: TaskStatus) {
  const index = statusOrder.indexOf(status);
  return index === -1 ? statusOrder.length : index;
}

export const statusPresentation = {
  pending: {
    label: 'pending',
    tooltip: 'queued; vendor not yet started',
    icon: 'circle',
    className: 'border-border text-muted-foreground',
    iconClassName: 'text-muted-foreground',
  },
  'in-progress': {
    label: 'running',
    tooltip: 'vendor process active; PID alive',
    icon: 'solid-circle',
    className: 'border-primary/40 text-primary',
    iconClassName: 'fill-primary text-primary',
  },
  done: {
    label: 'done',
    tooltip: 'vendor exit 0; verdict in output.md',
    icon: 'circle',
    className: 'border-primary/40 text-primary',
    iconClassName: 'text-primary',
  },
  failed: {
    label: 'failed',
    tooltip: 'vendor non-zero exit or adapter error',
    icon: 'x',
    className: 'border-destructive/50 text-destructive',
    iconClassName: 'text-destructive',
  },
  removed: {
    label: 'removed',
    tooltip: 'manually removed from queue',
    icon: 'slash',
    className: 'border-border text-muted-foreground line-through',
    iconClassName: 'text-muted-foreground',
  },
} satisfies Record<TaskStatus, { label: string; tooltip: string; icon: string; className: string; iconClassName: string }>;
