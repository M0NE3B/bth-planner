import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  CatalogCourse, CatalogProgram, CatalogProgramCourse, CatalogPrerequisite,
} from '@/lib/catalog';

interface IssueGroup {
  key: string;
  title: string;
  description?: string;
  items: string[];
  tone?: 'error' | 'info';
}

export default function DataQualityTab() {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [pc, setPc] = useState<CatalogProgramCourse[]>([]);
  const [prereqs, setPrereqs] = useState<CatalogPrerequisite[]>([]);

  const load = async () => {
    setLoading(true);
    const [c, p, pcRes, pr] = await Promise.all([
      supabase.from('courses_catalog').select('*'),
      supabase.from('programs_catalog').select('*'),
      supabase.from('program_courses').select('*'),
      supabase.from('course_prerequisites').select('*'),
    ]);
    if (c.error || p.error || pcRes.error || pr.error) {
      toast.error('Kunde inte ladda data');
      setLoading(false);
      return;
    }
    setCourses((c.data ?? []) as unknown as CatalogCourse[]);
    setPrograms((p.data ?? []) as unknown as CatalogProgram[]);
    setPc((pcRes.data ?? []) as unknown as CatalogProgramCourse[]);
    setPrereqs((pr.data ?? []) as unknown as CatalogPrerequisite[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const groups = useMemo<IssueGroup[]>(() => {
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const result: IssueGroup[] = [];

    // Duplicate course codes
    const codeCounts = new Map<string, number>();
    for (const c of courses) {
      const k = c.course_code.toUpperCase();
      codeCounts.set(k, (codeCounts.get(k) ?? 0) + 1);
    }
    result.push({
      key: 'dup-codes',
      title: 'Dubbla kurskoder',
      description: 'Kurskoder som finns på fler än en rad.',
      items: Array.from(codeCounts.entries()).filter(([, n]) => n > 1).map(([k, n]) => `${k} (${n} rader)`),
    });

    // Missing fields
    result.push({
      key: 'missing-name',
      title: 'Kurser utan namn',
      items: courses.filter((c) => !c.course_name?.trim()).map((c) => c.course_code),
    });
    result.push({
      key: 'missing-hp',
      title: 'Kurser utan HP',
      items: courses.filter((c) => !c.hp || Number(c.hp) === 0).map((c) => `${c.course_code} – ${c.course_name}`),
    });
    result.push({
      key: 'missing-subject',
      title: 'Kurser utan huvudområde',
      items: courses.filter((c) => !c.subject_area?.trim()).map((c) => `${c.course_code} – ${c.course_name}`),
    });

    // Prereqs pointing to missing course
    const prereqMissingCourse = prereqs.filter((r) =>
      (r.requirement_type === 'completed_course' || r.requirement_type === 'attended_course' || r.requirement_type === 'completed_hp_in_course')
      && (!r.required_course_id || !courseById.has(r.required_course_id)),
    );
    result.push({
      key: 'prereq-missing-target',
      title: 'Förkunskapskrav saknar målkurs',
      description: 'Regler som pekar på en kurs-ID som inte finns i katalogen.',
      items: prereqMissingCourse.map((r) => {
        const target = courseById.get(r.target_course_id);
        return `${target?.course_code ?? r.target_course_id} → ${r.requirement_type} (${r.original_text ?? 'okänd'})`;
      }),
    });

    // Prereqs with missing required fields per type
    const badByType: string[] = [];
    for (const r of prereqs) {
      const target = courseById.get(r.target_course_id);
      const label = `${target?.course_code ?? r.target_course_id} (${r.requirement_type})`;
      switch (r.requirement_type) {
        case 'completed_course':
        case 'attended_course':
          if (!r.required_course_id) badByType.push(`${label}: saknar required_course_id`);
          break;
        case 'completed_hp_in_course':
          if (!r.required_course_id || !r.required_hp) badByType.push(`${label}: saknar kurs eller HP`);
          break;
        case 'completed_hp_in_subject':
          if (!r.required_subject_area || !r.required_hp) badByType.push(`${label}: saknar huvudområde eller HP`);
          break;
        case 'completed_total_hp':
          if (!r.required_hp) badByType.push(`${label}: saknar HP`);
          break;
        case 'custom_text':
          if (!r.original_text?.trim()) badByType.push(`${label}: tom fritext`);
          break;
      }
    }
    result.push({
      key: 'prereq-bad-fields',
      title: 'Förkunskapskrav med saknade fält',
      description: 'Obligatoriska fält som saknas givet requirement_type.',
      items: badByType,
    });

    // Programs with no courses
    const courseCountByProgram = new Map<string, number>();
    for (const r of pc) courseCountByProgram.set(r.program_id, (courseCountByProgram.get(r.program_id) ?? 0) + 1);
    result.push({
      key: 'empty-programs',
      title: 'Program utan kurser',
      items: programs.filter((p) => p.active && !courseCountByProgram.has(p.id)).map((p) => p.name),
    });

    // program_courses pointing to missing / inactive courses
    const pcBad: string[] = [];
    const programNameById = new Map(programs.map((p) => [p.id, p.name]));
    for (const r of pc) {
      const c = courseById.get(r.course_id);
      const prog = programNameById.get(r.program_id) ?? r.program_id;
      if (!c) pcBad.push(`${prog}: rad pekar på saknad kurs-ID ${r.course_id}`);
      else if (!c.active) pcBad.push(`${prog}: länkad till arkiverad kurs ${c.course_code}`);
    }
    result.push({
      key: 'pc-bad-course',
      title: 'Programkurser pekar på saknad/arkiverad kurs',
      items: pcBad,
    });

    // HP mismatch — only flag as error when mandatory > total, or mandatory + optional pool < total
    const hpAgg = new Map<string, { mandatory: number; optional: number }>();
    for (const r of pc) {
      const c = courseById.get(r.course_id);
      const cur = hpAgg.get(r.program_id) ?? { mandatory: 0, optional: 0 };
      const hp = Number(c?.hp ?? 0);
      if (r.mandatory) cur.mandatory += hp; else cur.optional += hp;
      hpAgg.set(r.program_id, cur);
    }
    const hpErrors: string[] = [];
    const hpInfo: string[] = [];
    for (const p of programs) {
      if (!p.active || p.total_hp == null) continue;
      const agg = hpAgg.get(p.id) ?? { mandatory: 0, optional: 0 };
      const total = Number(p.total_hp);
      const linked = agg.mandatory + agg.optional;
      const expectedOptional = Math.max(0, total - agg.mandatory);
      if (agg.mandatory > total) {
        hpErrors.push(`${p.name}: obligatoriska HP (${agg.mandatory}) överstiger programmets total (${total})`);
      } else if (agg.mandatory + agg.optional < total) {
        hpErrors.push(`${p.name}: obligatoriska (${agg.mandatory}) + valbar pool (${agg.optional}) = ${linked} HP räcker inte till ${total}`);
      } else if (linked > total && agg.optional > 0) {
        hpInfo.push(`${p.name}: ${agg.mandatory} HP obligatoriskt + ${agg.optional} HP valbar pool. Studenten behöver välja ${expectedOptional} HP valbart för att nå ${total}.`);
      } else if (linked !== total && agg.optional === 0) {
        hpErrors.push(`${p.name}: ${linked} HP länkade vs ${total} HP totalt (inga valbara kurser)`);
      }
    }
    result.push({
      key: 'hp-mismatch',
      title: 'HP-summa stämmer inte med programmets total',
      description: 'Endast fel när obligatoriska HP > total eller obligatoriska + valbar pool < total.',
      items: hpErrors,
    });
    result.push({
      key: 'hp-info',
      title: 'Program med valbar kurspool (informativt)',
      description: 'Total länkad HP överstiger programtotalen eftersom valbara kurser ingår som en pool.',
      items: hpInfo,
      tone: 'info',
    });

    // Year/semester sanity checks per program
    const yearSemesterIssues: string[] = [];
    for (const p of programs) {
      if (!p.active) continue;
      const lengthYears = p.total_hp != null && Number(p.total_hp) > 0
        ? Math.max(3, Math.ceil(Number(p.total_hp) / 60))
        : 5;
      const maxSemester = lengthYears * 2;
      const rows = pc.filter(r => r.program_id === p.id);
      for (const r of rows) {
        const c = courseById.get(r.course_id);
        const code = c?.course_code ?? r.course_id;
        if (r.year > lengthYears) {
          yearSemesterIssues.push(
            `${p.name}: ${code} placerad i år ${r.year} (programmet är ${lengthYears} år)`,
          );
        }
        // semester is a string in DB (e.g. "HT2024", "HT", "VT") — validate when "HTYYYY"/"VTYYYY"
        const sem = (r.semester ?? '').trim();
        const termMatch = sem.match(/^(HT|VT)\s*(\d{4})?$/i);
        if (termMatch) {
          const overallSem = (r.year - 1) * 2 + (termMatch[1].toUpperCase() === 'HT' ? 1 : 2);
          if (overallSem > maxSemester) {
            yearSemesterIssues.push(
              `${p.name}: ${code} → år ${r.year}/${sem} ger termin ${overallSem} (max ${maxSemester})`,
            );
          }
        }
      }
    }
    result.push({
      key: 'year-semester',
      title: 'Omöjlig år/termin-placering',
      description: 'Programkurser placerade utanför programmets längd (baserat på Total HP / 60).',
      items: yearSemesterIssues,
    });

    return result;
  }, [courses, programs, pc, prereqs]);

  const totalIssues = groups.reduce((s, g) => s + (g.tone === 'info' ? 0 : g.items.length), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {totalIssues === 0 ? (
            <><CheckCircle2 className="h-4 w-4 text-primary" /> Inga datakvalitetsproblem hittades.</>
          ) : (
            <><AlertTriangle className="h-4 w-4 text-destructive" /> {totalIssues} ärende{totalIssues === 1 ? '' : 'n'} hittade.</>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Uppdatera
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.map((g) => (
          <Card key={g.key} className={g.items.length > 0 && g.tone !== 'info' ? 'border-destructive/40' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{g.title}</span>
                <Badge variant={g.items.length > 0 && g.tone !== 'info' ? 'destructive' : 'secondary'}>{g.items.length}</Badge>
              </CardTitle>
              {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
            </CardHeader>
            <CardContent>
              {g.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Inga ärenden.</p>
              ) : (
                <ul className="text-xs space-y-1 max-h-60 overflow-y-auto">
                  {g.items.slice(0, 50).map((it, i) => (
                    <li key={`${it}-${i}`} className="font-mono break-words">{it}</li>
                  ))}
                  {g.items.length > 50 && (
                    <li className="text-muted-foreground italic">… och {g.items.length - 50} till</li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
