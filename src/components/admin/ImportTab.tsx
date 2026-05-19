import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import JsonImportCard from './JsonImportCard';

interface Stats {
  courses: number;
  programs: number;
  programLinks: number;
  prerequisites: number;
  withoutSubject: number;
  unstructured: number;
}

export default function ImportTab() {
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = async () => {
    const [c, p, pc, pr] = await Promise.all([
      supabase.from('courses_catalog').select('*', { count: 'exact', head: false }),
      supabase.from('programs_catalog').select('id', { count: 'exact', head: true }),
      supabase.from('program_courses').select('id', { count: 'exact', head: true }),
      supabase.from('course_prerequisites').select('target_course_id'),
    ]);
    const courses = (c.data ?? []) as Array<{ subject_area: string | null; original_prerequisite_text: string | null; id: string }>;
    const targets = new Set((pr.data ?? []).map((r) => (r as { target_course_id: string }).target_course_id));
    setStats({
      courses: courses.length,
      programs: p.count ?? 0,
      programLinks: pc.count ?? 0,
      prerequisites: (pr.data ?? []).length,
      withoutSubject: courses.filter((x) => !x.subject_area).length,
      unstructured: courses.filter((x) => x.original_prerequisite_text && !targets.has(x.id)).length,
    });
  };

  useEffect(() => { void loadStats(); }, []);

  const handleExport = async () => {
    const [c, p, pc, pr] = await Promise.all([
      supabase.from('courses_catalog').select('*'),
      supabase.from('programs_catalog').select('*'),
      supabase.from('program_courses').select('*'),
      supabase.from('course_prerequisites').select('*'),
    ]);
    const data = {
      exported_at: new Date().toISOString(),
      courses: c.data ?? [],
      programs: p.data ?? [],
      program_courses: pc.data ?? [],
      prerequisites: pr.data ?? [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bth-katalog-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Katalogstatistik</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? <p className="text-sm text-muted-foreground">Laddar…</p> : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <Stat label="Kurser" value={stats.courses} />
              <Stat label="Program" value={stats.programs} />
              <Stat label="Program-kurs-länkar" value={stats.programLinks} />
              <Stat label="Förkunskapsrader" value={stats.prerequisites} />
              <Stat label="Utan huvudområde" value={stats.withoutSubject} />
              <Stat label="Originaltext utan struktur" value={stats.unstructured} />
            </div>
          )}
          <div className="mt-3">
            <Button variant="outline" onClick={handleExport} className="gap-1">
              <Download className="h-4 w-4" /> Exportera hela katalogen som JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <JsonImportCard />
    </div>
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
