import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, Clock, Plus, Target, CalendarDays, BookOpen, TrendingUp, Pencil, Save, X, RotateCcw, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, differenceInHours, isToday, isTomorrow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { bthPrograms } from '@/lib/programs';
import RiskOverview from '@/components/RiskOverview';
import EventFormFields from '@/components/EventFormFields';
import { EVENT_TYPE_LABEL as TYPE_LABEL, EVENT_STATUS_LABEL as STATUS_LABEL, COURSE_STATUS_LABEL, parseHpInput } from '@/lib/events';
import { useCatalogPrereqs } from '@/lib/useCatalogPrereqs';
import { computeHpUnlockMap, computeUnlockBonus, type UnlockEntry } from '@/lib/hpUnlock';
import { resolveSubject, type EvalContext } from '@/lib/prerequisites';
import { formatHp } from '@/lib/utils';

interface DashboardProps {
  userId: string;
  totalProgramHp?: number;
  programName?: string | null;
  startYear?: number | null;
}

interface StudyEvent {
  id: string;
  title: string;
  course_code: string | null;
  event_type: string;
  due_date: string;
  due_time: string | null;
  description: string | null;
  status: string;
  hp: number | null;
}

interface CourseData {
  id: string;
  status: string;
  hp: number;
  year: number;
  course_code?: string;
  course_name?: string;
}

interface LinkedSubtask {
  id: string;
  course_id: string;
  event_id: string | null;
  hp: number;
  completed: boolean;
}


