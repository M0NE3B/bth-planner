import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  upsertProgram, archiveProgram, deleteProgram, upsertProgramCourse, removeProgramCourse,
  type CatalogCourse, type CatalogProgram, type CatalogProgramCourse,
} from '@/lib/admin';
import CourseCombobox from './CourseCombobox';

interface ProgramRow extends CatalogProgram {
  course_count: number;
  obligatorisk_hp: number;
}

interface PCRow extends CatalogProgramCourse {
  course: CatalogCourse;
}

export default function ProgramsTab() {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProgram, setActiveProgram] = useState<CatalogProgram | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHp, setNewHp] = useState<number | ''>('');
  const [archiveTarget, setArchiveTarget] = useState<ProgramRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgramRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [pRes, pcRes, cRes] = await Promise.all([
      supabase.from('programs_catalog').select('*').order('name'),
      supabase.from('program_courses').select('program_id, course_id'),
      supabase.from('courses_catalog').select('*').order('course_code'),
    ]);
    if (pRes.error || cRes.error) {
      toast.error('Kunde inte ladda program');
      setLoading(false); return;
    }
    const allCourses = (cRes.data ?? []) as unknown as CatalogCourse[];
    setCourses(allCourses);
    const courseById = new Map(allCourses.map((c) => [c.id, c]));
    const hpByProgram = new Map<string, { count: number; hp: number }>();
    for (const row of pcRes.data ?? []) {
      const pid = (row as { program_id: string }).program_id;
      const cid = (row as { course_id: string }).course_id;
      const cur = hpByProgram.get(pid) ?? { count: 0, hp: 0 };
      cur.count += 1;
      cur.hp += Number(courseById.get(cid)?.hp ?? 0);
      hpByProgram.set(pid, cur);
    }
    setPrograms((pRes.data ?? []).map((p) => {
      const stats = hpByProgram.get((p as { id: string }).id) ?? { count: 0, hp: 0 };
      return { ...(p as unknown as CatalogProgram), course_count: stats.count, obligatorisk_hp: stats.hp };
    }));
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Namn krävs'); return; }
    try {
      const p = await upsertProgram({ name: newName, total_hp: typeof newHp === 'number' ? newHp : null });
      toast.success('Program skapat');
      setNewOpen(false); setNewName(''); setNewHp('');
      await load();
      setActiveProgram(p);
    } catch (e) {
      toast.error('Kunde inte skapa program');
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveProgram(archiveTarget.id, !archiveTarget.active);
      toast.success(archiveTarget.active ? 'Programmet arkiverat' : 'Programmet återaktiverat');
      setArchiveTarget(null);
      void load();
    } catch (e) {
      toast.error('Kunde inte ändra status');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProgram(deleteTarget.id);
      toast.success('Programmet borttaget');
      setDeleteTarget(null);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(`Kunde inte ta bort programmet${msg ? `: ${msg}` : ''}`);
    }
  };

  if (activeProgram) {
    return (
      <ProgramDetail
        program={activeProgram}
        courses={courses}
        onBack={() => { setActiveProgram(null); void load(); }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{programs.length} program totalt</p>
        <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nytt program
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Namn</TableHead>
              <TableHead className="w-24">Kurser</TableHead>
              <TableHead className="w-28">Obl. HP</TableHead>
              <TableHead className="w-28">Total HP</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-44"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderProgramRows({
              loading,
              programs,
              onOpen: setActiveProgram,
              onArchive: setArchiveTarget,
              onDelete: setDeleteTarget,
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nytt program</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="p-name">Namn *</Label>
              <Input id="p-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-hp">Total HP</Label>
              <Input id="p-hp" type="number" value={newHp}
                onChange={(e) => setNewHp(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Avbryt</Button>
            <Button onClick={handleCreate}>Skapa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveTarget?.active ? 'Arkivera program?' : 'Återaktivera program?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.active ? 'Programmet göms från standardvyer.' : 'Programmet visas igen.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleArchive(); }}>Bekräfta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort programmet permanent?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{deleteTarget.name}</strong> tas bort helt från katalogen tillsammans med
                  alla {deleteTarget.course_count} program-kurs-länkar. Kurserna själva och
                  användardata (statusar, händelser, delmoment) påverkas inte.
                  <br /><br />
                  Den här åtgärden går inte att ångra. Vill du istället bara dölja programmet,
                  använd <em>Arkivera</em>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
            >
              Ta bort permanent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Detail editor ----------

function ProgramDetail({ program, courses, onBack }: { program: CatalogProgram; courses: CatalogCourse[]; onBack: () => void }) {
  const [rows, setRows] = useState<PCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(program.name);
  const [totalHp, setTotalHp] = useState<number | ''>(program.total_hp ?? '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [addYear, setAddYear] = useState<number>(1);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('program_courses')
      .select('*, course:courses_catalog(*)')
      .eq('program_id', program.id)
      .order('year').order('sort_order');
    if (error) { toast.error('Kunde inte ladda kurser'); setLoading(false); return; }
    setRows((data ?? []) as unknown as PCRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [program.id]);

  const courseOptions = useMemo(
    () => courses.map((c) => ({ id: c.id, course_code: c.course_code, course_name: c.course_name })),
    [courses],
  );

  const grouped = useMemo(() => {
    const map = new Map<number, PCRow[]>();
    for (const r of rows) {
      const list = map.get(r.year) ?? [];
      list.push(r); map.set(r.year, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [rows]);


  const stats = useMemo(() => {
    const linkedCourses = rows.length;
    const mandatoryRows = rows.filter((r) => r.mandatory);
    const optionalRows = rows.filter((r) => !r.mandatory);
    const mandatoryHp = mandatoryRows.reduce((s, r) => s + Number(r.course?.hp ?? 0), 0);
    const optionalHp = optionalRows.reduce((s, r) => s + Number(r.course?.hp ?? 0), 0);
    const totalLinkedHp = mandatoryHp + optionalHp;
    const activeCount = rows.filter((r) => r.course?.active).length;
    const inactiveCount = linkedCourses - activeCount;
    const total = typeof totalHp === 'number' ? totalHp : null;
    const expectedOptional = total != null ? Math.max(0, total - mandatoryHp) : null;
    let hpStatus: 'ok' | 'error' | 'info' | 'none' = 'none';
    let hpMessage = '';
    if (total != null && linkedCourses > 0) {
      if (mandatoryHp > total) {
        hpStatus = 'error';
        hpMessage = `Obligatoriska HP (${mandatoryHp}) överstiger programmets total (${total}).`;
      } else if (mandatoryHp + optionalHp < total) {
        hpStatus = 'error';
        hpMessage = `Obligatoriska (${mandatoryHp}) + valbar pool (${optionalHp}) = ${totalLinkedHp} HP räcker inte till ${total}.`;
      } else if (optionalHp > 0 && totalLinkedHp > total) {
        hpStatus = 'info';
        hpMessage = `Programmet har ${mandatoryHp} HP obligatoriskt och ${optionalHp} HP valbara kurser. Studenten behöver välja ${expectedOptional} HP valbart för att nå ${total} HP.`;
      } else if (optionalHp === 0 && mandatoryHp !== total) {
        hpStatus = 'error';
        hpMessage = `HP-summa (${mandatoryHp}) matchar inte programmets total (${total}).`;
      } else {
        hpStatus = 'ok';
      }
    }
    return { linkedCourses, mandatoryHp, optionalHp, totalLinkedHp, activeCount, inactiveCount, expectedOptional, hpStatus, hpMessage };
  }, [rows, totalHp]);

  const addCourse = async (year: number, courseId?: string) => {
    // Pick provided course, or first one in catalog (duplicates across placements are allowed).
    const chosen = courseId
      ? courses.find((c) => c.id === courseId)
      : (courses[0] ?? null);
    if (!chosen) { toast.error('Inga kurser i katalogen — importera eller skapa kurser först'); return; }
    try {
      await upsertProgramCourse({
        program_id: program.id,
        course_id: chosen.id,
        year,
        semester: null,
        mandatory: true,
        sort_order: rows.filter((r) => r.year === year).length,
      });
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(`Kunde inte lägga till kurs${msg ? `: ${msg}` : ''}`);
    }
  };


  const updateRow = async (row: PCRow, patch: Partial<CatalogProgramCourse>) => {
    try {
      await upsertProgramCourse({
        id: row.id, program_id: row.program_id, course_id: row.course_id,
        year: row.year, semester: row.semester, period: row.period,
        mandatory: row.mandatory, sort_order: row.sort_order, ...patch,
      });
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(`Kunde inte uppdatera kursen${msg ? `: ${msg}` : ''}`);
    }
  };

  const deleteRow = async (id: string) => {
    try { await removeProgramCourse(id); void load(); }
    catch { toast.error('Kunde inte ta bort kursen'); }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      await upsertProgram({
        id: program.id, name, total_hp: typeof totalHp === 'number' ? totalHp : null, active: program.active,
      });
      toast.success('Programmet uppdaterat');
    } catch { toast.error('Kunde inte spara'); }
    finally { setSavingMeta(false); }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till program
      </Button>

      <div className="rounded-md border border-border p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <Label htmlFor="pname">Programnamn</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="php">Total HP</Label>
            <Input id="php" type="number" value={totalHp}
              onChange={(e) => setTotalHp(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Totalt länkade HP: <strong className="text-foreground">{stats.totalLinkedHp}</strong>
            {stats.hpStatus === 'error' && (
              <span className="text-destructive ml-2">(avviker från total HP)</span>
            )}
          </span>
          <Button size="sm" onClick={saveMeta} disabled={savingMeta}>{savingMeta ? 'Sparar…' : 'Spara'}</Button>
        </div>
      </div>

      <div className="rounded-md border border-border p-3">
        <h3 className="font-semibold text-sm mb-2">Programstatistik</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          <Stat label="Programtotal" value={typeof totalHp === 'number' ? `${totalHp} HP` : '–'} />
          <Stat label="Obligatoriska HP" value={`${stats.mandatoryHp} HP`} />
          <Stat label="Valbar kurspool" value={`${stats.optionalHp} HP`} />
          <Stat
            label="Valbara HP som behövs"
            value={stats.expectedOptional != null ? `${stats.expectedOptional} HP` : '–'}
          />
          <Stat label="Totalt länkade HP" value={`${stats.totalLinkedHp} HP`} />
          <Stat label="Länkade kurser" value={stats.linkedCourses} />
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Aktiva kurser" value={stats.activeCount} />
          <Stat label="Arkiverade" value={stats.inactiveCount} tone={stats.inactiveCount > 0 ? 'warn' : undefined} />
        </div>
        <div className="mt-3 space-y-1 text-xs">
          {stats.linkedCourses === 0 && (
            <p className="text-destructive">⚠ Programmet har inga länkade kurser.</p>
          )}
          {stats.hpStatus === 'error' && (
            <p className="text-destructive">⚠ {stats.hpMessage}</p>
          )}
          {stats.hpStatus === 'info' && (
            <p className="text-muted-foreground">ℹ {stats.hpMessage}</p>
          )}
          {stats.inactiveCount > 0 && (
            <p className="text-destructive">⚠ {stats.inactiveCount} länkade kurser är arkiverade/saknas.</p>
          )}
        </div>
      </div>


      <div className="rounded-md border border-border p-3 flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">År</Label>
          <Input type="number" min={1} max={6} className="w-20" value={addYear}
            onChange={(e) => setAddYear(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} />
        </div>
        <Button size="sm" onClick={() => addCourse(addYear)} className="gap-1">
          <Plus className="h-4 w-4" /> Lägg till kurs i År {addYear}
        </Button>
        <p className="text-xs text-muted-foreground ml-auto">
          Tips: byt kurs i raden efter att den lagts till. Samma kurs kan länkas till flera placeringar (t.ex. valbara kurser).
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laddar kurser…</p>
      ) : grouped.length === 0 ? (
        <div className="text-center py-6 space-y-3 border border-dashed border-border rounded-md">
          <p className="text-sm text-muted-foreground">Inga kurser länkade ännu. Använd verktyget ovan för att lägga till.</p>
        </div>
      ) : grouped.map(([year, list]) => {
        return (
          <div key={year} className="rounded-md border border-border">
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex justify-between items-center">
              <span className="font-semibold text-sm">År {year}</span>
              <Button variant="outline" size="sm" onClick={() => addCourse(year)} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Lägg till kurs
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px]">Kurs</TableHead>
                    <TableHead className="w-20">År</TableHead>
                    <TableHead className="w-24">Obl.</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <CourseCombobox
                          value={r.course_id}
                          options={courseOptions}
                          onChange={(id) => id && updateRow(r, { course_id: id })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={1} max={6} value={r.year}
                          onChange={(e) => updateRow(r, { year: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={r.mandatory} onCheckedChange={(v) => updateRow(r, { mandatory: v })} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteRow(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}

    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-heading text-lg ${tone === 'warn' ? 'text-destructive' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}
