import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, ChevronRight, Search, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bthPrograms } from '@/lib/programs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { estimateStudyYear } from '@/lib/studyYear';
import {
  fetchPrograms, fetchProgramCourses,
  type CatalogProgram, type CatalogProgramCourse, type CatalogCourse,
} from '@/lib/catalog';

interface ProgramSetupPageProps {
  userId: string;
  onComplete: () => void;
}

interface ProgramOption {
  /** Stable key for selection. */
  key: string;
  name: string;
  /** Total HP (from catalog or computed from static template). */
  totalHp: number | null;
  /** Number of courses (catalog only — informational). */
  courseCount: number;
  source: 'catalog' | 'static';
  /** Catalog program id (when source === 'catalog'). */
  catalogId?: string;
  /** Static template index (when source === 'static'). */
  staticIndex?: number;
}

export default function ProgramSetupPage({ userId, onComplete }: ProgramSetupPageProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [startYear, setStartYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [catalogPrograms, setCatalogPrograms] = useState<CatalogProgram[] | null>(null);
  const [catalogCourseCounts, setCatalogCourseCounts] = useState<Map<string, number>>(new Map());

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  // Load programs from catalog; fall back to static templates if catalog empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const progs = await fetchPrograms();
        if (cancelled) return;
        setCatalogPrograms(progs);
        if (progs.length > 0) {
          const { data: pcRows } = await supabase.from('program_courses').select('program_id');
          if (cancelled) return;
          const counts = new Map<string, number>();
          for (const r of (pcRows ?? []) as { program_id: string }[]) {
            counts.set(r.program_id, (counts.get(r.program_id) ?? 0) + 1);
          }
          setCatalogCourseCounts(counts);
        }
      } catch {
        if (!cancelled) setCatalogPrograms([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const options = useMemo<ProgramOption[]>(() => {
    // Prefer catalog if populated.
    if (catalogPrograms && catalogPrograms.length > 0) {
      return catalogPrograms
        .filter(p => p.active)
        .map(p => ({
          key: `cat:${p.id}`,
          name: p.name,
          totalHp: p.total_hp != null ? Number(p.total_hp) : null,
          courseCount: catalogCourseCounts.get(p.id) ?? 0,
          source: 'catalog' as const,
          catalogId: p.id,
        }));
    }
    // Static fallback
    return bthPrograms.map((p, i) => ({
      key: `static:${i}`,
      name: p.name,
      totalHp: p.courses.reduce((s, c) => s + c.hp, 0),
      courseCount: p.courses.length,
      source: 'static' as const,
      staticIndex: i,
    }));
  }, [catalogPrograms, catalogCourseCounts]);

  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
  const selectedOption = options.find(o => o.key === selected) ?? null;

  const handleContinue = async () => {
    if (!selectedOption || !startYear) {
      toast.error('Välj program och startår');
      return;
    }

    setLoading(true);
    try {
      const startYearNum = Number.parseInt(startYear, 10);

      // Safety: never overwrite an existing study plan.
      const { data: existing } = await supabase
        .from('user_courses').select('id').eq('user_id', userId).limit(1);
      if (existing && existing.length > 0) {
        // Just update profile, do not recreate plan.
        await supabase.from('profiles').update({
          program_name: selectedOption.name,
          start_year: startYearNum,
          setup_complete: true,
        }).eq('user_id', userId);
        toast.success('Program valt! Befintlig studieplan bibehållen.');
        onComplete();
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          program_name: selectedOption.name,
          start_year: startYearNum,
          setup_complete: true,
        })
        .eq('user_id', userId);
      if (profileError) throw profileError;

      let coursesToInsert: Array<{
        user_id: string;
        course_code: string;
        course_name: string;
        year: number;
        hp: number;
        status: 'not_started';
        catalog_course_id?: string | null;
      }> = [];

      if (selectedOption.source === 'catalog' && selectedOption.catalogId) {
        try {
          const rows = await fetchProgramCourses(selectedOption.catalogId);
          // Seed all mandatory courses for the entire program (all years).
          // Electives are opt-in via the elective list per year.
          coursesToInsert = rows
            .filter(r => r.mandatory && r.course)
            .map((r: CatalogProgramCourse & { course: CatalogCourse }) => ({
              user_id: userId,
              course_code: r.course.course_code,
              course_name: r.course.course_name,
              year: r.year,
              hp: Number(r.course.hp) || 0,
              status: 'not_started' as const,
              catalog_course_id: r.course.id,
            }));
        } catch {
          // fall through to static fallback below
        }
      }

      // Fallback: static template by name (all years)
      if (coursesToInsert.length === 0) {
        const tmpl = bthPrograms.find(p => p.name === selectedOption.name)
          ?? (selectedOption.staticIndex != null ? bthPrograms[selectedOption.staticIndex] : null);
        if (tmpl) {
          coursesToInsert = tmpl.courses.map(c => ({
            user_id: userId,
            course_code: c.code,
            course_name: c.name,
            year: c.year,
            hp: c.hp,
            status: 'not_started' as const,
          }));
        }
      }

      if (coursesToInsert.length > 0) {
        const { error: coursesError } = await supabase
          .from('user_courses')
          .insert(coursesToInsert);
        if (coursesError) throw coursesError;
      }

      toast.success('Program valt!');
      onComplete();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Något gick fel';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="container py-6 flex items-center gap-2">
        <GraduationCap className="h-7 w-7 text-primary" />
        <span className="font-heading font-bold text-xl text-foreground">BTH Studieplanerare</span>
      </header>

      <main className="container max-w-2xl py-8 animate-slide-up">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-2">Välj ditt program</h2>
        <p className="text-muted-foreground mb-6">Välj ditt BTH-program och det år du började studera.</p>

        <div className="mb-2">
          <Label>Startår *</Label>
          <Select value={startYear} onValueChange={setStartYear}>
            <SelectTrigger>
              <SelectValue placeholder="Välj startår..." />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Startåret används för att uppskatta vilket studieår du går i och för att upptäcka
              kurser som kan spärras av ej avklarade förkunskapskrav.
            </span>
          </p>
        </div>

        {selectedOption && startYear && (() => {
          const est = estimateStudyYear(Number.parseInt(startYear, 10));
          const semesterLabel = est.semester === 1 ? 'HT' : 'VT';
          const studyYearLabel = est.uncertain ? est.label : `År ${est.year} (${semesterLabel})`;
          return (
            <Card className="mb-4 border-primary/40 bg-primary/5">
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-semibold text-foreground">{selectedOption.name}</p>
                <div className="text-xs text-muted-foreground grid grid-cols-2 gap-y-1">
                  <span>Startår</span><span className="text-foreground text-right">HT {startYear}</span>
                  <span>Uppskattat studieår</span>
                  <span className="text-foreground text-right">{studyYearLabel}</span>
                  <span>Antal kurser</span>
                  <span className="text-foreground text-right">{selectedOption.courseCount}</span>
                  <span>Totalt HP</span>
                  <span className="text-foreground text-right">
                    {selectedOption.totalHp != null ? `${selectedOption.totalHp} HP` : '–'}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök program..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 mb-4">
          {filtered.map((p) => (
            <Card
              key={p.key}
              onClick={() => setSelected(p.key)}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selected === p.key ? 'ring-2 ring-primary bg-secondary' : ''
              }`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.courseCount} kurser{p.totalHp != null ? ` · ${p.totalHp} HP` : ''}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selected === p.key ? 'border-primary bg-primary' : 'border-muted-foreground'
                }`}>
                  {selected === p.key && (
                    <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          size="lg"
          onClick={handleContinue}
          disabled={!selectedOption || !startYear || loading}
          className="w-full gap-2 text-base"
        >
          {loading ? 'Sparar...' : 'Fortsätt'} <ChevronRight className="h-4 w-4" />
        </Button>
      </main>
    </div>
  );
}
