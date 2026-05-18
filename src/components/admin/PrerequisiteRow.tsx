import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { REQUIREMENT_TYPE_LABEL, type RequirementType } from '@/lib/prerequisites';
import type { PrerequisiteInput } from '@/lib/admin';
import CourseCombobox, { type CourseOption } from './CourseCombobox';

interface Props {
  row: PrerequisiteInput;
  courses: CourseOption[];
  onChange: (next: PrerequisiteInput) => void;
  onRemove: () => void;
}

const REQ_TYPES: RequirementType[] = [
  'completed_course',
  'attended_course',
  'completed_hp_in_course',
  'completed_hp_in_subject',
  'completed_total_hp',
  'custom_text',
];

export default function PrerequisiteRow({ row, courses, onChange, onRemove }: Props) {
  const update = (patch: Partial<PrerequisiteInput>) => onChange({ ...row, ...patch });

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={row.requirement_type}
          onValueChange={(v) => update({ requirement_type: v as RequirementType })}
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REQ_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{REQUIREMENT_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Ta bort krav">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {(row.requirement_type === 'completed_course' || row.requirement_type === 'attended_course') && (
        <CourseCombobox
          value={row.required_course_id ?? null}
          options={courses}
          onChange={(id) => update({ required_course_id: id })}
        />
      )}

      {row.requirement_type === 'completed_hp_in_course' && (
        <div className="grid grid-cols-2 gap-2">
          <CourseCombobox
            value={row.required_course_id ?? null}
            options={courses}
            onChange={(id) => update({ required_course_id: id })}
          />
          <Input
            type="number"
            min={0}
            placeholder="HP"
            value={row.required_hp ?? ''}
            onChange={(e) => update({ required_hp: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      )}

      {row.requirement_type === 'completed_hp_in_subject' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Huvudområde (t.ex. Matematik)"
            value={row.required_subject_area ?? ''}
            onChange={(e) => update({ required_subject_area: e.target.value })}
          />
          <Input
            type="number"
            min={0}
            placeholder="HP"
            value={row.required_hp ?? ''}
            onChange={(e) => update({ required_hp: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      )}

      {row.requirement_type === 'completed_total_hp' && (
        <Input
          type="number"
          min={0}
          placeholder="Antal HP totalt"
          value={row.required_hp ?? ''}
          onChange={(e) => update({ required_hp: e.target.value === '' ? null : Number(e.target.value) })}
        />
      )}

      {row.requirement_type === 'custom_text' && (
        <Input
          placeholder="Beskriv kravet i fritext"
          value={row.original_text ?? ''}
          onChange={(e) => update({ original_text: e.target.value })}
        />
      )}
    </div>
  );
}
