'use client';

import { useState } from 'react';
import { format, subDays, startOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronDown } from 'lucide-react';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
const display = (d: Date) => format(d, 'dd MMM yyyy');

const presets = [
  { label: 'Today', range: () => ({ from: fmt(new Date()), to: fmt(new Date()) }) },
  {
    label: 'Yesterday',
    range: () => ({ from: fmt(subDays(new Date(), 1)), to: fmt(subDays(new Date(), 1)) }),
  },
  {
    label: 'This Week',
    range: () => ({ from: fmt(startOfWeek(new Date(), { weekStartsOn: 1 })), to: fmt(new Date()) }),
  },
  {
    label: 'This Month',
    range: () => ({ from: fmt(startOfMonth(new Date())), to: fmt(new Date()) }),
  },
  {
    label: 'Last Month',
    range: () => {
      const prev = subMonths(new Date(), 1);
      return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
    },
  },
];

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ from?: Date; to?: Date }>({
    from: new Date(value.from + 'T00:00:00'),
    to: new Date(value.to + 'T00:00:00'),
  });

  const apply = () => {
    if (selected.from && selected.to) {
      onChange({ from: fmt(selected.from), to: fmt(selected.to) });
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Button variant="outline" className="gap-2" onClick={() => setOpen(!open)}>
        <CalendarDays className="h-4 w-4" />
        <span>
          {display(new Date(value.from + 'T00:00:00'))} –{' '}
          {display(new Date(value.to + 'T00:00:00'))}
        </span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 rounded-lg border bg-card p-4 shadow-lg">
            <div className="flex gap-4">
              {/* Presets */}
              <div className="flex flex-col gap-1 border-r pr-4">
                {presets.map((p) => (
                  <Button
                    key={p.label}
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      const r = p.range();
                      onChange(r);
                      setSelected({
                        from: new Date(r.from + 'T00:00:00'),
                        to: new Date(r.to + 'T00:00:00'),
                      });
                      setOpen(false);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              {/* Calendar */}
              <div>
                <DayPicker
                  mode="range"
                  selected={
                    selected.from && selected.to
                      ? { from: selected.from, to: selected.to }
                      : undefined
                  }
                  onSelect={(range) => {
                    if (range) {
                      setSelected({ from: range.from, to: range.to });
                    }
                  }}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                />
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={apply} disabled={!selected.from || !selected.to}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