export default function Dashboard({ userId, totalProgramHp, startYear }: DashboardProps) {
  const [events, setEvents] = useState<StudyEvent[]>([]);
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [subtasks, setSubtasks] = useState<LinkedSubtask[]>([]);
  const [programName, setProgramName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StudyEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metricDetail, setMetricDetail] = useState<null | 'thisWeek' | 'nextWeek' | 'completed' | 'total'>(null);

  // edit form state
  const [fTitle, setFTitle] = useState('');
  const [fCourse, setFCourse] = useState('');
  const [fType, setFType] = useState('assignment');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fHp, setFHp] = useState('');
  const [fStatus, setFStatus] = useState('upcoming');

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    const [eventsRes, coursesRes, subtasksRes, profileRes] = await Promise.all([
      supabase.from('study_events').select('*').eq('user_id', userId).order('due_date', { ascending: true }),
      supabase.from('user_courses').select('id, status, hp, year, course_code, course_name').eq('user_id', userId),
      supabase.from('course_subtasks').select('id, course_id, event_id, hp, completed').eq('user_id', userId),
      supabase.from('profiles').select('program_name').eq('user_id', userId).maybeSingle(),
    ]);

    if (eventsRes.data) setEvents(eventsRes.data as StudyEvent[]);
    if (coursesRes.data) setCourses(coursesRes.data as CourseData[]);
    if (subtasksRes.data) setSubtasks(subtasksRes.data as LinkedSubtask[]);
    if (profileRes.data?.program_name) setProgramName(profileRes.data.program_name);
    setLoading(false);
  };

  const catalog = useCatalogPrereqs();

  // Build map: courseCode -> array of courses it blocks. Catalog first, fallback to template.
  const blockingMap = useMemo(() => {
    const map = new Map<string, { code: string; year: number; semester?: 'HT' | 'VT' }[]>();
    // Only count blockers that actually exist in the student's plan
    const planCodes = new Set(courses.map(c => c.course_code).filter(Boolean) as string[]);
    const yearByCode = new Map(courses.filter(c => c.course_code).map(c => [c.course_code as string, c.year]));
    // Catalog
    if (catalog.blocksByCode.size > 0) {
      for (const [pre, targets] of catalog.blocksByCode) {
        for (const code of targets) {
          if (!planCodes.has(code)) continue;
          const arr = map.get(pre) || [];
          if (!arr.some(x => x.code === code)) arr.push({ code, year: yearByCode.get(code) ?? 99 });
          map.set(pre, arr);
        }
      }
    }
    if (!programName) return map;
    const program = bthPrograms.find(p => p.name === programName);
    if (!program) return map;
    program.courses.forEach(c => {
      (c.prerequisites || []).forEach(pre => {
        if (!planCodes.has(c.code)) return;
        const arr = map.get(pre) || [];
        if (!arr.some(x => x.code === c.code)) arr.push({ code: c.code, year: c.year, semester: c.semester });
        map.set(pre, arr);
      });
    });
    return map;
  }, [programName, catalog, courses]);

  // Evaluation context for typed HP requirements (subject from catalog, subtasks by course_code).
  const evalContext: EvalContext = useMemo(() => {
    const courseIdToCode = new Map(courses.map(c => [c.id, c.course_code || '']));
    const subjectOf = (code: string): string | null => {
      const cat = catalog.courseByCode.get(code.toUpperCase());
      return cat?.subject_area ?? resolveSubject(code).primary;
    };
    return {
      courses: courses
        .filter(c => c.course_code)
        .map(c => ({
          course_code: c.course_code as string,
          status: c.status,
          hp: Number(c.hp) || 0,
          subject: subjectOf(c.course_code as string),
        })),
      subtasks: subtasks
        .map(s => ({
          course_code: courseIdToCode.get(s.course_id) || '',
          completed: s.completed,
          hp: Number(s.hp) || 0,
        }))
        .filter(s => s.course_code),
    };
  }, [courses, subtasks, catalog]);

  // HP-based unlock map: source code → unmet HP targets it contributes toward.
  const unlockMap = useMemo(() => {
    if (catalog.requirementsByCode.size === 0) return new Map<string, UnlockEntry[]>();
    const planCodes = new Set(courses.map(c => c.course_code).filter(Boolean) as string[]);
    const yearByCode = new Map(courses.filter(c => c.course_code).map(c => [c.course_code as string, c.year]));
    const subjectByCode = new Map<string, string>();
    for (const code of planCodes) {
      const cat = catalog.courseByCode.get(code.toUpperCase());
      if (cat?.subject_area) subjectByCode.set(code, cat.subject_area);
    }
    return computeHpUnlockMap({
      requirementsByCode: catalog.requirementsByCode,
      evalContext,
      planCodes,
      subjectByCode,
      yearByCode,
    });
  }, [catalog, courses, evalContext]);




  // Avoid double counting: completed courses count full HP; for non-completed
  // courses, count completed delmoment HP as "partly" (capped by course HP).
  const completedSubHpByCourse = new Map<string, number>();
  for (const s of subtasks) {
    if (s.completed && Number(s.hp) > 0) {
      completedSubHpByCourse.set(s.course_id, (completedSubHpByCourse.get(s.course_id) || 0) + Number(s.hp));
    }
  }
  let completedHp = 0;
  let partlyHp = 0;
  for (const c of courses) {
    if (c.status === 'completed') {
      completedHp += c.hp;
    } else {
      const subDone = completedSubHpByCourse.get(c.id) || 0;
      if (subDone > 0) partlyHp += Math.min(c.hp, subDone);
    }
  }
  const totalHp = totalProgramHp || courses.reduce((sum, c) => sum + c.hp, 0);
  // Fold partly-completed delmoment HP into the main completed number
  const displayedCompletedHp = Math.round((completedHp + partlyHp) * 10) / 10;
  const progressPercent = totalHp > 0 ? Math.round((displayedCompletedHp / totalHp) * 100) : 0;

  const courseStats = {
    total: courses.length,
    completed: courses.filter(c => c.status === 'completed').length,
    partly: courses.filter(c => c.status === 'partly').length,
  };

  // Show all program years (1..N) so a 5-year program always shows År 1–5
  const programYears = totalProgramHp ? Math.max(1, Math.round(totalProgramHp / 60)) : 0;
  const yearsFromCourses = [...new Set(courses.map(c => c.year))];
  const maxYear = Math.max(programYears, ...yearsFromCourses, 1);
  const years = Array.from({ length: maxYear }, (_, i) => i + 1);
  const hpByYear = years.map(year => {
    const yearCourses = courses.filter(c => c.year === year);
    return {
      year,
      completed: yearCourses.filter(c => c.status === 'completed').reduce((s, c) => s + c.hp, 0),
      total: yearCourses.reduce((s, c) => s + c.hp, 0),
    };
  });

  const now = new Date();
  const upcomingEvents = events.filter(e => e.status !== 'complete' && new Date(e.due_date) >= now);

  // Helpers used by both scoring and reasons
  const getHpForEvent = (event: StudyEvent): number => {
    if (event.hp && event.hp > 0) return Number(event.hp);
    const linked = subtasks.find(s => s.event_id === event.id);
    return linked ? Number(linked.hp) : 0;
  };

  // Type weights: exam > assignment > lab > seminar/lecture/other
  const TYPE_WEIGHT: Record<string, number> = {
    exam: 30, assignment: 20, lab: 12, seminar: 2, lecture: 2, other: 2,
  };

  const scoreEvent = (event: StudyEvent): number => {
    const due = new Date(`${event.due_date}T${event.due_time || '23:59'}`);
    const h = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    let score = 0;
    // Deadline proximity (dominant signal)
    if (h < 0) score += 120;
    else if (h < 24) score += 100;
    else if (h < 72) score += 70;
    else if (h < 168) score += 50;
    else if (h < 336) score += 30;
    else score += 10;
    // Type weight (strong tie-breaker at same deadline; max diff exam↔lab = 18)
    score += TYPE_WEIGHT[event.event_type] ?? 2;
    // HP / scope — capped so it can't flip exam vs lab at same deadline
    const hp = getHpForEvent(event);
    score += Math.min(hp * 2, 12);
    // Current year = lowest year with non-completed courses (proxy for "where the student is").
    const currentYear = Math.min(...courses.filter(c => c.status !== 'completed').map(c => c.year), 99);
    const blockedTargets = new Set<string>();
    // Blocking course bonus — higher when the blocked course is current/upcoming
    if (event.course_code) {
      const blocked = blockingMap.get(event.course_code) || [];
      if (blocked.length > 0) {
        for (const b of blocked) blockedTargets.add(b.code);
        const minYear = Math.min(...blocked.map(b => b.year));
        if (minYear <= currentYear) score += 16; // current/already-blocked
        else if (minYear === currentYear + 1) score += 10; // upcoming
        else score += 4; // future
      }
    }
    // HP-unlock bonus (typed HP requirements) — only for unmet requirements,
    // capped so it can't dominate deadline/type signals.
    if (event.course_code) {
      const { bonus } = computeUnlockBonus(unlockMap.get(event.course_code), {
        currentYear,
        eventHasHp: hp > 0,
        excludeTargets: blockedTargets,
      });
      score += bonus;
    }
    // Linked subtask not done
    const sub = subtasks.find(s => s.event_id === event.id);
    if (sub && !sub.completed) score += 3;
    return score;
  };

  const FOCUS_TYPES = new Set(['exam', 'assignment', 'lab']);
  const focusEvents = upcomingEvents
    .filter(e => {
      if (FOCUS_TYPES.has(e.event_type)) return true;
      // seminar/lecture/other only if HP > 0 or linked to a course moment
      if (getHpForEvent(e) > 0) return true;
      return false;
    })
    .map(e => ({ event: e, score: scoreEvent(e) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = new Date(`${a.event.due_date}T${a.event.due_time || '23:59'}`).getTime();
      const db = new Date(`${b.event.due_date}T${b.event.due_time || '23:59'}`).getTime();
      if (da !== db) return da - db;
      return (TYPE_WEIGHT[b.event.event_type] ?? 0) - (TYPE_WEIGHT[a.event.event_type] ?? 0);
    })
    .map(x => x.event);

  const thisWeekEvents = upcomingEvents.filter(e => {
    const diff = (new Date(e.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });
  const nextWeekEvents = upcomingEvents.filter(e => {
    const diff = (new Date(e.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 7 && diff <= 14;
  });
  const thisWeek = thisWeekEvents.length;
  const nextWeek = nextWeekEvents.length;
  const completedCourses = courses.filter(c => c.status === 'completed');
  const partlyCoursesAll = courses.filter(c => c.status === 'partly');
  const notStartedCoursesAll = courses.filter(c => c.status === 'not_started');

  const toggleStatus = async () => {
    if (!selected) return;
    const newStatus = selected.status === 'complete' ? 'upcoming' : 'complete';
    setSaving(true);
    const { error } = await supabase.from('study_events').update({ status: newStatus }).eq('id', selected.id);
    setSaving(false);
    if (error) { toast.error('Kunde inte uppdatera status'); return; }
    // Sync linked subtask
    const linkedSubtask = subtasks.find(s => s.event_id === selected.id);
    if (linkedSubtask) {
      await supabase.from('course_subtasks').update({ completed: newStatus === 'complete' }).eq('id', linkedSubtask.id);
      setSubtasks(prev => prev.map(s => s.id === linkedSubtask.id ? { ...s, completed: newStatus === 'complete' } : s));
    }
    setEvents(prev => prev.map(e => e.id === selected.id ? { ...e, status: newStatus } : e));
    setSelected({ ...selected, status: newStatus });
    toast.success(newStatus === 'complete' ? 'Markerad som klar' : 'Markerad som kommande');
  };

  const beginEdit = () => {
    if (!selected) return;
    setFTitle(selected.title);
    setFCourse(selected.course_code || '');
    setFType(selected.event_type);
    setFDate(selected.due_date);
    setFTime(selected.due_time || '');
    setFDesc(selected.description || '');
    setFHp(selected.hp && selected.hp > 0 ? String(selected.hp) : '');
    setFStatus(selected.status);
    setEditing(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!fTitle.trim() || !fDate) { toast.error('Fyll i alla obligatoriska fält'); return; }
    const hpParsed = parseHpInput(fHp);
    if (hpParsed.ok === false) { toast.error(hpParsed.error); return; }
    const hpValue = hpParsed.value;
    setSaving(true);
    const updates = {
      title: fTitle.trim(),
      course_code: fCourse || null,
      event_type: fType,
      due_date: fDate,
      due_time: fTime || null,
      description: fDesc.trim() || null,
      hp: hpValue,
      status: fStatus,
    };
    const { error } = await supabase.from('study_events').update(updates).eq('id', selected.id);
    if (error) { setSaving(false); toast.error('Kunde inte spara ändringar'); return; }
    // Sync linked subtask
    const linkedSubtask = subtasks.find(s => s.event_id === selected.id);
    if (linkedSubtask) {
      const subUpdates: Record<string, unknown> = {
        title: updates.title,
        due_date: updates.due_date,
        hp: updates.hp,
        type: updates.event_type,
        completed: updates.status === 'complete',
      };
      await supabase.from('course_subtasks').update(subUpdates).eq('id', linkedSubtask.id);
      setSubtasks(prev => prev.map(s => s.id === linkedSubtask.id
        ? { ...s, hp: updates.hp, completed: updates.status === 'complete' }
        : s));
    }
    setSaving(false);
    const updated = { ...selected, ...updates };
    setEvents(prev => prev.map(ev => ev.id === selected.id ? updated : ev));
    setSelected(updated);
    setEditing(false);
    toast.success('Händelse uppdaterad');
  };

  const typeColor: Record<string, string> = {
    assignment: 'bg-info text-info-foreground',
    lab: 'bg-success text-success-foreground',
    exam: 'bg-destructive text-destructive-foreground',
    seminar: 'bg-primary text-primary-foreground',
    lecture: 'bg-muted text-foreground',
  };

  const getEventHp = getHpForEvent;

  const hoursUntil = (event: StudyEvent) =>
    differenceInHours(new Date(`${event.due_date}T${event.due_time || '23:59'}`), now);

  // Build short label for blocking, e.g. "Hjälper dig uppfylla förkunskap till X"
  const codeName = (code: string) => catalog.codeToName.get(code) || courses.find(c => c.course_code === code)?.course_name || undefined;
  const fmtC = (code: string) => {
    const n = codeName(code);
    return n ? `${n} (${code})` : code;
  };
  const getBlockingLabel = (courseCode: string | null): string | null => {
    if (!courseCode) return null;
    const blocked = blockingMap.get(courseCode);
    if (!blocked || blocked.length === 0) return null;
    const first = blocked[0];
    const userCourse = courses.find(c => c.course_code === courseCode);
    const soon = userCourse ? first.year >= userCourse.year : false;
    const more = blocked.length > 1 ? ` (+${blocked.length - 1} till)` : '';
    return soon
      ? `Hjälper dig uppfylla förkunskap till ${fmtC(first.code)}${more}`
      : `Låser upp ${fmtC(first.code)}${more}`;
  };

  // HP-baserad unlock-etikett (typade HP-krav). Returnerar kort + detaljerad lista.
  const getHpUnlockLabels = (courseCode: string | null): { short: string | null; details: string[] } => {
    if (!courseCode) return { short: null, details: [] };
    const entries = unlockMap.get(courseCode);
    if (!entries || entries.length === 0) return { short: null, details: [] };
    const blocked = new Set((blockingMap.get(courseCode) || []).map(b => b.code));
    const usable = entries.filter(e => !blocked.has(e.target));
    if (usable.length === 0) return { short: null, details: [] };
    // Rank: hp_in_course > hp_in_subject > total_hp, then earlier year first.
    const kindRank = { hp_in_course: 0, hp_in_subject: 1, total_hp: 2 } as const;
    usable.sort((a, b) =>
      kindRank[a.kind] - kindRank[b.kind] || a.targetYear - b.targetYear,
    );
    const labelFor = (e: typeof usable[number]): string => {
      if (e.kind === 'hp_in_course') return `Bidrar till HP-krav i ${fmtC(e.target)}`;
      if (e.kind === 'hp_in_subject') return `Bidrar till HP-krav inom huvudområde för ${fmtC(e.target)}`;
      return `Räknas mot totalt HP-krav för ${fmtC(e.target)}`;
    };
    const details = Array.from(new Set(usable.map(labelFor)));
    const more = details.length > 1 ? ` (+${details.length - 1} till)` : '';
    return { short: `${labelFor(usable[0])}${more}`, details };
  };

  // Short, single-line reason for the card — matches ranking
  const getShortReason = (event: StudyEvent): string | null => {
    const h = hoursUntil(event);
    const hp = getEventHp(event);
    const course = event.course_code;
    const blocking = getBlockingLabel(course);
    const hpUnlock = getHpUnlockLabels(course);

    if (h < 0) return course ? `Försenad deadline i ${course}` : 'Försenad deadline';

    if (event.event_type === 'exam') {
      if (h < 168) return course ? `Tenta snart i ${course}` : 'Tenta snart';
      return course ? `Tenta i ${course}` : 'Tenta';
    }
    if (blocking) return blocking;
    if (hpUnlock.short) return hpUnlock.short;
    if (event.event_type === 'assignment') {
      if (h < 72) return course ? `Uppgift med deadline snart i ${course}` : 'Uppgift med deadline snart';
      if (hp >= 3) return course ? `Större uppgift (${hp} HP) i ${course}` : `Större uppgift (${hp} HP)`;
      return course ? `Uppgift i ${course}` : 'Uppgift';
    }
    if (event.event_type === 'lab') {
      if (h < 72) return course ? `Labb snart i ${course}` : 'Labb snart';
      return course ? `Labb i ${course}` : 'Labb';
    }
    if (hp > 0) return course ? `${hp} HP i ${course}` : `${hp} HP`;
    if (h < 24) return 'Deadline inom 24h';
    if (h < 168) return course ? `Deadline denna vecka i ${course}` : 'Deadline denna vecka';
    return course ? `Kommande i ${course}` : null;
  };

  // Detailed bullet reasons for modal — match actual ranking factors
  const getDetailedReasons = (event: StudyEvent): string[] => {
    const reasons: string[] = [];
    const h = hoursUntil(event);
    const hp = getEventHp(event);
    const linkedSubtask = subtasks.find(s => s.event_id === event.id);
    const blocking = getBlockingLabel(event.course_code);

    // Deadline
    if (h < 0) reasons.push('Deadline har passerat');
    else if (h < 24) reasons.push('Deadline är snart – mindre än ett dygn kvar');
    else if (h < 72) reasons.push('Deadline är snart – inom 3 dagar');
    else if (h < 168) reasons.push('Deadline inom en vecka');

    // Type ranking explanation
    if (event.event_type === 'exam') reasons.push('Tenta – viktigt att hinna plugga inför');
    else if (event.event_type === 'assignment') reasons.push('Uppgift som behöver lämnas in');
    else if (event.event_type === 'lab') reasons.push('Labb kräver förberedelse');
    else if (event.event_type === 'seminar') reasons.push('Seminarium – bra att förbereda sig inför');
    else if (event.event_type === 'lecture') reasons.push('Föreläsning att hålla koll på');

    if (event.course_code) reasons.push(`Kopplad till kursen ${event.course_code}`);
    if (hp > 0) reasons.push(`${hp} HP gör momentet större`);
    if (blocking) reasons.push(blocking);
    for (const r of getHpUnlockLabels(event.course_code).details) reasons.push(r);
    if (linkedSubtask && !linkedSubtask.completed) reasons.push('Kopplad till ett kursmoment som inte är avklarat');
    if (event.status && event.status !== 'complete') reasons.push('Inte avklarad ännu');
    return reasons;
  };

  const formatDueLabel = (dueDate: string, dueTime: string | null) => {
    const due = new Date(`${dueDate}T${dueTime || '23:59'}`);
    const hours = differenceInHours(due, now);
    if (hours < 0) return 'Försenad!';
    if (hours < 24) return `${hours}h kvar`;
    if (isToday(due)) return 'Idag';
    if (isTomorrow(due)) return 'Imorgon';
    return format(due, 'EEE d MMM', { locale: sv });
  };

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground">Laddar...</div>;
  }

  return (
    <div className="space-y-6 md:mt-12 animate-slide-up">
      {/* HP Progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-heading">
            <TrendingUp className="h-5 w-5 text-primary" />
            Studieframsteg
            <InfoPopover label="Så beräknas studieframsteg">
              Studieframsteg visar hur många HP du har tjänat ihop av programmets totala HP. Avklarade delmoment med HP räknas in i framsteget, men dubbelräknas inte om hela kursen är avklarad.
            </InfoPopover>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-3xl font-heading font-bold text-foreground">{formatHp(displayedCompletedHp)} <span className="text-lg text-muted-foreground font-normal">/ {formatHp(totalHp)} HP</span></span>
              <span className="text-sm font-semibold text-primary">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </div>

          {hpByYear.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {hpByYear.map(({ year, completed, total }) => (
                <div key={year} className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">År {year}</p>
                  <p className="font-heading font-bold text-sm text-foreground">{formatHp(completed)}/{formatHp(total)}</p>
                  <Progress value={total > 0 ? (completed / total) * 100 : 0} className="h-1.5 mt-1" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snabbstatistik */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricButton
          icon={<CalendarDays className="h-8 w-8 text-info" />}
          value={thisWeek}
          label="Denna vecka"
          onClick={() => setMetricDetail('thisWeek')}
        />
        <MetricButton
          icon={<Clock className="h-8 w-8 text-muted-foreground" />}
          value={nextWeek}
          label="Nästa vecka"
          onClick={() => setMetricDetail('nextWeek')}
        />
        <MetricButton
          icon={<CheckCircle2 className="h-8 w-8 text-success" />}
          value={courseStats.completed}
          label="Avklarade kurser"
          onClick={() => setMetricDetail('completed')}
        />
        <MetricButton
          icon={<BookOpen className="h-8 w-8 text-primary" />}
          value={courseStats.total}
          label="Totalt kurser"
          onClick={() => setMetricDetail('total')}
        />
      </div>

      {/* Fokus näst */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 font-heading">
              <Target className="h-5 w-5 text-primary" />
              Fokusera härnäst
              <InfoPopover label="Så prioriteras fokuslistan">
                Fokusera härnäst prioriterar kommande tentor, uppgifter och labbar baserat på deadline, omfattning/HP, kurskoppling och risk för spärrar.
              </InfoPopover>
            </CardTitle>
            <Link to="/add-event">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Lägg till händelse
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {focusEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Inga kommande händelser. Lägg till händelser för att se dina prioriteringar!
            </p>
          ) : (
            focusEvents.slice(0, 5).map((event, i) => {
              const h = hoursUntil(event);
              const urgent = h < 24 && h >= 0;
              const hp = getEventHp(event);
              const shortReason = getShortReason(event);
              return (
                <button
                  type="button"
                  key={event.id}
                  onClick={() => setSelected(event)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    urgent ? 'border-destructive/30 bg-destructive/5' : 'border-border'
                  }`}
                >
                  <span className="font-heading font-bold text-lg text-muted-foreground w-6 shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {urgent && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                      <span className="font-semibold text-sm text-foreground">{event.title}</span>
                      <Badge className={`${typeColor[event.event_type] || 'bg-muted text-muted-foreground'} text-xs`}>
                        {TYPE_LABEL[event.event_type] || event.event_type}
                      </Badge>
                      {hp > 0 && (
                        <Badge variant="outline" className="text-xs">{formatHp(hp)} HP</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>📅 {formatDueLabel(event.due_date, event.due_time)}</span>
                      {event.course_code && <span>• {event.course_code}</span>}
                    </div>
                    {shortReason && (
                      <p className="text-xs text-primary/90 mt-1.5 font-medium truncate">
                        {shortReason}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Riskbild & rekommendationer */}
      <RiskOverview
        courses={courses.map(c => ({
          course_code: c.course_code || '',
          course_name: c.course_name,
          year: c.year,
          status: c.status,
          hp: c.hp,
        })).filter(c => c.course_code)}
        programName={programName}
        startYear={startYear ?? null}
        compact
        upcomingEventsCount={upcomingEvents.length}
        unfinishedSubtasksCount={subtasks.filter(s => !s.completed).length}
        catalog={catalog}
        subtasks={subtasks.map(s => ({
          course_id: s.course_id,
          course_code: courses.find(c => c.id === s.course_id)?.course_code,
          completed: s.completed,
          hp: Number(s.hp) || 0,
        }))}
      />


      {/* Detail modal */}
      <MetricDetailDialog
        kind={metricDetail}
        onClose={() => setMetricDetail(null)}
        thisWeekEvents={thisWeekEvents}
        nextWeekEvents={nextWeekEvents}
        completedCourses={completedCourses}
        partlyCourses={partlyCoursesAll}
        notStartedCourses={notStartedCoursesAll}
        totalCount={courseStats.total}
        getEventHp={getHpForEvent}
      />

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setEditing(false); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {selected && !editing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading pr-6">{selected.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="secondary">{TYPE_LABEL[selected.event_type] || selected.event_type}</Badge>
                  {selected.course_code && <Badge variant="outline">{selected.course_code}</Badge>}
                  {getEventHp(selected) > 0 && (
                    <Badge variant="outline">{getEventHp(selected)} HP</Badge>
                  )}
                  <Badge variant={selected.status === 'complete' ? 'default' : 'secondary'}>
                    {STATUS_LABEL[selected.status] || selected.status}
                  </Badge>
                  {subtasks.some(s => s.event_id === selected.id) && (
                    <Badge variant="outline">🔗 Kopplad till delmoment</Badge>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Datum: </span>
                  <span className="font-medium">
                    {format(new Date(selected.due_date), 'EEEE d MMMM yyyy', { locale: sv })}
                  </span>
                </div>
                {selected.due_time && (
                  <div>
                    <span className="text-muted-foreground">Tid: </span>
                    <span className="font-medium">{selected.due_time.slice(0, 5)}</span>
                  </div>
                )}
                {selected.description && (
                  <div className="pt-2">
                    <p className="text-muted-foreground mb-1">Beskrivning</p>
                    <p className="whitespace-pre-wrap">{selected.description}</p>
                  </div>
                )}

                <div className="pt-3 border-t mt-3">
                  <p className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> Varför prioriterad?
                  </p>
                  {(() => {
                    const reasons = getDetailedReasons(selected);
                    if (reasons.length === 0) {
                      return <p className="text-muted-foreground text-xs">Ingen särskild prioriteringsfaktor – händelsen visas i kronologisk ordning.</p>;
                    }
                    return (
                      <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                        {reasons.map(r => <li key={r}>{r}</li>)}
                      </ul>
                    );
                  })()}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button onClick={toggleStatus} disabled={saving} className="gap-2">
                  {selected.status === 'complete'
                    ? (<><RotateCcw className="h-4 w-4" /> Markera kommande</>)
                    : (<><CheckCircle2 className="h-4 w-4" /> Markera klar</>)}
                </Button>
                <Button variant="outline" onClick={beginEdit} className="gap-2">
                  <Pencil className="h-4 w-4" /> Redigera
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)}>Stäng</Button>
              </DialogFooter>
            </>
          )}

          {selected && editing && (
            <form onSubmit={saveEdit} className="space-y-3">
              <DialogHeader>
                <DialogTitle className="font-heading">Redigera händelse</DialogTitle>
              </DialogHeader>
              <EventFormFields
                idPrefix="d"
                courses={courses
                  .filter(c => c.course_code && c.course_name)
                  .map(c => ({ course_code: c.course_code!, course_name: c.course_name! }))}
                fTitle={fTitle} setFTitle={setFTitle}
                fCourse={fCourse} setFCourse={setFCourse}
                fType={fType} setFType={setFType}
                fDate={fDate} setFDate={setFDate}
                fTime={fTime} setFTime={setFTime}
                fHp={fHp} setFHp={setFHp}
                fDesc={fDesc} setFDesc={setFDesc}
                fStatus={fStatus} setFStatus={setFStatus}
              />
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)} className="gap-2">
                  <X className="h-4 w-4" /> Avbryt
                </Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" /> {saving ? 'Sparar...' : 'Spara'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoPopover({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 text-sm">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function MetricButton({
  icon, value, label, onClick,
}: { icon: React.ReactNode; value: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border bg-card hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </button>
  );
}

interface MetricDetailDialogProps {
  kind: null | 'thisWeek' | 'nextWeek' | 'completed' | 'total';
  onClose: () => void;
  thisWeekEvents: StudyEvent[];
  nextWeekEvents: StudyEvent[];
  completedCourses: CourseData[];
  partlyCourses: CourseData[];
  notStartedCourses: CourseData[];
  totalCount: number;
  getEventHp: (e: StudyEvent) => number;
}

function MetricDetailDialog({
  kind, onClose, thisWeekEvents, nextWeekEvents,
  completedCourses, partlyCourses, notStartedCourses, totalCount, getEventHp,
}: MetricDetailDialogProps) {
  const open = kind !== null;
  let title = '';
  let body: React.ReactNode = null;

  if (kind === 'thisWeek' || kind === 'nextWeek') {
    const list = kind === 'thisWeek' ? thisWeekEvents : nextWeekEvents;
    title = kind === 'thisWeek' ? 'Denna vecka' : 'Nästa vecka';
    body = list.length === 0 ? (
      <p className="text-sm text-muted-foreground">Inga händelser i denna period.</p>
    ) : (
      <ul className="space-y-2">
        {list.map(e => {
          const hp = getEventHp(e);
          return (
            <li key={e.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-sm text-foreground">{e.title}</span>
                <Badge variant="secondary" className="text-xs">{TYPE_LABEL[e.event_type] || e.event_type}</Badge>
                {hp > 0 && <Badge variant="outline" className="text-xs">{hp} HP</Badge>}
                <Badge variant={e.status === 'complete' ? 'default' : 'secondary'} className="text-xs">
                  {STATUS_LABEL[e.status] || e.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(e.due_date), 'EEE d MMM yyyy', { locale: sv })}
                {e.due_time ? ` · ${e.due_time.slice(0,5)}` : ''}
                {e.course_code ? ` · ${e.course_code}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    );
  } else if (kind === 'completed') {
    title = 'Avklarade kurser';
    body = completedCourses.length === 0 ? (
      <p className="text-sm text-muted-foreground">Inga avklarade kurser ännu.</p>
    ) : (
      <ul className="space-y-2">
        {completedCourses.map(c => (
          <li key={c.id} className="rounded-md border p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-foreground">{c.course_code}</span>
              <Badge variant="outline" className="text-xs">{c.hp} HP</Badge>
              <Badge variant="outline" className="text-xs">År {c.year}</Badge>
            </div>
            {c.course_name && <p className="text-sm text-muted-foreground mt-1">{c.course_name}</p>}
          </li>
        ))}
      </ul>
    );
  } else if (kind === 'total') {
    title = 'Totalt kurser';
    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Avklarade" value={completedCourses.length} />
          <StatTile label="Påbörjade" value={partlyCourses.length} />
          <StatTile label="Ej påbörjade" value={notStartedCourses.length} />
        </div>
        <p className="text-sm text-muted-foreground">
          Totalt {totalCount} kurser i din studieplan.
        </p>
        <Link to="/courses">
          <Button variant="outline" size="sm" className="w-full">Gå till kurser</Button>
        </Link>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-2xl font-heading font-bold text-foreground leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
