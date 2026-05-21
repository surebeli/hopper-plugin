import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 font-mono text-xs transition-colors duration-fast ease-swift',
  {
    variants: {
      variant: {
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'outline',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
