import * as React from 'react';
import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TimeInputProps {
  id?: string;
  value: string; // HH:MM (24h) or empty
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Normalize various free-text inputs into HH:MM 24h, or '' if invalid.
 * Accepts: "8", "08", "8:5", "08:05", "8.30", "0830", "930"
 */
export function normalizeTime(raw: string, fallback = ''): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  let h = '';
  let m = '';
  const digits = s.replace(/\D/g, '');
  if (/^\d{1,2}[:.]\d{1,2}$/.test(s)) {
    const [hh, mm] = s.split(/[:.]/);
    h = hh; m = mm;
  } else if (digits.length === 3) {
    h = digits.slice(0, 1); m = digits.slice(1);
  } else if (digits.length === 4) {
    h = digits.slice(0, 2); m = digits.slice(2);
  } else if (/^\d{1,2}$/.test(s)) {
    h = s; m = '00';
  } else {
    return fallback;
  }
  const hi = Number.parseInt(h, 10);
  const mi = Number.parseInt(m, 10);
  if (Number.isNaN(hi) || Number.isNaN(mi) || hi < 0 || hi > 23 || mi < 0 || mi > 59) {
    return fallback;
  }
  return `${hi.toString().padStart(2, '0')}:${mi.toString().padStart(2, '0')}`;
}

const QUICK_TIMES = [
  '08:00', '08:15', '09:00', '10:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '23:59',
];

/**
 * 24-hour time input (HH:MM) that does not depend on browser/OS locale.
 * Auto-inserts colon while typing and provides a quick-pick popover.
 */
export function TimeInput({ id, value, onChange, className, placeholder = 'HH:MM' }: TimeInputProps) {
  const [local, setLocal] = React.useState(value ?? '');
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setLocal(value ?? ''); }, [value]);

  const handleChange = (raw: string) => {
    // Strip non digits/colon, then auto-insert colon after 2 digits if user types digits only.
    let v = raw.replace(/[^0-9:]/g, '');
    if (v.length > 5) v = v.slice(0, 5);
    // If only digits and length 3+, insert ':' after 2 digits.
    if (!v.includes(':') && v.length >= 3) {
      v = `${v.slice(0, 2)}:${v.slice(2)}`;
    }
    setLocal(v);
  };

  const commit = (raw: string) => {
    const n = normalizeTime(raw, value ?? '');
    setLocal(n);
    if (n !== value) onChange(n);
  };

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9:]*"
        maxLength={5}
        placeholder={placeholder}
        value={local}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => commit(local)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(local); } }}
        className="pr-9"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:text-foreground"
            aria-label="Välj tid"
          >
            <Clock className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="end">
          <div className="grid grid-cols-3 gap-1">
            {QUICK_TIMES.map(t => (
              <Button
                key={t}
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs font-mono"
                onClick={() => {
                  setLocal(t);
                  onChange(t);
                  setOpen(false);
                }}
              >
                {t}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
