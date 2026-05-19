import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  upsertCourse,
  replacePrerequisites,
  type CatalogCourse,
  type PrerequisiteInput,
} from '@/lib/admin';
import { supabase } from '@/integrations/supabase/client';
import PrerequisiteRow from './PrerequisiteRow';
import type { CourseOption } from './CourseCombobox';

interface Props {
  open: boolean;
  course: CatalogCourse | null;
  allCourses: CourseOption[];
  onClose: () => void;
  onSaved: () => void;
}

interface ProgramLink { id: string; name: string; year: number; semester: string | null }


export default function CourseEditorSheet({ open, course, allCourses, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    course_code: '',
    course_name: '',
    hp: 6,
    subject_area: '',
    level: '',
    original_prerequisite_text: '',
    active: true,
  });
  const [prereqs, setPrereqs] = useState<PrerequisiteInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [programs, setPrograms] = useState<ProgramLink[]>([]);


  useEffect(() => {
    if (!open) return;
    // Load distinct subject areas for the combobox
    supabase.from('courses_catalog').select('subject_area').then(({ data }) => {
      const s = new Set<string>();
      for (const r of data ?? []) {
        const v = (r as { subject_area: string | null }).subject_area?.trim();
        if (v) s.add(v);
      }
      setSubjects(Array.from(s).sort());
    });
    if (course) {
      // Load programs this course belongs to
      supabase
        .from('program_courses')
        .select('year, semester, programs_catalog!inner(id, name)')
        .eq('course_id', course.id)
        .then(({ data }) => {
          const rows = (data ?? []).map((r) => {
            const row = r as unknown as { year: number; semester: string | null; programs_catalog: { id: string; name: string } };
            return { id: row.programs_catalog.id, name: row.programs_catalog.name, year: row.year, semester: row.semester };
          });
          setPrograms(rows);
        });
    } else {
      setPrograms([]);
    }
    if (course) {
      setForm({
        course_code: course.course_code,
        course_name: course.course_name,
        hp: Number(course.hp),
        subject_area: course.subject_area ?? '',
        level: course.level ?? '',
        original_prerequisite_text: course.original_prerequisite_text ?? '',
        active: course.active,
      });
      supabase
        .from('course_prerequisites')
        .select('*')
        .eq('target_course_id', course.id)
        .then(({ data }) => {
          setPrereqs(
            (data ?? []).map((r) => {
              const row = r as unknown as {
                requirement_type: PrerequisiteInput['requirement_type'];
                required_course_id: string | null;
                required_hp: number | string | null;
                required_subject_area: string | null;
                original_text: string | null;
                logic_group: number | null;
                required_level?: string | null;
                course_group_name?: string | null;
                allowed_program_groups?: string[] | null;
                allowed_course_codes?: string[] | null;
                manual_review?: boolean | null;
                group_operator?: 'AND' | 'OR' | null;
              };
              return {
                requirement_type: row.requirement_type,
                required_course_id: row.required_course_id,
                required_hp: row.required_hp != null ? Number(row.required_hp) : null,
                required_subject_area: row.required_subject_area,
                original_text: row.original_text,
                logic_group: row.logic_group,
                required_level: row.required_level ?? null,
                course_group_name: row.course_group_name ?? null,
                allowed_program_groups: row.allowed_program_groups ?? null,
                allowed_course_codes: row.allowed_course_codes ?? null,
                manual_review: !!row.manual_review,
                group_operator: row.group_operator ?? null,
              };
            }),
          );
        });
    } else {
      setForm({
        course_code: '',
        course_name: '',
        hp: 6,
        subject_area: '',
        level: '',
        original_prerequisite_text: '',
        active: true,
      });
      setPrereqs([]);
    }
  }, [open, course]);

  const handleSave = async () => {
    if (!form.course_code.trim() || !form.course_name.trim()) {
      toast.error('Kurskod och kursnamn krävs');
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertCourse({
        id: course?.id,
        course_code: form.course_code,
        course_name: form.course_name,
        hp: Number(form.hp) || 0,
        subject_area: form.subject_area,
        level: form.level,
        original_prerequisite_text: form.original_prerequisite_text,
        active: form.active,
      });
      await replacePrerequisites(saved.id, prereqs);
      toast.success(course ? 'Kursen är uppdaterad' : 'Kursen är skapad');
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Något gick fel';
      toast.error(`Kunde inte spara: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">{course ? 'Redigera kurs' : 'Ny kurs'}</SheetTitle>
          <SheetDescription>
            Fält märkta med * krävs. Förkunskaper redigeras längst ner.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="code">Kurskod *</Label>
              <Input id="code" value={form.course_code}
                onChange={(e) => setForm({ ...form, course_code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label htmlFor="hp">HP *</Label>
              <Input id="hp" type="number" min={0} step={0.5} value={form.hp}
                onChange={(e) => setForm({ ...form, hp: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <Label htmlFor="name">Kursnamn *</Label>
            <Input id="name" value={form.course_name}
              onChange={(e) => setForm({ ...form, course_name: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="subj">Huvudområde</Label>
              <Input id="subj" placeholder="t.ex. Matematik" value={form.subject_area} list="subject-suggestions"
                onChange={(e) => setForm({ ...form, subject_area: e.target.value })} />
              <datalist id="subject-suggestions">
                {subjects.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <Label htmlFor="lvl">Nivå</Label>
              <Input id="lvl" placeholder="t.ex. G1F, A1N" value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })} />
            </div>
          </div>

          <div>
            <Label htmlFor="orig">Original förkunskapstext</Label>
            <Textarea id="orig" rows={2} value={form.original_prerequisite_text}
              onChange={(e) => setForm({ ...form, original_prerequisite_text: e.target.value })} />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Aktiv</p>
              <p className="text-xs text-muted-foreground">Avaktiverade kurser döljs som standard.</p>
            </div>
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>

          {course && (
            <div className="rounded-md border border-border p-3 space-y-1">
              <p className="text-sm font-medium">Ingår i program</p>
              {programs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Inte länkad till något program.</p>
              ) : (
                <ul className="text-xs space-y-0.5">
                  {programs.map((p, i) => (
                    <li key={`${p.id}-${i}`} className="text-muted-foreground">
                      <span className="text-foreground">{p.name}</span> — år {p.year}{p.semester ? `, ${p.semester}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}


          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-heading text-sm font-semibold">Förkunskapskrav</h3>
              <Button
                type="button" variant="outline" size="sm" className="gap-1"
                onClick={() => setPrereqs([...prereqs, { requirement_type: 'completed_course' }])}
              >
                <Plus className="h-3.5 w-3.5" /> Lägg till
              </Button>
            </div>
            {prereqs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Inga förkunskapskrav definierade.</p>
            ) : (
              <div className="space-y-2">
                {prereqs.map((p, i) => (
                  <PrerequisiteRow
                    key={i}
                    row={p}
                    courses={allCourses}
                    onChange={(next) => {
                      const copy = [...prereqs]; copy[i] = next; setPrereqs(copy);
                    }}
                    onRemove={() => setPrereqs(prereqs.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Avbryt</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Sparar…' : 'Spara'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
