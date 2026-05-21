import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        border: 'hsl(var(--border) / 0.06)',         // hairline default
        'border-hi': 'hsl(var(--border) / 0.12)',    // hover / focus
        input: 'hsl(var(--input) / 0.06)',
        ring: 'hsl(var(--ring))',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs:   ['11px', { lineHeight: '1.4' }],
        sm:   ['12px', { lineHeight: '1.5' }],
        base: ['13px', { lineHeight: '1.5' }],
        md:   ['15px', { lineHeight: '1.5' }],
        lg:   ['20px', { lineHeight: '1.3' }],
      },
      spacing: {
        1: '4px', 2: '8px', 3: '12px', 4: '16px',
        5: '24px', 6: '40px', 7: '64px',
      },
      borderRadius: {
        none: '0',
        sm:   '2px',
        DEFAULT: '2px',
        md:   '4px',
      },
      transitionDuration: {
        instant: '80ms',
        fast:    '120ms',
        base:    '180ms',
      },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],   // shadcn 标配
} satisfies Config;
