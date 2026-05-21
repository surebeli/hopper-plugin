import type { TaskStatus } from './types';

export const statusOrder: TaskStatus[] = ['in-progress', 'pending', 'failed', 'done', 'removed'];

export const priorityOrder = {
  high: 0,
  normal: 1,
  low: 2,
} as const;

export const statusPresentation = {
  pending: {
    label: 'pending',
    icon: 'circle',
    className: 'border-border text-muted-foreground',
    iconClassName: 'text-muted-foreground',
  },
  'in-progress': {
    label: 'running',
    icon: 'solid-circle',
    className: 'border-primary/40 text-primary',
    iconClassName: 'fill-primary text-primary',
  },
  done: {
    label: 'done',
    icon: 'circle',
    className: 'border-primary/40 text-primary',
    iconClassName: 'text-primary',
  },
  failed: {
    label: 'failed',
    icon: 'x',
    className: 'border-destructive/50 text-destructive',
    iconClassName: 'text-destructive',
  },
  removed: {
    label: 'removed',
    icon: 'slash',
    className: 'border-border text-muted-foreground line-through',
    iconClassName: 'text-muted-foreground',
  },
} satisfies Record<TaskStatus, { label: string; icon: string; className: string; iconClassName: string }>;
