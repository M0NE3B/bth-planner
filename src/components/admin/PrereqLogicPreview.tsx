import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { CatalogCourse, CatalogPrerequisite } from '@/lib/catalog';

interface Props {
  courses: CatalogCourse[];
  rows: CatalogPrerequisite[];
}

/** Build a short Swedish description of a single prereq row. */
function describeRow(r: CatalogPrerequisite, courseById: Map<string, CatalogCourse>): string {
  const req = r.required_course_id ? courseById.get(r.required_course_id) : null;
  const cc = req ? `${req.course_code}` : '—';
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

export default function PrereqLogicPreview({ courses, rows }: Props) {
  const [targetId, setTargetId] = useState<string>('');

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const targetsWithRules = useMemo(() => {
    const ids = new Set(rows.map((r) => r.target_course_id));
    return courses
      .filter((c) => ids.has(c.id))
      .sort((a, b) => a.course_code.localeCompare(b.course_code));
  }, [courses, rows]);

  const courseRows = useMemo(
    () => rows.filter((r) => r.target_course_id === targetId),
    [rows, targetId],
  );

  // Group rows by logic_group (null/undefined = own group per row id)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; operator: 'AND' | 'OR'; rows: CatalogPrerequisite[] }>();
    for (const r of courseRows) {
      const key = r.logic_group != null ? `g-${r.logic_group}` : `solo-${r.id}`;
      const op = (r.group_operator ?? 'AND') as 'AND' | 'OR';
      const existing = map.get(key);
      if (existing) existing.rows.push(r);
      else map.set(key, { key, operator: op, rows: [r] });
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [courseRows]);

  const target = targetId ? courseById.get(targetId) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Förhandsvisning – så tolkas kraven</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Rader med samma <strong>logikgrupp</strong> kombineras med gruppens <strong>operator</strong>{' '}
          (AND = alla måste uppfyllas, OR = minst en räcker). Olika logikgrupper kombineras alltid med AND.
          Rader utan logikgrupp behandlas som egna AND-villkor.
        </p>

        <div className="max-w-md">
          <Label className="text-xs">Välj kurs att förhandsvisa</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger><SelectValue placeholder="Välj kurs…" /></SelectTrigger>
            <SelectContent>
              {targetsWithRules.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.course_code} – {c.course_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {target && (
          <div className="space-y-3">
            <div className="text-sm">
              För att läsa <strong>{target.course_code} {target.course_name}</strong> krävs:
            </div>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga regler registrerade.</p>
            ) : (
              <ol className="space-y-2">
                {groups.map((g, i) => (
                  <li key={g.key} className="rounded-md border border-border p-3 bg-muted/30">
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <Badge variant="outline">Grupp {i + 1}</Badge>
                      {g.rows.length > 1 ? (
                        <Badge variant={g.operator === 'OR' ? 'secondary' : 'default'}>
                          {g.operator === 'OR' ? 'Minst en (OR)' : 'Alla (AND)'}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Enskilt villkor</Badge>
                      )}
                      {g.rows[0].logic_group != null && (
                        <span className="text-muted-foreground">logikgrupp #{g.rows[0].logic_group}</span>
                      )}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {g.rows.map((r, idx) => (
                        <li key={r.id} className="flex gap-2">
                          <span className="text-muted-foreground">
                            {idx === 0 ? '•' : g.operator === 'OR' ? 'eller' : 'och'}
                          </span>
                          <span>{describeRow(r, courseById)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {groups.length > 1 && (
                  <li className="text-xs text-muted-foreground pl-3">
                    Alla {groups.length} grupper måste vara uppfyllda samtidigt (AND mellan grupper).
                  </li>
                )}
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
