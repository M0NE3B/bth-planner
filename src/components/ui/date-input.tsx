import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DateInputProps {
  id?: string;
  value: string; // ISO YYYY-MM-DD (empty string allowed)
  onChange: (val: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Date input that always displays DD/MM/YYYY (Swedish style) regardless of
 * the browser/OS locale. Stores value as ISO YYYY-MM-DD for DB compatibility.
 */
export function DateInput({
  id, value, onChange, required, placeholder = 'DD/MM/ÅÅÅÅ', className,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const display = parsed && isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start font-normal h-10',
            !display && 'text-muted-foreground',
            className,
          )}
          aria-required={required}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {display || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsed && isValid(parsed) ? parsed : undefined}
          onSelect={(d) => {
            if (d) {
              onChange(format(d, 'yyyy-MM-dd'));
              setOpen(false);
            }
          }}
          locale={sv}
          weekStartsOn={1}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
