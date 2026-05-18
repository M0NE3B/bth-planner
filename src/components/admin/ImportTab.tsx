import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  importFromStaticTemplates, previewStaticImport, type ImportPreview, type ImportProgress,
} from '@/lib/admin';
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
  const [preview] = useState<ImportPreview>(() => previewStaticImport());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

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

  const handleImport = async () => {
    setConfirmOpen(false);
    setRunning(true);
    setProgress(null);
    try {
      const result = await importFromStaticTemplates(undefined, (p) => setProgress(p));
      toast.success(
        `Importerat: ${result.programs} program, ${result.uniqueCourses} kurser, ${result.programCourseLinks} länkar, ${result.prerequisites} förkunskaper`,
      );
      void loadStats();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'okänt fel';
      toast.error(`Importen misslyckades: ${msg}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

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
          <CardTitle className="text-base">Statistik</CardTitle>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importera från statiska mallar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Läser alla program från <code className="text-xs">src/lib/programs/*</code> och upsertar till databasen.
            Operationen är idempotent — kan köras flera gånger utan att skapa dubletter.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Program" value={preview.programs} />
            <Stat label="Unika kurser" value={preview.uniqueCourses} />
            <Stat label="Kurslänkar" value={preview.programCourseLinks} />
            <Stat label="Förkunskaper" value={preview.prerequisites} />
          </div>
          {progress && (
            <p className="text-xs text-muted-foreground italic">
              {progress.step} ({progress.done}/{progress.total})
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setConfirmOpen(true)} disabled={running} className="gap-1">
              <Upload className="h-4 w-4" /> {running ? 'Importerar…' : 'Importera nu'}
            </Button>
            <Button variant="outline" onClick={handleExport} className="gap-1">
              <Download className="h-4 w-4" /> Exportera JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importera från statiska mallar?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview.programs} program och {preview.uniqueCourses} unika kurser kommer att upsertas.
              Befintliga rader med samma kurskod/programnamn uppdateras. Förkunskapsrader ersätts per kurs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleImport(); }}>
              Starta import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
