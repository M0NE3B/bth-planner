import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  'completed_hp_in_program_group',
  'completed_hp_in_course_group',
  'completed_hp_at_level',
  'custom_text',
];

function toCsv(arr?: string[] | null): string {
  return (arr ?? []).join(', ');
}
function fromCsv(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

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

      {row.requirement_type === 'completed_hp_in_program_group' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number" min={0} placeholder="HP"
              value={row.required_hp ?? ''}
              onChange={(e) => update({ required_hp: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <Input
              placeholder="Programgrupper (kommaseparerat)"
              value={toCsv(row.allowed_program_groups)}
              onChange={(e) => update({ allowed_program_groups: fromCsv(e.target.value) })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            T.ex. "Maskinteknik, Industriell ekonomi". Utvärderas som manuellt krav om mappning saknas.
          </p>
        </div>
      )}

      {row.requirement_type === 'completed_hp_in_course_group' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number" min={0} placeholder="HP"
              value={row.required_hp ?? ''}
              onChange={(e) => update({ required_hp: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <Input
              placeholder="Gruppnamn (t.ex. CAD)"
              value={row.course_group_name ?? ''}
              onChange={(e) => update({ course_group_name: e.target.value })}
            />
          </div>
          <Input
            placeholder="Tillåtna kurskoder (kommaseparerat)"
            value={toCsv(row.allowed_course_codes)}
            onChange={(e) => update({ allowed_course_codes: fromCsv(e.target.value).map((c) => c.toUpperCase()) })}
          />
          <Input
            placeholder="Huvudområde (valfritt)"
            value={row.required_subject_area ?? ''}
            onChange={(e) => update({ required_subject_area: e.target.value })}
          />
        </div>
      )}

      {row.requirement_type === 'completed_hp_at_level' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number" min={0} placeholder="HP"
            value={row.required_hp ?? ''}
            onChange={(e) => update({ required_hp: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <Input
            placeholder="Nivå (t.ex. advanced / A1N)"
            value={row.required_level ?? ''}
            onChange={(e) => update({ required_level: e.target.value })}
          />
        </div>
      )}

      {row.requirement_type === 'custom_text' && (
        <Input
          placeholder="Beskriv kravet i fritext"
          value={row.original_text ?? ''}
          onChange={(e) => update({ original_text: e.target.value })}
        />
      )}

      <div className="grid grid-cols-3 gap-2 pt-1">
        <div>
          <Label className="text-[11px]">Logikgrupp</Label>
          <Input
            type="number" placeholder="–"
            value={row.logic_group ?? ''}
            onChange={(e) => update({ logic_group: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-[11px]">Operator</Label>
          <Select
            value={row.group_operator ?? 'none'}
            onValueChange={(v) => update({ group_operator: v === 'none' ? null : (v as 'AND' | 'OR') })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">–</SelectItem>
              <SelectItem value="AND">AND</SelectItem>
              <SelectItem value="OR">OR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <Switch
            id={`manual-${row.requirement_type}-${row.logic_group ?? ''}`}
            checked={!!row.manual_review}
            onCheckedChange={(v) => update({ manual_review: v })}
          />
          <Label className="text-xs">Manuell granskning</Label>
        </div>
      </div>

      {row.requirement_type !== 'custom_text' && (
        <Input
          placeholder="Original-text (valfritt)"
          value={row.original_text ?? ''}
          onChange={(e) => update({ original_text: e.target.value })}
        />
      )}
    </div>
  );
}
