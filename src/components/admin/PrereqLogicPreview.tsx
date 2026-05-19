import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { PrerequisiteInput } from '@/lib/admin';
import type { CourseOption } from './CourseCombobox';

interface Props {
  prereqs: PrerequisiteInput[];
  courses: CourseOption[];
}

function describe(r: PrerequisiteInput, byId: Map<string, CourseOption>): string {
  const req = r.required_course_id ? byId.get(r.required_course_id) : null;
  const cc = req ? req.course_code : '—';
  switch (r.requirement_type) {
    case 'completed_course': return `Avklarad: ${cc}`;
    case 'attended_course': return `Genomgången/påbörjad: ${cc}`;
    case 'completed_hp_in_course': return `Minst ${r.required_hp ?? 0} HP i ${cc}`;
    case 'completed_hp_in_subject': return `Minst ${r.required_hp ?? 0} HP inom ${r.required_subject_area ?? '—'}`;
    case 'completed_total_hp': return `Minst ${r.required_hp ?? 0} HP totalt`;
    case 'completed_hp_in_program_group': return `Minst ${r.required_hp ?? 0} HP inom programgrupp (${(r.allowed_program_groups ?? []).join(', ') || '—'})`;
    case 'completed_hp_in_course_group': return `Minst ${r.required_hp ?? 0} HP inom ${r.course_group_name ?? 'kursgrupp'}`;
    case 'completed_hp_at_level': return `Minst ${r.required_hp ?? 0} HP på nivå ${r.required_level ?? '—'}`;
    case 'custom_text': return `Manuellt: ${r.original_text ?? '—'}`;
    default: return String(r.requirement_type);
  }
}

export default function PrereqLogicPreview({ prereqs, courses }: Props) {
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; operator: 'AND' | 'OR'; rows: PrerequisiteInput[]; logic: number | null }>();
    prereqs.forEach((r, idx) => {
      const key = r.logic_group != null ? `g-${r.logic_group}` : `solo-${idx}`;
      const op = (r.group_operator ?? 'AND') as 'AND' | 'OR';
      const existing = map.get(key);
      if (existing) existing.rows.push(r);
      else map.set(key, { key, operator: op, rows: [r], logic: r.logic_group ?? null });
    });
    return Array.from(map.values());
  }, [prereqs]);

  // Detect inconsistencies inside a logic_group (different operators across rows)
  const warnings = useMemo(() => {
    const w: string[] = [];
    const opsPerGroup = new Map<number, Set<string>>();
    for (const r of prereqs) {
      if (r.logic_group == null) continue;
      const s = opsPerGroup.get(r.logic_group) ?? new Set<string>();
      s.add(r.group_operator ?? 'AND');
      opsPerGroup.set(r.logic_group, s);
    }
    for (const [g, ops] of opsPerGroup) {
      if (ops.size > 1) w.push(`Logikgrupp #${g} har olika operatorer på sina rader – sätt samma AND/OR på alla.`);
    }
    return w;
  }, [prereqs]);

  if (prereqs.length === 0) return null;

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 space-y-2 mt-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">Förhandsvisning</Badge>
        <span className="text-xs text-muted-foreground">Så här tolkas reglerna innan du sparar.</span>
      </div>

      {warnings.length > 0 && (
        <ul className="text-xs text-destructive space-y-0.5">
          {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
        </ul>
      )}

      <ol className="space-y-2">
        {groups.map((g, i) => (
          <li key={g.key} className="rounded-md border border-border bg-background p-2">
            <div className="flex items-center gap-2 mb-1 text-[11px]">
              <Badge variant="outline">Grupp {i + 1}</Badge>
              {g.rows.length > 1 ? (
                <Badge variant={g.operator === 'OR' ? 'secondary' : 'default'}>
                  {g.operator === 'OR' ? 'Minst en (OR)' : 'Alla (AND)'}
                </Badge>
              ) : (
                <Badge variant="outline">Enskilt villkor</Badge>
              )}
              {g.logic != null && <span className="text-muted-foreground">logikgrupp #{g.logic}</span>}
            </div>
            <ul className="space-y-0.5 text-xs">
              {g.rows.map((r, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-muted-foreground w-10 shrink-0">
                    {idx === 0 ? '•' : g.operator === 'OR' ? 'eller' : 'och'}
                  </span>
                  <span>{describe(r, byId)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {groups.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Alla {groups.length} grupper måste vara uppfyllda samtidigt (AND mellan grupper).
        </p>
      )}
    </div>
  );
}
