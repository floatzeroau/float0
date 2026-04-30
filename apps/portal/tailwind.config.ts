import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        'tab-bar': {
          DEFAULT: 'hsl(var(--tab-bar-background))',
          foreground: 'hsl(var(--tab-bar-foreground))',
          active: 'hsl(var(--tab-bar-active))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
      },
      fontSize: {
        display: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.01em' }],
        h1: ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.005em' }],
        h2: ['1.25rem', { lineHeight: '1.625rem' }],
        body: ['0.9375rem', { lineHeight: '1.4rem' }],
        small: ['0.8125rem', { lineHeight: '1.125rem' }],
        micro: ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.04em' }],
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 8px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(45 33 26 / 0.04), 0 1px 3px 0 rgb(45 33 26 / 0.06)',
        lift: '0 4px 12px -2px rgb(45 33 26 / 0.08), 0 2px 4px -2px rgb(45 33 26 / 0.06)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
