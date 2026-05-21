import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent px-2.5 text-sm font-medium transition-colors duration-fast ease-swift focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        ghost: 'text-muted-foreground hover:border-border-hi hover:bg-muted/40 hover:text-foreground',
        outline: 'border-border text-foreground hover:border-border-hi hover:bg-muted/40',
      },
      size: {
        sm: 'h-7 px-2 text-xs',
        md: 'h-8 px-2.5 text-sm',
        icon: 'h-8 w-8 px-0',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
