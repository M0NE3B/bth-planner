import * as React from 'react';
import { Input } from '@/components/ui/input';

export interface TimeInputProps {
  id?: string;
  value: string; // HH:MM (24h) or empty
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * 24-hour time input (HH:MM) that does not depend on browser/OS locale.
 * Accepts free typing and normalizes on blur. Returns "" or "HH:MM".
 */
export function TimeInput({ id, value, onChange, className, placeholder = 'HH:MM' }: TimeInputProps) {
  const [local, setLocal] = React.useState(value ?? '');
  React.useEffect(() => { setLocal(value ?? ''); }, [value]);

  const normalize = (raw: string): string => {
    const s = raw.trim();
    if (!s) return '';
    // accept "8", "08", "8:5", "08:05", "8.30", "0830"
    let h = '';
    let m = '';
    const digits = s.replace(/\D/g, '');
    if (/^\d{1,2}[:.]\d{1,2}$/.test(s)) {
      const [hh, mm] = s.split(/[:.]/);
      h = hh;
      m = mm;
    } else if (digits.length === 3) {
      h = digits.slice(0, 1);
      m = digits.slice(1);
    } else if (digits.length === 4) {
      h = digits.slice(0, 2);
      m = digits.slice(2);
    } else if (/^\d{1,2}$/.test(s)) {
      h = s;
      m = '00';
    } else {
      return value ?? '';
    }
    const hi = Number.parseInt(h, 10);
    const mi = Number.parseInt(m, 10);
    if (Number.isNaN(hi) || Number.isNaN(mi) || hi < 0 || hi > 23 || mi < 0 || mi > 59) {
      return value ?? '';
    }
    return `${hi.toString().padStart(2, '0')}:${mi.toString().padStart(2, '0')}`;
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9:.]*"
      maxLength={5}
      placeholder={placeholder}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => {
        const n = normalize(local);
        setLocal(n);
        if (n !== value) onChange(n);
      }}
      className={className}
    />
  );
}
