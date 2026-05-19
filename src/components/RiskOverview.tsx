import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldAlert, BookOpen, Lock, Info, Sparkles } from 'lucide-react';
import { bthPrograms } from '@/lib/programs';
import { estimateStudyYear } from '@/lib/studyYear';
import { COURSE_STATUS_LABEL } from '@/lib/events';
import {
  evaluateCourseRequirements, normalizeRequirements,
  type CourseRequirement, type RequirementResult, resolveSubject,
} from '@/lib/prerequisites';
import { isGymnasiumRequirement, type CatalogPrereqIndex } from '@/lib/useCatalogPrereqs';

interface CourseRow {
  course_code: string;
  course_name?: string;
  year: number;
  status: string;
  hp?: number;
}

interface SubtaskRow { course_id: string; course_code?: string; completed: boolean; hp: number; }

interface RiskOverviewProps {
  courses: CourseRow[];
  programName: string | null;
  startYear: number | null;
  compact?: boolean;
  upcomingEventsCount?: number;
  unfinishedSubtasksCount?: number;
  catalog?: CatalogPrereqIndex;
  subtasks?: SubtaskRow[];
}

function fmt(code: string, name?: string | null) {
  return name ? `${name} (${code})` : code;
}

export default function RiskOverview({
  courses, programName, startYear, compact = true,
  upcomingEventsCount = 0, unfinishedSubtasksCount = 0,
  catalog, subtasks = [],
}: RiskOverviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [metric, setMetric] = useState<null | 'overdue' | 'missing' | 'blocked' | 'atrisk'>(null);

  const programTemplate = useMemo(
    () => (programName ? bthPrograms.find(p => p.name === programName) : null),
    [programName],
  );

  // Build a unified requirements map: catalog first, fall back to template.
  const requirementsByCode = useMemo<Map<string, CourseRequirement[]>>(() => {
    const m = new Map<string, CourseRequirement[]>();
    if (programTemplate) {
      for (const c of programTemplate.courses) {
        const reqs = normalizeRequirements(c).filter(r => !isGymnasiumRequirement(r));
        if (reqs.length) m.set(c.code, reqs);
      }
    }
    if (catalog) {
      for (const [code, reqs] of catalog.requirementsByCode) {
        const filtered = reqs.filter(r => !isGymnasiumRequirement(r));
        if (filtered.length > 0) m.set(code, filtered);
      }
    }
    return m;
  }, [programTemplate, catalog]);


  // Name map combining template + catalog + user courses
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    if (programTemplate) for (const c of programTemplate.courses) m.set(c.code, c.name);
    if (catalog) for (const [code, name] of catalog.codeToName) m.set(code, name);
    for (const c of courses) if (c.course_name) m.set(c.course_code, c.course_name);
    return m;
  }, [programTemplate, catalog, courses]);

  const nameOf = (code: string) => nameMap.get(code);

  const courseByCode = useMemo(() => {
    const m = new Map<string, CourseRow>();
    for (const c of courses) m.set(c.course_code, c);
    return m;
  }, [courses]);

  const courseIdToCode = useMemo(() => {
    const m = new Map<string, string>();
    // subtasks pass either course_id or course_code; we accept both via SubtaskRow
    for (const c of courses as Array<CourseRow & { id?: string }>) {
      if (c.id) m.set(c.id, c.course_code);
    }
    return m;
  }, [courses]);

  // EvalContext for catalog/template requirement evaluation
  const evalContext = useMemo(() => ({
    courses: courses.map(c => ({
      course_code: c.course_code,
      status: c.status,
      hp: Number(c.hp ?? 0),
      subject: resolveSubject(c.course_code).primary,
    })),
    subtasks: subtasks.map(s => ({
      course_code: s.course_code ?? courseIdToCode.get(s.course_id) ?? '',
      completed: s.completed,
      hp: Number(s.hp) || 0,
    })),
  }), [courses, subtasks, courseIdToCode]);

  const estimate = startYear ? estimateStudyYear(startYear) : null;
  const currentStudyYear = estimate?.year ?? 1;

  // 1. Ej avklarade kurser (previous/current years not completed)
  const overdueCourses = courses.filter(
    c => c.year <= currentStudyYear && c.status !== 'completed',
  );

  // Evaluate each not-completed-not-partly course's requirements
  type Analysis = {
    course: CourseRow;
    results: RequirementResult[];
    hardUnmet: RequirementResult[];
  };

  const analyses: Analysis[] = useMemo(() => courses
    .filter(c => c.status !== 'completed')
    .map(c => {
      const reqs = requirementsByCode.get(c.course_code);
      if (!reqs || reqs.length === 0) {
        return { course: c, results: [], hardUnmet: [] };
      }
      const r = evaluateCourseRequirements(
        { code: c.course_code, requirements: reqs },
        evalContext,
        { nameMap },
      );
      // All remaining requirements are automatic — anything unmet is a real blocker.
      const hardUnmet = r.unmet;
      return { course: c, results: r.results, hardUnmet };
    }), [courses, requirementsByCode, evalContext, nameMap]);

  // 2. Saknade förkunskaper — all unique missing rules (across all not-completed courses)
  type MissingItem = { key: string; req: CourseRequirement; result: RequirementResult; affects: Set<string> };
  const missingMap = new Map<string, MissingItem>();
  for (const a of analyses) {
    for (const r of a.hardUnmet) {
      const key = ruleKey(r.requirement);
      const item = missingMap.get(key) ?? { key, req: r.requirement, result: r, affects: new Set() };
      item.affects.add(a.course.course_code);
      missingMap.set(key, item);
    }
  }
  const missingList = Array.from(missingMap.values());

  // 3. Spärrade kurser — kurser som redan skulle ha lästs (år ≤ aktuellt studieår)
  // men där förkunskaper saknades, så studenten inte fick gå dem. Påbörjade
  // kurser räknas inte (då har studenten faktiskt gått kursen, ev. med dispens).
  const blockedAnalyses = analyses.filter(a =>
    a.course.status === 'not_started'
    && a.course.year <= currentStudyYear
    && a.hardUnmet.length > 0,
  );
  // 4. Riskerar att spärras — framtida kurser där förkunskaper saknas just nu.
  const atRiskAnalyses = analyses.filter(a =>
    a.course.status === 'not_started'
    && a.course.year > currentStudyYear
    && a.hardUnmet.length > 0,
  );

  // Build action-oriented recommendations.
  type Rec = { key: string; text: string; helper: string; priority: number };
  const recs: Rec[] = [];

  // Priority 1: redan spärrade kurser (år ≤ aktuellt år, ej påbörjade)
  const currentBlocked = blockedAnalyses;
  // Priority 2: framtida kurser som riskerar att spärras nästa år
  const upcomingBlocked = atRiskAnalyses.filter(a => a.course.year === currentStudyYear + 1);

  // Group recommendations by the requirement that unlocks things
  type RecGroup = { req: CourseRequirement; result: RequirementResult; affects: { code: string; year: number }[]; minYear: number };
  const recGroups = new Map<string, RecGroup>();
  const addGroup = (a: Analysis) => {
    for (const r of a.hardUnmet) {
      const key = ruleKey(r.requirement);
      const g = recGroups.get(key) ?? { req: r.requirement, result: r, affects: [], minYear: Infinity };
      if (!g.affects.some(x => x.code === a.course.course_code)) {
        g.affects.push({ code: a.course.course_code, year: a.course.year });
      }
      if (a.course.year < g.minYear) g.minYear = a.course.year;
      recGroups.set(key, g);
    }
  };
  for (const a of currentBlocked) addGroup(a);
  for (const a of upcomingBlocked) addGroup(a);

  const sortedGroups = Array.from(recGroups.values()).sort((a, b) => a.minYear - b.minYear || b.affects.length - a.affects.length);
  for (const g of sortedGroups.slice(0, 3)) {
    const unlocks = g.affects.slice(0, 2).map(x => fmt(x.code, nameOf(x.code))).join(', ');
    const more = g.affects.length > 2 ? ` +${g.affects.length - 2}` : '';
    recs.push({
      key: `g-${g.req.type}-${recGroups.size}-${recs.length}`,
      text: focusText(g.req, g.result, nameOf),
      helper: `Låser upp ${unlocks}${more}`,
      priority: g.minYear <= currentStudyYear ? 0 : 1,
    });
  }

  // Fallback: no blockers
  if (recs.length === 0) {
    const partlyCourses = courses.filter(c => c.status === 'partly');
    if (partlyCourses.length > 0) {
      const sample = partlyCourses.slice(0, 2).map(c => fmt(c.course_code, c.course_name)).join(', ');
      recs.push({ key: 'fb-active', text: 'Slutför dina påbörjade kurser', helper: sample, priority: 5 });
    }
    if (upcomingEventsCount > 0) {
      recs.push({ key: 'fb-deadlines', text: 'Fokusera på kommande deadlines', helper: 'Se "Fokusera härnäst" för nästa steg.', priority: 6 });
    } else if (unfinishedSubtasksCount > 0) {
      recs.push({ key: 'fb-sub', text: 'Slutför påbörjade kursmoment', helper: `${unfinishedSubtasksCount} oavklarade kursmoment att jobba med.`, priority: 6 });
    }
    if (recs.length === 0) {
      recs.push({ key: 'fb-allgood', text: 'Inga akuta spärrar just nu', helper: 'Fortsätt följa dina kommande deadlines.', priority: 9 });
    }
  }

  const noRisks = overdueCourses.length === 0 && blockedAnalyses.length === 0
    && atRiskAnalyses.length === 0 && missingList.length === 0;
  const usingFallback = recGroups.size === 0;

  // List items for the expanded section
  const blockedList = blockedAnalyses
    .sort((a, b) => a.course.year - b.course.year)
    .map(a => ({
      key: `b-${a.course.course_code}`,
      text: `${fmt(a.course.course_code, nameOf(a.course.course_code))} (år ${a.course.year}) – ${a.hardUnmet.slice(0, 2).map(r => shortMessage(r)).join(', ')}${a.hardUnmet.length > 2 ? ` +${a.hardUnmet.length - 2}` : ''}`,
    }));
  const atRiskList = atRiskAnalyses
    .sort((a, b) => a.course.year - b.course.year)
    .map(a => ({
      key: `r-${a.course.course_code}`,
      text: `${fmt(a.course.course_code, nameOf(a.course.course_code))} (år ${a.course.year}) – ${a.hardUnmet.slice(0, 2).map(r => shortMessage(r)).join(', ')}${a.hardUnmet.length > 2 ? ` +${a.hardUnmet.length - 2}` : ''}`,
    }));
  const missingDisplay = missingList.slice(0, 12).map(m => ({
    key: `m-${m.key}`,
    text: `${m.result.message} – behövs för ${[...m.affects].slice(0, 2).map(c => fmt(c, nameOf(c))).join(', ')}${m.affects.size > 2 ? ` +${m.affects.size - 2}` : ''}`,
  }));
  const overdueDisplay = overdueCourses.map(c => ({
    key: `o-${c.course_code}`,
    text: `${fmt(c.course_code, c.course_name)} – inte avklarad från år ${c.year}`,
  }));

  const totalDetails = blockedList.length + atRiskList.length + missingDisplay.length + overdueDisplay.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading">
          <ShieldAlert className="h-5 w-5 text-warning" />
          Riskbild & rekommendationer
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Så beräknas riskbilden" className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-72 text-sm">
              Riskbilden baseras på ditt program, startår, kursstatus och förkunskapskrav från kurskatalogen.
              <br /><br />
              <strong>Spärrad</strong> = kurs som redan skulle ha lästs (år ≤ aktuellt studieår) men där förkunskaper saknades, så du inte fick gå den. Påbörjade kurser räknas inte.
              <br /><br />
              <strong>Riskerar att spärras</strong> = framtida kurs där du saknar förkunskaper just nu.
            </PopoverContent>
          </Popover>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          <MetricCard icon={<BookOpen className="h-4 w-4 text-muted-foreground" />} label="Ej avklarade kurser" value={overdueCourses.length} onClick={() => setMetric('overdue')} />
          <MetricCard icon={<Lock className="h-4 w-4 text-destructive" />} label="Spärrade kurser" value={blockedAnalyses.length} emphasize={blockedAnalyses.length > 0} onClick={() => setMetric('blocked')} />
          <MetricCard icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="Riskerar att spärras" value={atRiskAnalyses.length} emphasize={atRiskAnalyses.length > 0} onClick={() => setMetric('atrisk')} />
        </div>

        {noRisks ? (
          <p className="text-sm text-muted-foreground">Inga risker upptäckta just nu. Bra jobbat!</p>
        ) : (
          <>
            {recs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rekommenderat just nu</p>
                <ul className="space-y-2">
                  {recs.map(t => (
                    <li key={t.key} className="flex items-start gap-2">
                      {usingFallback
                        ? <Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" />
                        : <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-warning shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm text-foreground font-medium leading-snug">{t.text}</p>
                        <p className="text-xs text-muted-foreground">{t.helper}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {compact && totalDetails > 0 && (
              <>
                {expanded && (
                  <div className="space-y-3 pt-1">
                    {blockedList.length > 0 && <Group title="Spärrade kurser" items={blockedList} dotClass="bg-destructive" />}
                    {atRiskList.length > 0 && <Group title="Riskerar att spärras" items={atRiskList} dotClass="bg-warning" />}
                    {missingDisplay.length > 0 && <Group title="Saknade förkunskaper" items={missingDisplay} dotClass="bg-warning" />}
                    {overdueDisplay.length > 0 && <Group title="Ej avklarade kurser" items={overdueDisplay} dotClass="bg-muted-foreground" />}
                  </div>
                )}
                <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={() => setExpanded(e => !e)}>
                  {expanded ? 'Visa färre' : 'Visa mer'}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={metric !== null} onOpenChange={(o) => { if (!o) setMetric(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {metric === 'overdue' && 'Ej avklarade kurser'}
              {metric === 'missing' && 'Saknade förkunskaper'}
              {metric === 'blocked' && 'Spärrade kurser'}
              {metric === 'atrisk' && 'Riskerar att spärras'}
            </DialogTitle>
          </DialogHeader>

          {metric === 'overdue' && (overdueCourses.length === 0
            ? <p className="text-sm text-muted-foreground">Inga ej avklarade kurser.</p>
            : <ul className="space-y-2">{overdueCourses.map(c => (
                <li key={c.course_code} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{c.course_code}</span>
                    <Badge variant="outline" className="text-xs">År {c.year}</Badge>
                    <Badge variant="secondary" className="text-xs">{COURSE_STATUS_LABEL[c.status] || c.status}</Badge>
                  </div>
                  {c.course_name && <p className="text-sm text-muted-foreground mt-1">{c.course_name}</p>}
                </li>
              ))}</ul>
          )}

          {metric === 'missing' && (missingList.length === 0
            ? <p className="text-sm text-muted-foreground">Inga saknade förkunskaper.</p>
            : <ul className="space-y-2">{missingList.map(m => (
                <li key={m.key} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{m.result.message}</p>
                  {m.result.progress && !m.result.fulfilled && (
                    <p className="text-xs text-muted-foreground mt-1">Framsteg: {m.result.progress.current}/{m.result.progress.required} HP</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Behövs för: {[...m.affects].slice(0, 5).map(c => fmt(c, nameOf(c))).join(', ')}
                    {m.affects.size > 5 && ` +${m.affects.size - 5}`}
                  </p>
                </li>
              ))}</ul>
          )}

          {metric === 'blocked' && (blockedAnalyses.length === 0
            ? <p className="text-sm text-muted-foreground">Inga spärrade kurser.</p>
            : <ul className="space-y-2">{blockedAnalyses.map(a => (
                <li key={a.course.course_code} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{a.course.course_code}</span>
                    <Badge variant="outline" className="text-xs">År {a.course.year}</Badge>
                    <Badge variant="destructive" className="text-xs">Spärrad</Badge>
                  </div>
                  {nameOf(a.course.course_code) && <p className="text-sm text-muted-foreground mt-1">{nameOf(a.course.course_code)}</p>}
                  <ul className="mt-2 space-y-1">
                    {a.hardUnmet.map((r, i) => (
                      <li key={`${r.message}-${i}`} className="text-sm">• {r.message}</li>
                    ))}
                  </ul>
                </li>
              ))}</ul>
          )}

          {metric === 'atrisk' && (atRiskAnalyses.length === 0
            ? <p className="text-sm text-muted-foreground">Inga framtida kurser i riskzonen.</p>
            : <ul className="space-y-2">{atRiskAnalyses.map(a => (
                <li key={a.course.course_code} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{a.course.course_code}</span>
                    <Badge variant="outline" className="text-xs">År {a.course.year}</Badge>
                    <Badge variant="secondary" className="text-xs">Riskerar att spärras</Badge>
                  </div>
                  {nameOf(a.course.course_code) && <p className="text-sm text-muted-foreground mt-1">{nameOf(a.course.course_code)}</p>}
                  <ul className="mt-2 space-y-1">
                    {a.hardUnmet.map((r, i) => (
                      <li key={`${r.message}-${i}`} className="text-sm">• {r.message}</li>
                    ))}
                  </ul>
                </li>
              ))}</ul>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ruleKey(r: CourseRequirement): string {
  switch (r.type) {
    case 'completed_course':
    case 'attended_course':
      return `${r.type}:${r.courseCode}`;
    case 'completed_hp_in_course':
      return `${r.type}:${r.courseCode}:${r.hp}`;
    case 'completed_hp_in_subject':
      return `${r.type}:${r.subject}:${r.hp}`;
    case 'completed_total_hp':
      return `${r.type}:${r.hp}`;
    case 'completed_hp_in_program_group':
      return `${r.type}:${(r.allowedProgramGroups || []).join(',')}:${r.hp}`;
    case 'completed_hp_in_course_group':
      return `${r.type}:${r.groupName || ''}:${r.hp}`;
    case 'completed_hp_at_level':
      return `${r.type}:${r.level}:${r.hp}`;
    case 'custom_text':
      return `${r.type}:${r.text.slice(0, 40)}`;
  }
}

function focusText(req: CourseRequirement, result: RequirementResult, nameOf: (c: string) => string | undefined): string {
  switch (req.type) {
    case 'completed_course':
      return `Fokusera på ${fmt(req.courseCode, nameOf(req.courseCode))}`;
    case 'attended_course':
      return `Påbörja ${fmt(req.courseCode, nameOf(req.courseCode))}`;
    case 'completed_hp_in_course': {
      const have = result.progress?.current ?? 0;
      const need = req.hp - have;
      return `Fokusera på moment i ${fmt(req.courseCode, nameOf(req.courseCode))} – du behöver ${need > 0 ? need : req.hp} HP till`;
    }
    case 'completed_hp_in_subject': {
      const have = result.progress?.current ?? 0;
      const need = Math.max(0, req.hp - have);
      return `Samla ${need || req.hp} HP till inom ${req.subject}`;
    }
    case 'completed_total_hp': {
      const have = result.progress?.current ?? 0;
      const need = Math.max(0, req.hp - have);
      return `Du behöver ${need} HP till totalt (mål ${req.hp})`;
    }
    default:
      return result.message;
  }
}

function shortMessage(r: RequirementResult): string {
  if (r.progress && !r.fulfilled) return `${r.message} (${r.progress.current}/${r.progress.required} HP)`;
  return r.message;
}

function MetricCard({ icon, label, value, emphasize, onClick }: { icon: React.ReactNode; label: string; value: number; emphasize?: boolean; onClick?: () => void }) {
  const className = `text-left w-full rounded-lg border p-2.5 sm:p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    emphasize ? 'border-warning/40 bg-warning/5 hover:bg-warning/10' : 'border-border bg-muted/30 hover:bg-muted/50'
  }`;
  return (
    <button type="button" onClick={onClick} className={className}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}<span className="truncate">{label}</span>
      </div>
      <p className="text-2xl font-heading font-bold text-foreground leading-none">{value}</p>
    </button>
  );
}

function Group({ title, items, dotClass }: { title: string; items: { key: string; text: string }[]; dotClass: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{title}</p>
      <ul className="space-y-1.5">
        {items.map(i => (
          <li key={i.key} className="flex items-start gap-2 text-sm text-foreground">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
