import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  buildCourseIndex, parsePrerequisiteText, ruleSignature,
} from '@/lib/admin/prereqParser';
import type { CatalogCourse, CatalogPrerequisite } from '@/lib/catalog';
import type { PrerequisiteInput } from '@/lib/admin';

interface PlanRow {
  course: CatalogCourse;
  toAdd: PrerequisiteInput[];
  kept: number;
  manualRemaining: number;
  warnings: string[];
}

interface Plan {
  rows: PlanRow[];
  totalScanned: number;
  totalToAdd: number;
  totalKept: number;
  totalManual: number;
}

function existingToInput(r: CatalogPrerequisite): PrerequisiteInput {
  return {
    requirement_type: r.requirement_type,
    required_course_id: r.required_course_id,
    required_hp: r.required_hp != null ? Number(r.required_hp) : null,
    required_subject_area: r.required_subject_area,
    original_text: r.original_text,
    logic_group: r.logic_group,
    required_level: r.required_level ?? null,
    course_group_name: r.course_group_name ?? null,
    allowed_program_groups: r.allowed_program_groups ?? null,
    allowed_course_codes: r.allowed_course_codes ?? null,
    manual_review: !!r.manual_review,
    group_operator: r.group_operator ?? null,
  };
}

export default function NormalizePrereqsCard({ onApplied }: { onApplied?: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const buildPlan = async () => {
    setPreviewing(true);
    setPlan(null);
    try {
      const [c, p] = await Promise.all([
        supabase.from('courses_catalog').select('*'),
        supabase.from('course_prerequisites').select('*'),
      ]);
      if (c.error || p.error) throw c.error ?? p.error;
      const courses = (c.data ?? []) as unknown as CatalogCourse[];
      const existing = (p.data ?? []) as unknown as CatalogPrerequisite[];
      const idx = buildCourseIndex(courses);

      const existingByTarget = new Map<string, Set<string>>();
      for (const r of existing) {
        const set = existingByTarget.get(r.target_course_id) ?? new Set<string>();
        set.add(ruleSignature(existingToInput(r)));
        existingByTarget.set(r.target_course_id, set);
      }

      const rows: PlanRow[] = [];
      let totalToAdd = 0;
      let totalKept = 0;
      let totalManual = 0;
      let scanned = 0;
      for (const course of courses) {
        if (!course.original_prerequisite_text?.trim()) continue;
        scanned += 1;
        const parsed = parsePrerequisiteText(course.original_prerequisite_text, idx);
        const existingSigs = existingByTarget.get(course.id) ?? new Set<string>();
        const toAdd: PrerequisiteInput[] = [];
        let manual = 0;
        for (const r of parsed.rules) {
          const sig = ruleSignature(r);
          if (existingSigs.has(sig)) continue;
          toAdd.push(r);
          if (r.requirement_type === 'custom_text' || r.manual_review) manual += 1;
        }
        if (toAdd.length === 0 && existingSigs.size === 0 && parsed.rules.length === 0) continue;
        rows.push({
          course,
          toAdd,
          kept: existingSigs.size,
          manualRemaining: manual,
          warnings: parsed.warnings,
        });
        totalToAdd += toAdd.length;
        totalKept += existingSigs.size;
        totalManual += manual;
      }
      setPlan({ rows, totalScanned: scanned, totalToAdd, totalKept, totalManual });
    } catch (e) {
      toast.error(`Kunde inte bygga plan: ${e instanceof Error ? e.message : 'okänt fel'}`);
    } finally {
      setPreviewing(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    setApplying(true);
    setConfirmOpen(false);
    try {
      const inserts = plan.rows.flatMap((row) =>
        row.toAdd.map((r) => ({
          target_course_id: row.course.id,
          requirement_type: r.requirement_type,
          required_course_id: r.required_course_id ?? null,
          required_hp: r.required_hp ?? null,
          required_subject_area: r.required_subject_area ?? null,
          original_text: r.original_text ?? null,
          logic_group: r.logic_group ?? null,
          required_level: r.required_level ?? null,
          course_group_name: r.course_group_name ?? null,
          allowed_program_groups: r.allowed_program_groups ?? null,
          allowed_course_codes: r.allowed_course_codes ?? null,
          manual_review: !!r.manual_review,
          group_operator: r.group_operator ?? null,
        })),
      );
      if (inserts.length === 0) {
        toast.info('Inga nya regler att lägga till');
      } else {
        // Insert in chunks to stay safely under request limits.
        const chunk = 200;
        for (let i = 0; i < inserts.length; i += chunk) {
          const slice = inserts.slice(i, i + chunk);
          const { error } = await supabase.from('course_prerequisites').insert(slice as never);
          if (error) throw error;
        }
        toast.success(`La till ${inserts.length} strukturerade regler`);
      }
      setPlan(null);
      onApplied?.();
    } catch (e) {
      toast.error(`Kunde inte tillämpa: ${e instanceof Error ? e.message : 'okänt fel'}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          Normalisera förkunskaper
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Läser <code className="text-xs">original_prerequisite_text</code> för varje kurs och
          föreslår strukturerade regler. Befintliga regler bevaras — duplicering undviks via
          signaturmatchning. Operationen är idempotent.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void buildPlan()} disabled={previewing}>
            {previewing ? 'Analyserar…' : 'Förhandsgranska'}
          </Button>
          {plan && plan.totalToAdd > 0 && (
            <Button variant="default" onClick={() => setConfirmOpen(true)} disabled={applying}>
              Tillämpa ({plan.totalToAdd})
            </Button>
          )}
        </div>

        {plan && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Stat label="Kurser skannade" value={plan.totalScanned} />
              <Stat label="Nya strukturerade" value={plan.totalToAdd} />
              <Stat label="Befintliga bevarade" value={plan.totalKept} />
              <Stat label="Manuell granskning" value={plan.totalManual} />
            </div>

            <div className="rounded-md border border-border max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Kurs</th>
                    <th className="text-left p-2">Nya regler</th>
                    <th className="text-left p-2">Bevaras</th>
                    <th className="text-left p-2">Varningar</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, 200).map((r) => (
                    <tr key={r.course.id} className="border-t border-border align-top">
                      <td className="p-2 font-mono">{r.course.course_code}</td>
                      <td className="p-2">
                        {r.toAdd.length === 0 ? '–' : (
                          <ul className="space-y-0.5">
                            {r.toAdd.slice(0, 4).map((rule, i) => (
                              <li key={i}>
                                <Badge variant="secondary" className="mr-1">{rule.requirement_type}</Badge>
                                {rule.required_hp ? `${rule.required_hp} HP ` : ''}
                                {rule.required_subject_area ?? rule.course_group_name ?? ''}
                              </li>
                            ))}
                            {r.toAdd.length > 4 && <li className="text-muted-foreground">…och {r.toAdd.length - 4} till</li>}
                          </ul>
                        )}
                      </td>
                      <td className="p-2">{r.kept}</td>
                      <td className="p-2 text-muted-foreground">
                        {r.warnings.length > 0 ? `${r.warnings.length} st` : '–'}
                      </td>
                    </tr>
                  ))}
                  {plan.rows.length > 200 && (
                    <tr><td colSpan={4} className="p-2 text-muted-foreground italic">
                      Visar 200 av {plan.rows.length} kurser
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tillämpa normalisering?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan?.totalToAdd ?? 0} nya strukturerade förkunskapsregler kommer att läggas till.
              Befintliga regler ändras eller raderas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void apply(); }}>
              Tillämpa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-2 bg-muted/30">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
