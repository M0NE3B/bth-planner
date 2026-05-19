import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  parsePrerequisiteText, proposalKey,
  type ParseRuleProposal, type ParserCourse,
} from '@/lib/admin/prereqParser';
import type { RequirementType } from '@/lib/catalog';

interface CourseRow extends ParserCourse {
  original_prerequisite_text: string | null;
}
interface ExistingPrereq {
  target_course_id: string;
  requirement_type: string;
  required_course_id: string | null;
  required_subject_area: string | null;
  required_hp: number | null;
  original_text: string | null;
}

interface CoursePlan {
  course: CourseRow;
  existingCount: number;
  proposals: Array<ParseRuleProposal & { _selected: boolean; _isDup: boolean }>;
}

export default function PrereqNormalizeCard() {
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [search, setSearch] = useState('');
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [existing, setExisting] = useState<ExistingPrereq[]>([]);
  const [plans, setPlans] = useState<CoursePlan[]>([]);

  const load = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from('courses_catalog')
        .select('id, course_code, course_name, subject_area, original_prerequisite_text')
        .eq('active', true),
      supabase.from('course_prerequisites')
        .select('target_course_id, requirement_type, required_course_id, required_subject_area, required_hp, original_text'),
    ]);
    if (c.error || p.error) { toast.error('Kunde inte ladda data'); setLoading(false); return; }
    setCourses(((c.data ?? []) as unknown) as CourseRow[]);
    setExisting(((p.data ?? []) as unknown) as ExistingPrereq[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const codeToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of courses) m.set(c.course_code.toUpperCase(), c.id);
    return m;
  }, [courses]);

  const existingKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const e of existing) {
      s.add([
        e.target_course_id, e.requirement_type,
        e.required_course_id ?? '',
        (e.required_subject_area ?? '').toLowerCase(),
        e.required_hp ?? '',
        (e.original_text ?? '').toLowerCase(),
      ].join('|'));
    }
    return s;
  }, [existing]);

  const existingCountByCourse = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of existing) m.set(e.target_course_id, (m.get(e.target_course_id) ?? 0) + 1);
    return m;
  }, [existing]);

  const runScan = () => {
    setScanning(true);
    try {
      const withText = courses.filter((c) =>
        (c.original_prerequisite_text ?? '').trim().length > 5,
      );
      const parserCatalog: ParserCourse[] = courses.map((c) => ({
        id: c.id, course_code: c.course_code, course_name: c.course_name,
        subject_area: c.subject_area,
      }));
      const out: CoursePlan[] = [];
      for (const c of withText) {
        const { rules } = parsePrerequisiteText(c.original_prerequisite_text ?? '', parserCatalog);
        if (rules.length === 0) continue;
        const proposals = rules.map((r) => {
          const k = proposalKey(c.id, r, codeToId);
          const isDup = existingKeySet.has(k);
          return { ...r, _isDup: isDup, _selected: !isDup };
        });
        out.push({
          course: c,
          existingCount: existingCountByCourse.get(c.id) ?? 0,
          proposals,
        });
      }
      setPlans(out);
      toast.success(`Skannade ${withText.length} kurser — ${out.length} har förslag`);
    } finally {
      setScanning(false);
    }
  };

  const toggleSelect = (courseId: string, idx: number) => {
    setPlans((prev) => prev.map((p) => {
      if (p.course.id !== courseId) return p;
      const proposals = p.proposals.map((pr, i) => i === idx ? { ...pr, _selected: !pr._selected } : pr);
      return { ...p, proposals };
    }));
  };

  const toggleAllForCourse = (courseId: string, on: boolean) => {
    setPlans((prev) => prev.map((p) => p.course.id !== courseId ? p
      : { ...p, proposals: p.proposals.map((pr) => ({ ...pr, _selected: on && !pr._isDup })) }));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) =>
      p.course.course_code.toLowerCase().includes(q)
      || p.course.course_name.toLowerCase().includes(q),
    );
  }, [plans, search]);

  const selectedCount = plans.reduce(
    (n, p) => n + p.proposals.filter((pr) => pr._selected).length, 0,
  );

  const applySelected = async () => {
    setWriting(true);
    try {
      const rows: Array<{
        target_course_id: string; requirement_type: RequirementType;
        required_course_id: string | null; required_hp: number | null;
        required_subject_area: string | null; original_text: string | null;
        required_level: string | null; course_group_name: string | null;
        allowed_program_groups: string[] | null; allowed_course_codes: string[] | null;
        manual_review: boolean;
      }> = [];
      for (const plan of plans) {
        for (const p of plan.proposals) {
          if (!p._selected) continue;
          rows.push({
            target_course_id: plan.course.id,
            requirement_type: p.requirement_type,
            required_course_id: p.required_course_code
              ? (codeToId.get(p.required_course_code.toUpperCase()) ?? null)
              : null,
            required_hp: p.required_hp ?? null,
            required_subject_area: p.required_subject_area ?? null,
            original_text: p.original_text ?? null,
            required_level: p.required_level ?? null,
            course_group_name: p.course_group_name ?? null,
            allowed_program_groups: p.allowed_program_groups ?? null,
            allowed_course_codes: p.allowed_course_codes ?? null,
            manual_review: !!p.manual_review,
          });
        }
      }
      if (rows.length === 0) { toast.info('Inget valt'); return; }
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase.from('course_prerequisites').insert(chunk);
        if (error) throw error;
      }
      toast.success(`Skrev ${rows.length} förkunskapsregler`);
      setPlans([]);
      await load();
    } catch (e) {
      toast.error(`Kunde inte skriva: ${e instanceof Error ? e.message : 'okänt fel'}`);
    } finally {
      setWriting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Normalisera förkunskaper
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Skannar alla aktiva kurser med <code className="text-xs">original_prerequisite_text</code> och
          föreslår strukturerade regler. Befintliga regler rörs inte — förslag som redan finns
          markeras "Finns redan" och avmarkeras automatiskt. Du väljer per rad vad som skrivs.
          Idempotent: kan köras flera gånger.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runScan} disabled={loading || scanning} className="gap-1">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Skanna kurser
          </Button>
          <Button
            onClick={() => void applySelected()}
            disabled={writing || selectedCount === 0}
            className="gap-1"
          >
            {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Skriv {selectedCount} valda regler
          </Button>
          {plans.length > 0 && (
            <Input
              placeholder="Filtrera på kod eller namn…"
              className="w-60"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </div>

        {plans.length > 0 && (
          <ScrollArea className="h-[520px] rounded-md border border-border">
            <div className="divide-y divide-border">
              {filtered.map((plan) => {
                const totalSel = plan.proposals.filter((p) => p._selected).length;
                return (
                  <div key={plan.course.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm">
                        <span className="font-mono text-xs">{plan.course.course_code}</span>{' '}
                        <span className="font-medium">{plan.course.course_name}</span>{' '}
                        <Badge variant="outline" className="ml-1 text-xs">
                          {plan.existingCount} befintliga
                        </Badge>{' '}
                        <Badge variant="secondary" className="text-xs">
                          {totalSel}/{plan.proposals.length} valda
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="text-xs h-7"
                          onClick={() => toggleAllForCourse(plan.course.id, true)}>Välj alla</Button>
                        <Button size="sm" variant="ghost" className="text-xs h-7"
                          onClick={() => toggleAllForCourse(plan.course.id, false)}>Avmarkera alla</Button>
                      </div>
                    </div>
                    {plan.course.original_prerequisite_text && (
                      <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                        {plan.course.original_prerequisite_text}
                      </p>
                    )}
                    <ul className="space-y-1">
                      {plan.proposals.map((pr, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs">
                          <Checkbox
                            checked={pr._selected}
                            disabled={pr._isDup}
                            onCheckedChange={() => toggleSelect(plan.course.id, idx)}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="flex flex-wrap gap-1 items-center">
                              <Badge variant="secondary" className="text-[10px]">
                                {pr.requirement_type}
                              </Badge>
                              {pr.manual_review && (
                                <Badge variant="outline" className="text-[10px]">manual</Badge>
                              )}
                              {pr._isDup && (
                                <Badge variant="outline" className="text-[10px] border-primary/40">
                                  Finns redan
                                </Badge>
                              )}
                              <span className="text-muted-foreground">
                                konfidens {Math.round(pr.confidence * 100)}%
                              </span>
                            </div>
                            <p className="mt-0.5">{pr.reason}</p>
                            <p className="text-muted-foreground italic break-words">
                              ”{pr.source_fragment}”
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {plans.length === 0 && !scanning && (
          <p className="text-xs text-muted-foreground">
            Klicka <strong>Skanna kurser</strong> för att se förslag. Inget skrivs förrän du bekräftar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
