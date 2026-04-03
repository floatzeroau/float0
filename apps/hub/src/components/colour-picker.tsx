'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Preset colours — curated for category labels
// ---------------------------------------------------------------------------

const PRESETS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#78716c', // stone
  '#64748b', // slate
  '#0a0a0a', // black
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ColourPickerProps {
  value: string;
  onChange: (colour: string) => void;
  disabled?: boolean;
}

export function ColourPicker({ value, onChange, disabled }: ColourPickerProps) {
  const [customHex, setCustomHex] = useState('');

  function handleCustomChange(raw: string) {
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    setCustomHex(raw);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      onChange(hex);
    }
  }

  return (
    <div className="space-y-2">
      {/* Preset grid */}
      <div className="grid grid-cols-8 gap-1.5">
        {PRESETS.map((colour) => (
          <button
            key={colour}
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(colour);
              setCustomHex('');
            }}
            className={cn(
              'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              value === colour ? 'border-foreground scale-110' : 'border-transparent',
            )}
            style={{ backgroundColor: colour }}
            aria-label={colour}
          />
        ))}
      </div>

      {/* Custom hex input */}
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 shrink-0 rounded-full border"
          style={{ backgroundColor: value || '#94a3b8' }}
        />
        <Input
          placeholder="#hex"
          value={customHex || value}
          onChange={(e) => handleCustomChange(e.target.value)}
          disabled={disabled}
          maxLength={7}
          className="h-8 font-mono text-xs"
        />
      </div>
    </div>
  );
}
