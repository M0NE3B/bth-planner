import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Archive, Plus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { archiveCourse, type CatalogCourse } from '@/lib/admin';
import CourseEditorSheet from './CourseEditorSheet';

interface CourseRow extends CatalogCourse {
  prereq_count: number;
}

export default function CourseCatalogTab() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [subject, setSubject] = useState<string>('all');
  const [onlyMissingHp, setOnlyMissingHp] = useState(false);
  const [onlyMissingSubject, setOnlyMissingSubject] = useState(false);
  const [prereqFilter, setPrereqFilter] = useState<'all' | 'structured' | 'manual' | 'none'>('all');
  const [editing, setEditing] = useState<CatalogCourse | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CourseRow | null>(null);
  const [manualByCourse, setManualByCourse] = useState<Map<string, { total: number; manual: number }>>(new Map());

  const load = async () => {
    setLoading(true);
    const [coursesRes, prereqRes] = await Promise.all([
      supabase.from('courses_catalog').select('*').order('course_code'),
      supabase.from('course_prerequisites').select('target_course_id, manual_review, requirement_type'),
    ]);
    if (coursesRes.error) {
      toast.error('Kunde inte ladda kurser');
      setLoading(false);
      return;
    }
    const counts = new Map<string, number>();
    const manualMap = new Map<string, { total: number; manual: number }>();
    for (const r of prereqRes.data ?? []) {
      const row = r as { target_course_id: string; manual_review: boolean; requirement_type: string };
      counts.set(row.target_course_id, (counts.get(row.target_course_id) ?? 0) + 1);
      const cur = manualMap.get(row.target_course_id) ?? { total: 0, manual: 0 };
      cur.total += 1;
      if (row.manual_review || row.requirement_type === 'custom_text') cur.manual += 1;
      manualMap.set(row.target_course_id, cur);
    }
    setManualByCourse(manualMap);
    setCourses((coursesRes.data ?? []).map((c) => ({
      ...(c as unknown as CatalogCourse),
      prereq_count: counts.get((c as { id: string }).id) ?? 0,
    })));
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const subjects = useMemo(() => {
    const s = new Set<string>();
    for (const c of courses) if (c.subject_area?.trim()) s.add(c.subject_area.trim());
    return Array.from(s).sort();
  }, [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (status === 'active' && !c.active) return false;
      if (status === 'archived' && c.active) return false;
      if (subject !== 'all' && (c.subject_area ?? '') !== subject) return false;
      if (onlyMissingHp && Number(c.hp) > 0) return false;
      if (onlyMissingSubject && (c.subject_area ?? '').trim()) return false;
      if (prereqFilter !== 'all') {
        const info = manualByCourse.get(c.id) ?? { total: 0, manual: 0 };
        if (prereqFilter === 'none' && info.total > 0) return false;
        if (prereqFilter === 'structured' && (info.total === 0 || info.total === info.manual)) return false;
        if (prereqFilter === 'manual' && (info.total === 0 || info.total !== info.manual)) return false;
      }
      if (!q) return true;
      return (
        c.course_code.toLowerCase().includes(q) ||
        c.course_name.toLowerCase().includes(q) ||
        (c.subject_area ?? '').toLowerCase().includes(q)
      );
    });
  }, [courses, search, status, subject, onlyMissingHp, onlyMissingSubject, prereqFilter, manualByCourse]);

  const summary = useMemo(() => {
    const total = courses.length;
    const active = courses.filter((c) => c.active).length;
    return {
      total,
      active,
      archived: total - active,
      missingHp: courses.filter((c) => !Number(c.hp)).length,
      missingSubject: courses.filter((c) => !(c.subject_area ?? '').trim()).length,
      withPrereqs: courses.filter((c) => c.prereq_count > 0).length,
      onlyManual: courses.filter((c) => {
        const i = manualByCourse.get(c.id);
        return i && i.total > 0 && i.total === i.manual;
      }).length,
    };
  }, [courses, manualByCourse]);

  const allCourses = useMemo(
    () => courses.map((c) => ({ id: c.id, course_code: c.course_code, course_name: c.course_name })),
    [courses],
  );

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveCourse(archiveTarget.id, !archiveTarget.active);
      toast.success(archiveTarget.active ? 'Kursen arkiverad' : 'Kursen återaktiverad');
      setArchiveTarget(null);
      void load();
    } catch (e) {
      toast.error('Kunde inte ändra status');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-xs">
        <SummaryStat label="Totalt" value={summary.total} />
        <SummaryStat label="Aktiva" value={summary.active} />
        <SummaryStat label="Arkiverade" value={summary.archived} />
        <SummaryStat label="Saknar HP" value={summary.missingHp} tone={summary.missingHp ? 'warn' : undefined} />
        <SummaryStat label="Saknar huvudområde" value={summary.missingSubject} tone={summary.missingSubject ? 'warn' : undefined} />
        <SummaryStat label="Med förkunskaper" value={summary.withPrereqs} />
        <SummaryStat label="Endast manuella" value={summary.onlyManual} tone={summary.onlyManual ? 'warn' : undefined} />
      </div>
      <div className="flex flex-col md:flex-row md:items-end gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök kod, namn eller huvudområde…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <Label className="text-xs">Huvudområde</Label>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla</SelectItem>
              {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-36">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'archived' | 'all')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktiva</SelectItem>
              <SelectItem value="archived">Arkiverade</SelectItem>
              <SelectItem value="all">Alla</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 px-2">
          <Switch id="m-hp" checked={onlyMissingHp} onCheckedChange={setOnlyMissingHp} />
          <Label htmlFor="m-hp" className="text-sm">Saknar HP</Label>
        </div>
        <div className="w-full md:w-48">
          <Label className="text-xs">Förkunskaper</Label>
          <Select value={prereqFilter} onValueChange={(v) => setPrereqFilter(v as 'all' | 'structured' | 'manual' | 'none')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla</SelectItem>
              <SelectItem value="structured">Strukturerade</SelectItem>
              <SelectItem value="manual">Endast manuella</SelectItem>
              <SelectItem value="none">Inga förkunskaper</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 px-2">
          <Switch id="m-sub" checked={onlyMissingSubject} onCheckedChange={setOnlyMissingSubject} />
          <Label htmlFor="m-sub" className="text-sm">Saknar område</Label>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setSheetOpen(true); }} className="gap-1">
          <Plus className="h-4 w-4" /> Ny kurs
        </Button>
      </div>


      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Kod</TableHead>
              <TableHead>Namn</TableHead>
              <TableHead className="hidden md:table-cell">Huvudområde</TableHead>
              <TableHead className="hidden md:table-cell">Nivå</TableHead>
              <TableHead className="w-16">HP</TableHead>
              <TableHead className="w-20">Förkrav</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">Laddar…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                {courses.length === 0 ? 'Katalogen är tom. Använd "Import & verktyg" för att importera från statiska mallar.' : 'Inga kurser matchar filtret.'}
              </TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditing(c); setSheetOpen(true); }}>
                <TableCell className="font-mono text-xs">{c.course_code}</TableCell>
                <TableCell>{c.course_name}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.subject_area ?? '–'}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.level ?? '–'}</TableCell>
                <TableCell className="text-sm">{c.hp}</TableCell>
                <TableCell className="text-sm">{c.prereq_count}</TableCell>
                <TableCell>
                  {c.active
                    ? <Badge variant="secondary">Aktiv</Badge>
                    : <Badge variant="outline">Arkiverad</Badge>}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost" size="icon" aria-label="Arkivera"
                    onClick={(e) => { e.stopPropagation(); setArchiveTarget(c); }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CourseEditorSheet
        open={sheetOpen}
        course={editing}
        allCourses={allCourses}
        onClose={() => setSheetOpen(false)}
        onSaved={() => void load()}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.active ? 'Arkivera kurs?' : 'Återaktivera kurs?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.active
                ? 'Kursen göms från standardvyer men finns kvar i databasen.'
                : 'Kursen visas igen i standardvyer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleArchive(); }}>
              Bekräfta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className={`rounded-md border p-2 ${tone === 'warn' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30'}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
