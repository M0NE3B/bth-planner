import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CatalogCourse, CatalogPrerequisite, RequirementType } from '@/lib/catalog';
import PrereqLogicPreview from './PrereqLogicPreview';

const TYPES: { value: RequirementType | 'all'; label: string }[] = [
  { value: 'all', label: 'Alla typer' },
  { value: 'completed_course', label: 'Avklarad kurs' },
  { value: 'attended_course', label: 'Deltagit i kurs' },
  { value: 'completed_hp_in_course', label: 'HP i kurs' },
  { value: 'completed_hp_in_subject', label: 'HP i huvudområde' },
  { value: 'completed_total_hp', label: 'Total HP' },
  { value: 'completed_hp_in_program_group', label: 'HP i programgrupp' },
  { value: 'completed_hp_in_course_group', label: 'HP i kursgrupp' },
  { value: 'completed_hp_at_level', label: 'HP på nivå' },
  { value: 'custom_text', label: 'Fritext' },
];

export default function PrerequisitesTab() {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [rows, setRows] = useState<CatalogPrerequisite[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<RequirementType | 'all'>('all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [onlyManual, setOnlyManual] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from('courses_catalog').select('*'),
      supabase.from('course_prerequisites').select('*'),
    ]);
    if (c.error || p.error) { toast.error('Kunde inte ladda'); setLoading(false); return; }
    setCourses((c.data ?? []) as unknown as CatalogCourse[]);
    setRows((p.data ?? []) as unknown as CatalogPrerequisite[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== 'all' && r.requirement_type !== type) return false;
      if (onlyCustom && r.requirement_type !== 'custom_text') return false;
      if (onlyManual && !r.manual_review) return false;
      if (onlyMissing) {
        const needsCourse = r.requirement_type === 'completed_course'
          || r.requirement_type === 'attended_course'
          || r.requirement_type === 'completed_hp_in_course';
        const missingTarget = !courseById.has(r.target_course_id);
        const missingReq = needsCourse && (!r.required_course_id || !courseById.has(r.required_course_id));
        if (!missingTarget && !missingReq) return false;
      }
      if (q) {
        const t = courseById.get(r.target_course_id);
        const req = r.required_course_id ? courseById.get(r.required_course_id) : null;
        const hay = `${t?.course_code ?? ''} ${t?.course_name ?? ''} ${req?.course_code ?? ''} ${r.original_text ?? ''} ${r.required_subject_area ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, courseById, search, type, onlyMissing, onlyCustom, onlyManual]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Förkunskapskraven redigeras manuellt per kurs i fliken <strong>Kurskatalog</strong> – öppna en kurs och justera dess regler. Endast krav som rör programmets egna kurser visas för studenten; gymnasie- och grundbehörighet filtreras bort automatiskt.
      </p>

      <PrereqLogicPreview courses={courses} rows={rows} />




      <div className="flex flex-col md:flex-row md:items-end gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Sök kurs, fritext, huvudområde…" className="pl-8"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full md:w-56">
          <Label className="text-xs">Typ</Label>
          <Select value={type} onValueChange={(v) => setType(v as RequirementType | 'all')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 px-2">
          <Switch id="only-custom" checked={onlyCustom} onCheckedChange={setOnlyCustom} />
          <Label htmlFor="only-custom" className="text-sm">Endast fritext</Label>
        </div>
        <div className="flex items-center gap-2 px-2">
          <Switch id="only-missing" checked={onlyMissing} onCheckedChange={setOnlyMissing} />
          <Label htmlFor="only-missing" className="text-sm">Endast saknade</Label>
        </div>
        <div className="flex items-center gap-2 px-2">
          <Switch id="only-manual" checked={onlyManual} onCheckedChange={setOnlyManual} />
          <Label htmlFor="only-manual" className="text-sm">Endast manuella</Label>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} av {rows.length} regler</p>

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Målkurs</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Kräver</TableHead>
              <TableHead className="w-24">HP</TableHead>
              <TableHead>Fritext</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Laddar…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Inga regler matchar.</TableCell></TableRow>
            ) : filtered.map((r) => {
              const t = courseById.get(r.target_course_id);
              const req = r.required_course_id ? courseById.get(r.required_course_id) : null;
              const missingTarget = !t;
              const needsCourse = r.requirement_type === 'completed_course'
                || r.requirement_type === 'attended_course'
                || r.requirement_type === 'completed_hp_in_course';
              const missingReq = needsCourse && !req;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {missingTarget ? <Badge variant="destructive">saknas</Badge> : `${t.course_code}`}
                  </TableCell>
                  <TableCell className="text-xs">{r.requirement_type}</TableCell>
                  <TableCell className="text-xs">
                    {needsCourse
                      ? (missingReq ? <Badge variant="destructive">saknas</Badge> : req?.course_code)
                      : r.required_subject_area ?? '–'}
                  </TableCell>
                  <TableCell className="text-xs">{r.required_hp ?? '–'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">{r.original_text ?? '–'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
