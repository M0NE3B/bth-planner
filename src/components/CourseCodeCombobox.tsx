import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface CourseCodeOption {
  course_code: string;
  course_name: string;
}

interface Props {
  value: string;
  options: CourseCodeOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  clearable?: boolean;
}

/**
 * Searchable combobox for picking a course by code or name.
 * Filtering matches both course_code and course_name via cmdk's value field.
 * Value is the course_code (or empty string).
 */
export default function CourseCodeCombobox({
  value, options, onChange,
  placeholder = 'Välj kurs',
  id,
  clearable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.course_code === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {selected ? `${selected.course_code} - ${selected.course_name}` : placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {clearable && selected && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Sök kurskod eller namn…" />
          <CommandList>
            <CommandEmpty>Ingen kurs hittades.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.course_code}
                  value={`${o.course_code} ${o.course_name}`}
                  onSelect={() => { onChange(o.course_code); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === o.course_code ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-mono text-xs mr-2">{o.course_code}</span>
                  <span className="truncate">{o.course_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
