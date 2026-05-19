import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Lock, ArrowRight, AlertCircle, Trash2, Plus, Search, X, ChevronDown, ChevronRight, Check, Square, RotateCcw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { bthPrograms } from '@/lib/programs';
import {
  resolveSubject, normalizeRequirements, evaluateCourseRequirements,
  type CourseRequirement, type RequirementResult,
} from '@/lib/prerequisites';
import { useCatalogPrereqs, isGymnasiumRequirement, cleanOriginalText, filterPlanBlocks } from '@/lib/useCatalogPrereqs';
import CourseInfoPopover from '@/components/CourseInfoPopover';

const PREREQ_TOOLTIP =
  'Förkunskapskrav kan betyda olika saker: en kurs kan behöva vara avklarad, påbörjad/genomgången, eller kräva ett visst antal HP inom en kurs eller ett huvudområde.';

interface CourseStatusPageProps {
  userId: string;
  programName?: string;
}

type CourseStatus = 'completed' | 'partly' | 'not_started';

interface UserCourse {
  id: string;
  course_code: string;
  course_name: string;
  year: number;
  hp: number;
  status: CourseStatus;
}

type SubtaskType = 'exam' | 'assignment' | 'lab' | 'other';

interface Subtask {
  id: string;
  course_id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  hp: number;
  event_id: string | null;
  type: SubtaskType;
}

const SUBTASK_TYPE_LABEL: Record<SubtaskType, string> = {
  exam: '📋 Tenta',
  assignment: '📝 Uppgift',
  lab: '🧪 Labb',
  other: '📌 Annat',
};

interface PrereqStatus {
  prereqs: string[];
  unmetPrereqs: string[];
  allMet: boolean;
}

// ---------- Helpers ----------

function buildAllBthCourses() {
  const map = new Map<string, { name: string; code: string; hp: number; subject?: string }>();
  for (const program of bthPrograms) {
    for (const course of program.courses) {
      if (!map.has(course.code)) {
        map.set(course.code, { name: course.name, code: course.code, hp: course.hp, subject: course.subject });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function buildPrereqMap(programTemplate: typeof bthPrograms[number] | null) {
  const map = new Map<string, string[]>();
  if (!programTemplate) return map;
  for (const course of programTemplate.courses) {
    if (course.prerequisites && course.prerequisites.length > 0) {
      map.set(course.code, course.prerequisites);
    }
  }
  return map;
}

function buildOriginalReqMap(programTemplate: typeof bthPrograms[number] | null) {
  const map = new Map<string, string>();
  if (!programTemplate) return map;
  for (const course of programTemplate.courses) {
    if (course.originalRequirementsText) map.set(course.code, course.originalRequirementsText);
  }
  return map;
}

function buildBlocksMap(programTemplate: typeof bthPrograms[number] | null) {
  const map = new Map<string, string[]>();
  if (!programTemplate) return map;
  for (const course of programTemplate.courses) {
    if (!course.prerequisites) continue;
    for (const prereq of course.prerequisites) {
      const list = map.get(prereq);
      if (list) list.push(course.code);
      else map.set(prereq, [course.code]);
    }
  }
  return map;
}

function buildCourseNameMap(
  programTemplate: typeof bthPrograms[number] | null,
  courses: UserCourse[],
  allBthCourses: { code: string; name: string }[],
) {
  const map = new Map<string, string>();
  if (programTemplate) {
    for (const c of programTemplate.courses) map.set(c.code, c.name);
  }
  for (const c of courses) map.set(c.course_code, c.course_name);
  for (const c of allBthCourses) {
    if (!map.has(c.code)) map.set(c.code, c.name);
  }
  return map;
}

function groupCoursesByYear(courses: UserCourse[]): Record<number, UserCourse[]> {
  return courses.reduce((acc, c) => {
    if (!acc[c.year]) acc[c.year] = [];
    acc[c.year].push(c);
    return acc;
  }, {} as Record<number, UserCourse[]>);
}

function computeYearStats(grouped: Record<number, UserCourse[]>) {
  return Object.entries(grouped).map(([year, yearCourses]) => ({
    year: Number(year),
    completed: yearCourses.filter(c => c.status === 'completed').reduce((s, c) => s + c.hp, 0),
    total: yearCourses.reduce((s, c) => s + c.hp, 0),
  }));
}

// ---------- Sub-components ----------

function AddCourseDialog({
  open, onOpenChange, addSearch, setAddSearch, addYear, setAddYear,
  filteredAvailable, onAddCourse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  addSearch: string;
  setAddSearch: (v: string) => void;
  addYear: string;
  setAddYear: (v: string) => void;
  filteredAvailable: { code: string; name: string; hp: number }[];
  onAddCourse: (course: { code: string; name: string; hp: number }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Lägg till kurs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Lägg till kurs</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Sök kurskod eller kursnamn..." value={addSearch}
              onChange={e => setAddSearch(e.target.value)} className="pl-10" />
            {addSearch && (
              <button onClick={() => setAddSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Lägg till i år:</span>
            <Select value={addYear} onValueChange={setAddYear}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {filteredAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {addSearch ? 'Inga kurser hittades' : 'Alla kurser är redan tillagda'}
              </p>
            ) : (
              filteredAvailable.map(course => (
                <div key={course.code} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{course.code}</span>
                      <Badge variant="outline" className="text-xs">{course.hp} hp</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{course.name}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onAddCourse(course)} className="shrink-0 gap-1">
                    <Plus className="h-3 w-3" /> Lägg till
                  </Button>
                </div>
              ))
            )}
            {filteredAvailable.length >= 50 && (
              <p className="text-xs text-muted-foreground text-center py-2">Visar max 50 resultat. Använd sökning för att hitta fler.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrereqInfo({
  requirementResults, blocks, courseNameMap, originalText,
}: {
  requirementResults: RequirementResult[];
  blocks: string[] | undefined;
  courseNameMap: Map<string, string>;
  originalText?: string | null;
}) {
  const hasReqs = requirementResults.length > 0;
  const hasBlocks = blocks && blocks.length > 0;
  const hasOriginal = !!originalText;
  if (!hasReqs && !hasBlocks && !hasOriginal) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
      {(hasReqs || hasOriginal) && (
        <div className="text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Lock className="h-3 w-3 shrink-0" />
            <span className="font-medium">Förkunskapskrav</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Om förkunskapskrav"
                  className="inline-flex items-center text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {PREREQ_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          </div>
          {hasReqs ? (
            <ul className="space-y-0.5 pl-4">
              {requirementResults.map((r, i) => {
                const colorClass = r.fulfilled
                  ? 'text-success'
                  : r.severity === 'soft' ? 'text-warning' : 'text-warning font-medium';
                return (
                  <li key={i} className={colorClass}>
                    {r.fulfilled ? '✓ ' : '• '}{r.message}
                    {r.progress && !r.fulfilled && (
                      <span className="text-muted-foreground"> ({r.progress.current.toFixed(0)}/{r.progress.required} HP)</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pl-4 text-muted-foreground leading-snug">{originalText}</p>
          )}
        </div>
      )}
      {hasBlocks && (
        <div className="flex items-start gap-1.5 text-xs">
          <ArrowRight className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            Spärrar:{' '}
            {blocks!.map((code, i) => {
              const name = courseNameMap.get(code);
              return (
                <span key={code}>{i > 0 && ', '}{code}{name ? ` (${name})` : ''}</span>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function SubtaskRow({
  sub, onToggle, onDelete,
}: {
  sub: Subtask;
  onToggle: (s: Subtask) => void;
  onDelete: (s: Subtask) => void;
}) {
  return (
    <div className="flex items-center gap-2 group py-1">
      <button onClick={() => onToggle(sub)} className="shrink-0">
        {sub.completed ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      <div className={`flex-1 min-w-0 ${sub.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        <span className="text-sm">{sub.title}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>{SUBTASK_TYPE_LABEL[sub.type] || SUBTASK_TYPE_LABEL.assignment}</span>
          {sub.due_date && <span>• 📅 {sub.due_date}</span>}
          {sub.hp > 0 && <span>• {sub.hp} hp</span>}
          {sub.event_id && <span>• 📌 I kalendern</span>}
        </div>
      </div>
      <button
        onClick={() => onDelete(sub)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function NewSubtaskForm({
  courseId, text, date, hp, type, setText, setDate, setHp, setType, onAdd,
}: {
  courseId: string;
  text: string;
  date: string;
  hp: string;
  type: SubtaskType;
  setText: (v: string) => void;
  setDate: (v: string) => void;
  setHp: (v: string) => void;
  setType: (v: SubtaskType) => void;
  onAdd: (courseId: string) => void;
}) {
  const disabled = !text.trim();
  return (
    <div className="space-y-2 pt-1 border-t border-border/30">
      <Input
        placeholder="Namn på delmoment..."
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(courseId); } }}
        className="h-8 text-sm"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={type} onValueChange={(v) => setType(v as SubtaskType)}>
          <SelectTrigger className="h-8 text-sm w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="exam">📋 Tenta</SelectItem>
            <SelectItem value="assignment">📝 Uppgift</SelectItem>
            <SelectItem value="lab">🧪 Labb</SelectItem>
            <SelectItem value="other">📌 Annat</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          placeholder="Datum"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="h-8 text-sm flex-1 min-w-[120px]"
        />
        <Input
          type="number"
          placeholder="HP"
          step="0.5"
          min="0"
          value={hp}
          onChange={e => setHp(e.target.value)}
          className="h-8 text-sm w-20"
        />
        <Button size="sm" variant="default" className="h-8 px-3 shrink-0 gap-1"
          onClick={() => onAdd(courseId)} disabled={disabled}>
          <Plus className="h-3 w-3" /> Lägg till
        </Button>
      </div>
      {date && (
        <p className="text-xs text-muted-foreground">📌 En kalenderhändelse skapas automatiskt</p>
      )}
    </div>
  );
}

function SubtasksSection({
  course, courseSubtasks, isExpanded, onToggleExpanded,
  newText, newDate, newHp, newType,
  setNewText, setNewDate, setNewHp, setNewType,
  onToggleSubtask, onDeleteSubtask, onAddSubtask,
}: {
  course: UserCourse;
  courseSubtasks: Subtask[];
  isExpanded: boolean;
  onToggleExpanded: (id: string) => void;
  newText: string;
  newDate: string;
  newHp: string;
  newType: SubtaskType;
  setNewText: (v: string) => void;
  setNewDate: (v: string) => void;
  setNewHp: (v: string) => void;
  setNewType: (v: SubtaskType) => void;
  onToggleSubtask: (s: Subtask) => void;
  onDeleteSubtask: (s: Subtask) => void;
  onAddSubtask: (courseId: string) => void;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggleExpanded(course.id)}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Delmoment ({courseSubtasks.length})
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5">
        {courseSubtasks.map(sub => (
          <SubtaskRow key={sub.id} sub={sub} onToggle={onToggleSubtask} onDelete={onDeleteSubtask} />
        ))}
        <NewSubtaskForm
          courseId={course.id}
          text={newText} date={newDate} hp={newHp} type={newType}
          setText={setNewText} setDate={setNewDate} setHp={setNewHp} setType={setNewType}
          onAdd={onAddSubtask}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

interface CourseCardProps {
  course: UserCourse;
  requirementResults: RequirementResult[];
  blocks: string[] | undefined;
  courseNameMap: Map<string, string>;
  courseSubtasks: Subtask[];
  isExpanded: boolean;
  subjectPrimary?: string | null;
  originalReqText?: string | null;
  newText: string;
  newDate: string;
  newHp: string;
  newType: SubtaskType;
  onUpdateStatus: (id: string, s: CourseStatus) => void;
  onDelete: (id: string, name: string) => void;
  onToggleExpanded: (id: string) => void;
  setNewText: (v: string) => void;
  setNewDate: (v: string) => void;
  setNewHp: (v: string) => void;
  setNewType: (v: SubtaskType) => void;
  onToggleSubtask: (s: Subtask) => void;
  onDeleteSubtask: (s: Subtask) => void;
  onAddSubtask: (courseId: string) => void;
}

function CourseCard(props: CourseCardProps) {
  const {
    course, requirementResults, blocks, courseNameMap, courseSubtasks, isExpanded,
    subjectPrimary, originalReqText,
    newText, newDate, newHp, newType,
    onUpdateStatus, onDelete, onToggleExpanded,
    setNewText, setNewDate, setNewHp, setNewType,
    onToggleSubtask, onDeleteSubtask, onAddSubtask,
  } = props;

  const completedSubs = courseSubtasks.filter(s => s.completed).length;
  const hasUnmet = requirementResults.some(r => !r.fulfilled);
  const unmet = hasUnmet && course.status === 'not_started';
  const cardClass = unmet ? 'border-warning/30' : '';
  const subjectLabel = subjectPrimary && subjectPrimary !== 'Okänt huvudområde' ? subjectPrimary : null;

  return (
    <Card className={cardClass}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <CourseInfoPopover
                info={{
                  code: course.course_code,
                  name: course.course_name,
                  hp: course.hp,
                  subject: subjectLabel,
                  status: course.status,
                  originalRequirementText: originalReqText ?? undefined,
                  unlocksInPlan: blocks ?? [],
                  nameOf: (c) => courseNameMap.get(c),
                }}
              >
                <button
                  type="button"
                  className="font-mono font-semibold text-foreground hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {course.course_code}
                </button>
              </CourseInfoPopover>
              <span className="text-foreground">{course.course_name}</span>
              <span className="text-muted-foreground" aria-hidden="true">·</span>
              <span className="text-muted-foreground">{course.hp} HP</span>
              {courseSubtasks.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {completedSubs}/{courseSubtasks.length} delmoment
                </Badge>
              )}
              {unmet && (
                <Tooltip>
                  <TooltipTrigger><AlertCircle className="h-4 w-4 text-warning" /></TooltipTrigger>
                  <TooltipContent><p>Förkunskapskrav ej uppfyllda</p></TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={course.status} onValueChange={(v) => onUpdateStatus(course.id, v as CourseStatus)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">✅ Avklarad</SelectItem>
                <SelectItem value="partly">🟡 Påbörjad</SelectItem>
                <SelectItem value="not_started">⬜ Ej påbörjad</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onDelete(course.id, course.course_name)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ta bort kurs</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <PrereqInfo
          requirementResults={requirementResults}
          blocks={blocks}
          courseNameMap={courseNameMap}
          originalText={originalReqText}
        />

        <SubtasksSection
          course={course}
          courseSubtasks={courseSubtasks}
          isExpanded={isExpanded}
          onToggleExpanded={onToggleExpanded}
          newText={newText} newDate={newDate} newHp={newHp} newType={newType}
          setNewText={setNewText} setNewDate={setNewDate} setNewHp={setNewHp} setNewType={setNewType}
          onToggleSubtask={onToggleSubtask}
          onDeleteSubtask={onDeleteSubtask}
          onAddSubtask={onAddSubtask}
        />
      </CardContent>
    </Card>
  );
}

interface YearSectionProps {
  year: string;
  yearCourses: UserCourse[];
  stats: { completed: number; total: number } | undefined;
  subtasks: Subtask[];
  expandedCourses: Set<string>;
  newSubtaskText: Record<string, string>;
  newSubtaskDate: Record<string, string>;
  newSubtaskHp: Record<string, string>;
  newSubtaskType: Record<string, SubtaskType>;
  blocksMap: Map<string, string[]>;
  courseNameMap: Map<string, string>;
  subjectMap: Map<string, string>;
  originalReqMap: Map<string, string>;
  getRequirementResults: (code: string) => RequirementResult[];
  onUpdateStatus: (id: string, s: CourseStatus) => void;
  onDelete: (id: string, name: string) => void;
  onToggleExpanded: (id: string) => void;
  setNewSubtaskText: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setNewSubtaskDate: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setNewSubtaskHp: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setNewSubtaskType: React.Dispatch<React.SetStateAction<Record<string, SubtaskType>>>;
  onToggleSubtask: (s: Subtask) => void;
  onDeleteSubtask: (s: Subtask) => void;
  onAddSubtask: (courseId: string) => void;
}

function YearSection(props: YearSectionProps) {
  const {
    year, yearCourses, stats, subtasks, expandedCourses,
    newSubtaskText, newSubtaskDate, newSubtaskHp, newSubtaskType,
    blocksMap, courseNameMap, subjectMap, originalReqMap, getRequirementResults,
    onUpdateStatus, onDelete, onToggleExpanded,
    setNewSubtaskText, setNewSubtaskDate, setNewSubtaskHp, setNewSubtaskType,
    onToggleSubtask, onDeleteSubtask, onAddSubtask,
  } = props;

  const yearProgress = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-foreground">År {year}</h3>
        <span className="text-xs text-muted-foreground">{stats?.completed}/{stats?.total} HP ({yearProgress}%)</span>
      </div>
      <Progress value={yearProgress} className="h-1.5 mb-3" />
      <div className="space-y-2">
        {yearCourses.map(course => (
          <CourseCard
            key={course.id}
            course={course}
            requirementResults={getRequirementResults(course.course_code)}
            blocks={blocksMap.get(course.course_code)}
            courseNameMap={courseNameMap}
            courseSubtasks={subtasks.filter(s => s.course_id === course.id)}
            isExpanded={expandedCourses.has(course.id)}
            subjectPrimary={subjectMap.get(course.course_code) || null}
            originalReqText={originalReqMap.get(course.course_code) || null}
            newText={newSubtaskText[course.id] || ''}
            newDate={newSubtaskDate[course.id] || ''}
            newHp={newSubtaskHp[course.id] || ''}
            newType={newSubtaskType[course.id] || 'assignment'}
            onUpdateStatus={onUpdateStatus}
            onDelete={onDelete}
            onToggleExpanded={onToggleExpanded}
            setNewText={(v) => setNewSubtaskText(prev => ({ ...prev, [course.id]: v }))}
            setNewDate={(v) => setNewSubtaskDate(prev => ({ ...prev, [course.id]: v }))}
            setNewHp={(v) => setNewSubtaskHp(prev => ({ ...prev, [course.id]: v }))}
            setNewType={(v) => setNewSubtaskType(prev => ({ ...prev, [course.id]: v }))}
            onToggleSubtask={onToggleSubtask}
            onDeleteSubtask={onDeleteSubtask}
            onAddSubtask={onAddSubtask}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Main page ----------

export default function CourseStatusPage({ userId, programName }: CourseStatusPageProps) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<UserCourse[]>([]);
  const initialStatusesRef = useRef<Map<string, CourseStatus>>(new Map());
  const dismissedCodesRef = useRef<Set<string>>(new Set());
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addYear, setAddYear] = useState('1');
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [newSubtaskText, setNewSubtaskText] = useState<Record<string, string>>({});
  const [newSubtaskDate, setNewSubtaskDate] = useState<Record<string, string>>({});
  const [newSubtaskHp, setNewSubtaskHp] = useState<Record<string, string>>({});
  const [newSubtaskType, setNewSubtaskType] = useState<Record<string, SubtaskType>>({});

  // Elective candidates from program catalog (mandatory = false)
  interface ElectiveOption { id: string; code: string; name: string; hp: number; year: number; subject: string | null }
  const [electives, setElectives] = useState<ElectiveOption[]>([]);

  // Pending destructive confirmations
  const [pendingCourseDelete, setPendingCourseDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingSubtaskDelete, setPendingSubtaskDelete] = useState<Subtask | null>(null);


  // Display-only filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterUnmetOnly, setFilterUnmetOnly] = useState(false);

  const resetFilters = () => {
    setFilterSearch('');
    setFilterYear('all');
    setFilterStatus('all');
    setFilterSubject('all');
    setFilterUnmetOnly(false);
  };
  const hasActiveFilters =
    filterSearch.trim() !== '' || filterYear !== 'all' || filterStatus !== 'all'
    || filterSubject !== 'all' || filterUnmetOnly;

  const programTemplate = useMemo(() => {
    if (!programName) return null;
    return bthPrograms.find(p => p.name === programName) || null;
  }, [programName]);

  const catalogForList = useCatalogPrereqs();
  const allBthCourses = useMemo(() => {
    const map = new Map<string, { code: string; name: string; hp: number; subject?: string }>();
    // Catalog first (authoritative)
    for (const [code, c] of catalogForList.courseByCode) {
      map.set(code, { code: c.course_code, name: c.course_name, hp: Number(c.hp), subject: c.subject_area ?? undefined });
    }
    // Then fall back to legacy static program data
    for (const c of buildAllBthCourses()) {
      if (!map.has(c.code)) map.set(c.code, c);
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [catalogForList.courseByCode]);

  const availableCourses = useMemo(() => {
    const userCodes = new Set(courses.map(c => c.course_code));
    return allBthCourses.filter(c => !userCodes.has(c.code));
  }, [allBthCourses, courses]);

  const filteredAvailable = useMemo(() => {
    if (!addSearch) return availableCourses.slice(0, 50);
    const q = addSearch.toLowerCase();
    return availableCourses
      .filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [availableCourses, addSearch]);

  const catalog = catalogForList;

  const prereqMap = useMemo(() => buildPrereqMap(programTemplate), [programTemplate]);
  const blocksMap = useMemo(() => {
    // Only count blockers that exist in the student's own plan, deduped.
    const planCodes = new Set(courses.map(c => c.course_code));
    const dedupe = (list: string[]) => Array.from(new Set(list));
    const m = new Map<string, string[]>();
    for (const [code, list] of catalog.blocksByCode) {
      const f = dedupe(filterPlanBlocks(list, planCodes));
      if (f.length > 0) m.set(code, f);
    }
    const staticBlocks = buildBlocksMap(programTemplate);
    for (const [code, list] of staticBlocks) {
      if (m.has(code)) continue;
      const f = dedupe(filterPlanBlocks(list, planCodes));
      if (f.length > 0) m.set(code, f);
    }
    return m;
  }, [programTemplate, catalog.blocksByCode, courses]);

  const originalReqMap = useMemo(() => {
    const m = new Map<string, string>();
    const staticMap = buildOriginalReqMap(programTemplate);
    for (const [code, text] of staticMap) {
      const cleaned = cleanOriginalText(text);
      if (cleaned) m.set(code, cleaned);
    }
    // Catalog wins (catalog already cleaned)
    for (const [code, text] of catalog.originalTextByCode) m.set(code, text);
    return m;
  }, [programTemplate, catalog.originalTextByCode]);

  const courseNameMap = useMemo(() => {
    const m = buildCourseNameMap(programTemplate, courses, allBthCourses);
    for (const [code, name] of catalog.codeToName) {
      if (!m.has(code)) m.set(code, name);
    }
    return m;
  }, [programTemplate, courses, allBthCourses, catalog.codeToName]);
  const subjectMap = useMemo(() => {
    const m = new Map<string, string>();
    const add = (code: string, explicit?: string | null) => {
      if (m.has(code)) return;
      m.set(code, resolveSubject(code, explicit).primary);
    };
    for (const [code, c] of catalog.courseByCode) add(c.course_code, c.subject_area);
    if (programTemplate) for (const c of programTemplate.courses) add(c.code, c.subject);
    for (const c of allBthCourses) add(c.code, c.subject);
    for (const c of courses) add(c.course_code);
    return m;
  }, [programTemplate, allBthCourses, courses, catalog.courseByCode]);

  const requirementsMap = useMemo(() => {
    const m = new Map<string, CourseRequirement[]>();
    if (programTemplate) {
      for (const c of programTemplate.courses) {
        const reqs = normalizeRequirements(c).filter(r => !isGymnasiumRequirement(r));
        if (reqs.length) m.set(c.code, reqs);
      }
    }
    for (const [code, reqs] of catalog.requirementsByCode) {
      const filtered = reqs.filter(r => !isGymnasiumRequirement(r));
      if (filtered.length > 0) m.set(code, filtered);
    }
    return m;
  }, [programTemplate, catalog.requirementsByCode]);


  const evalContext = useMemo(() => {
    const courseIdToCode = new Map(courses.map(c => [c.id, c.course_code]));
    return {
      courses: courses.map(c => ({
        course_code: c.course_code,
        status: c.status,
        hp: c.hp,
        subject: subjectMap.get(c.course_code) || null,
      })),
      subtasks: subtasks.map(s => ({
        course_code: courseIdToCode.get(s.course_id) || '',
        completed: s.completed,
        hp: s.hp,
      })),
    };
  }, [courses, subtasks, subjectMap]);

  const getRequirementResults = (code: string): RequirementResult[] => {
    const reqs = requirementsMap.get(code);
    if (!reqs || reqs.length === 0) return [];
    const tmplCourse = programTemplate?.courses.find(c => c.code === code);
    const courseLike = tmplCourse
      ? { code: tmplCourse.code, requirements: reqs }
      : { code, requirements: reqs };
    return evaluateCourseRequirements(courseLike, evalContext, { nameMap: courseNameMap }).results;
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  // Load elective candidates AND auto-seed any missing mandatory catalog courses
  // for the student's program (so existing users get e.g. year 5 examensarbete).
  useEffect(() => {
    if (!programName || loading) { return; }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const prog = await sb.from('programs_catalog')
        .select('id').eq('name', programName).eq('active', true).maybeSingle();
      if (cancelled || !prog.data) { setElectives([]); return; }
      const programId = (prog.data as { id: string }).id;
      const pc = await sb.from('program_courses')
        .select('year, mandatory, course:courses_catalog(id, course_code, course_name, hp, subject_area)')
        .eq('program_id', programId)
        .order('year', { ascending: true });
      if (cancelled || !pc.data) { setElectives([]); return; }

      type Row = { year: number; mandatory: boolean; course: { id: string; course_code: string; course_name: string; hp: number; subject_area: string | null } | null };
      const allRows = ((pc.data as unknown) as Row[]).filter(r => r.course);

      // Seed missing mandatory catalog courses into user_courses (idempotent)
      const existingCodes = new Set(courses.map(c => c.course_code.toUpperCase()));
      const dismissed = dismissedCodesRef.current;
      const seen = new Set<string>();
      const missingMandatory = allRows.filter(r => {
        if (!r.mandatory) return false;
        const code = r.course!.course_code.toUpperCase();
        if (existingCodes.has(code) || seen.has(code) || dismissed.has(code)) return false;
        seen.add(code);
        return true;
      });
      if (missingMandatory.length > 0) {
        const inserts = missingMandatory.map(r => ({
          user_id: userId,
          course_code: r.course!.course_code,
          course_name: r.course!.course_name,
          hp: Number(r.course!.hp) || 0,
          year: r.year,
          status: 'not_started' as CourseStatus,
          catalog_course_id: r.course!.id,
        }));
        const { data: inserted } = await sb.from('user_courses').insert(inserts).select();
        if (inserted && !cancelled) {
          const added = inserted as UserCourse[];
          setCourses(prev => [...prev, ...added]);
          added.forEach(c => initialStatusesRef.current.set(c.id, c.status));
        }
      }

      if (cancelled) return;
      const list: ElectiveOption[] = allRows
        .filter(r => !r.mandatory)
        .map(r => ({
          id: r.course!.id,
          code: r.course!.course_code,
          name: r.course!.course_name,
          hp: Number(r.course!.hp) || 0,
          year: r.year,
          subject: r.course!.subject_area,
        }));
      setElectives(list);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programName, userId, loading]);

  const electivesByYear = useMemo(() => {
    const userCodes = new Set(courses.map(c => c.course_code));
    const m = new Map<number, ElectiveOption[]>();
    for (const e of electives) {
      if (userCodes.has(e.code)) continue;
      const arr = m.get(e.year) || [];
      if (!arr.some(x => x.code === e.code)) arr.push(e);
      m.set(e.year, arr);
    }
    return m;
  }, [electives, courses]);

  const addElective = async (e: ElectiveOption) => {
    const { data, error } = await supabase.from('user_courses').insert({
      user_id: userId, course_code: e.code, course_name: e.name,
      hp: e.hp, year: e.year, status: 'not_started', catalog_course_id: e.id,
    }).select().single();
    if (error) { toast.error('Kunde inte lägga till valbar kurs'); return; }
    if (data) {
      const nc = data as UserCourse;
      setCourses(prev => [...prev, nc]);
      initialStatusesRef.current.set(nc.id, nc.status);
      await removeFromDismissed(e.code);
      toast.success(`${e.name} tillagd som valbar kurs i år ${e.year}`);
    }
  };


  const fetchData = async () => {
    const [coursesRes, subtasksRes, profileRes] = await Promise.all([
      supabase.from('user_courses').select('*').eq('user_id', userId)
        .order('year', { ascending: true }).order('course_name', { ascending: true }),
      supabase.from('course_subtasks').select('id, course_id, title, completed, due_date, hp, event_id, type').eq('user_id', userId)
        .order('created_at', { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('profiles').select('dismissed_course_codes').eq('user_id', userId).maybeSingle(),
    ]);

    if (coursesRes.data) {
      const data = coursesRes.data as UserCourse[];
      setCourses(data);
      initialStatusesRef.current = new Map(data.map(c => [c.id, c.status]));
    }
    if (subtasksRes.data) setSubtasks(subtasksRes.data as Subtask[]);
    const dismissed = (profileRes?.data as { dismissed_course_codes?: string[] } | null)?.dismissed_course_codes ?? [];
    dismissedCodesRef.current = new Set(dismissed.map(c => c.toUpperCase()));
    setLoading(false);
  };

  const updateStatus = (courseId: string, newStatus: CourseStatus) => {
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, status: newStatus } : c));
  };

  const toggleExpanded = (courseId: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  };

  const isDirty = useMemo(
    () => courses.some(c => initialStatusesRef.current.get(c.id) !== c.status),
    [courses],
  );

  const resetStatusChanges = () => {
    setCourses(prev =>
      prev.map(c => {
        const init = initialStatusesRef.current.get(c.id);
        return init !== undefined ? { ...c, status: init } : c;
      }),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dirtyCourses = courses.filter(
        c => initialStatusesRef.current.get(c.id) !== c.status,
      );
      for (const course of dirtyCourses) {
        const { error } = await supabase.from('user_courses').update({ status: course.status }).eq('id', course.id);
        if (error) throw error;
      }
      initialStatusesRef.current = new Map(courses.map(c => [c.id, c.status]));
      toast.success('Kursstatus sparad!');
      navigate('/');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Kunde inte spara';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (courseId: string, courseName: string) => {
    const course = courses.find(c => c.id === courseId);
    const { error } = await supabase.from('user_courses').delete().eq('id', courseId);
    if (error) {
      toast.error('Kunde inte ta bort kursen');
      return;
    }
    setCourses(prev => prev.filter(c => c.id !== courseId));
    initialStatusesRef.current.delete(courseId);
    setSubtasks(prev => prev.filter(s => s.course_id !== courseId));

    // Remember this code as dismissed so auto-seed doesn't bring it back.
    if (course) {
      const codeUpper = course.course_code.toUpperCase();
      if (!dismissedCodesRef.current.has(codeUpper)) {
        dismissedCodesRef.current.add(codeUpper);
        const next = Array.from(dismissedCodesRef.current);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('profiles')
          .update({ dismissed_course_codes: next })
          .eq('user_id', userId);
      }
    }
    toast.success(`${courseName} borttagen`);
  };

  const removeFromDismissed = async (code: string) => {
    const codeUpper = code.toUpperCase();
    if (!dismissedCodesRef.current.has(codeUpper)) return;
    dismissedCodesRef.current.delete(codeUpper);
    const next = Array.from(dismissedCodesRef.current);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('profiles')
      .update({ dismissed_course_codes: next })
      .eq('user_id', userId);
  };

  const handleAddCourse = async (course: { code: string; name: string; hp: number }) => {
    const year = Number.parseInt(addYear, 10);
    const { data, error } = await supabase.from('user_courses').insert({
      user_id: userId, course_code: course.code, course_name: course.name,
      hp: course.hp, year, status: 'not_started',
    }).select().single();

    if (error) {
      toast.error('Kunde inte lägga till kursen');
      return;
    }
    if (data) {
      const newCourse = data as UserCourse;
      setCourses(prev => [...prev, newCourse]);
      initialStatusesRef.current.set(newCourse.id, newCourse.status);
      await removeFromDismissed(course.code);
      toast.success(`${course.name} tillagd i år ${year}`);
    }
  };

  const createLinkedEvent = async (
    text: string, dueDate: string, course: UserCourse,
    type: SubtaskType, hp: number,
  ) => {
    const { data, error } = await supabase.from('study_events').insert({
      user_id: userId,
      title: text,
      course_code: course.course_code,
      event_type: type,
      due_date: dueDate,
      hp,
      status: 'upcoming',
    }).select('id').single();

    if (error || !data) return null;
    return data.id as string;
  };

  // Auto-suggest marking a course as fully completed when delmoment HP reaches course HP
  const maybeSuggestCourseCompletion = (course: UserCourse, nextSubtasks: Subtask[]) => {
    if (course.status === 'completed') return;
    const subs = nextSubtasks.filter(s => s.course_id === course.id);
    if (subs.length === 0) return;
    const completedHp = subs.filter(s => s.completed).reduce((sum, s) => sum + Number(s.hp || 0), 0);
    if (completedHp + 0.001 < course.hp) return;
    toast.success(`Alla delmoment-HP för ${course.course_name} är klara`, {
      description: 'Vill du markera hela kursen som avklarad?',
      action: {
        label: 'Markera klar',
        onClick: async () => {
          const { error } = await supabase.from('user_courses')
            .update({ status: 'completed' }).eq('id', course.id);
          if (error) { toast.error('Kunde inte uppdatera kursstatus'); return; }
          setCourses(prev => prev.map(c => c.id === course.id ? { ...c, status: 'completed' } : c));
          initialStatusesRef.current.set(course.id, 'completed');
          toast.success(`${course.course_name} markerad som helt avklarad`);
        },
      },
    });
  };


  const handleAddSubtask = async (courseId: string) => {
    const text = (newSubtaskText[courseId] || '').trim();
    if (!text) return;

    const dueDate = newSubtaskDate[courseId] || null;
    const hp = Number.parseFloat(newSubtaskHp[courseId] || '0') || 0;
    const type: SubtaskType = newSubtaskType[courseId] || 'assignment';
    const course = courses.find(c => c.id === courseId);

    let eventId: string | null = null;
    if (dueDate && course) {
      eventId = await createLinkedEvent(text, dueDate, course, type, hp);
    }

    const { data, error } = await supabase.from('course_subtasks').insert({
      user_id: userId, course_id: courseId, title: text,
      due_date: dueDate, hp, event_id: eventId, type,
    }).select('id, course_id, title, completed, due_date, hp, event_id, type').single();

    if (error) {
      toast.error('Kunde inte lägga till delmoment');
      return;
    }
    if (data) {
      setSubtasks(prev => [...prev, data as Subtask]);
      setNewSubtaskText(prev => ({ ...prev, [courseId]: '' }));
      setNewSubtaskDate(prev => ({ ...prev, [courseId]: '' }));
      setNewSubtaskHp(prev => ({ ...prev, [courseId]: '' }));
      setNewSubtaskType(prev => ({ ...prev, [courseId]: 'assignment' }));
      toast.success(dueDate ? 'Delmoment tillagt och kalenderhändelse skapad!' : 'Delmoment tillagt!');
    }
  };

  const toggleSubtask = async (subtask: Subtask) => {
    const newCompleted = !subtask.completed;
    const { error } = await supabase.from('course_subtasks')
      .update({ completed: newCompleted }).eq('id', subtask.id);

    if (error) return;
    const nextSubtasks = subtasks.map(s => s.id === subtask.id ? { ...s, completed: newCompleted } : s);
    setSubtasks(nextSubtasks);
    if (subtask.event_id) {
      await supabase.from('study_events')
        .update({ status: newCompleted ? 'complete' : 'upcoming' })
        .eq('id', subtask.event_id);
    }
    if (newCompleted) {
      const course = courses.find(c => c.id === subtask.course_id);
      if (course) maybeSuggestCourseCompletion(course, nextSubtasks);
    }
  };

  const deleteSubtask = async (subtask: Subtask) => {
    const { error } = await supabase.from('course_subtasks').delete().eq('id', subtask.id);
    if (error) return;
    setSubtasks(prev => prev.filter(s => s.id !== subtask.id));
    if (subtask.event_id) {
      await supabase.from('study_events').delete().eq('id', subtask.event_id);
    }
  };

  const getPrereqStatus = (courseCode: string): PrereqStatus | null => {
    const prereqs = prereqMap.get(courseCode);
    if (!prereqs || prereqs.length === 0) return null;
    const unmetPrereqs = prereqs.filter(prereqCode => {
      const c = courses.find(uc => uc.course_code === prereqCode);
      return !c || c.status !== 'completed';
    });
    return { prereqs, unmetPrereqs, allMet: unmetPrereqs.length === 0 };
  };

  const groupedByYear = useMemo(() => groupCoursesByYear(courses), [courses]);
  const yearHpStats = useMemo(() => computeYearStats(groupedByYear), [groupedByYear]);

  const filteredCourses = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return courses.filter(c => {
      if (q && !c.course_code.toLowerCase().includes(q) && !c.course_name.toLowerCase().includes(q)) return false;
      if (filterYear !== 'all' && String(c.year) !== filterYear) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterSubject !== 'all' && (subjectMap.get(c.course_code) || 'Okänt huvudområde') !== filterSubject) return false;
      if (filterUnmetOnly) {
        const results = getRequirementResults(c.course_code);
        const hasUnmet = results.some(r => !r.fulfilled);
        if (!hasUnmet) return false;
      }
      return true;
    });
  }, [courses, filterSearch, filterYear, filterStatus, filterSubject, filterUnmetOnly, prereqMap, subjectMap, requirementsMap, evalContext, courseNameMap]);

  const filteredGroupedByYear = useMemo(() => groupCoursesByYear(filteredCourses), [filteredCourses]);
  const availableYears = useMemo(
    () => Array.from(new Set(courses.map(c => c.year))).sort((a, b) => a - b),
    [courses],
  );
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) set.add(subjectMap.get(c.course_code) || 'Okänt huvudområde');
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'sv'));
  }, [courses, subjectMap]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laddar kurser...</p>
      </div>
    );
  }

  // Compute program length so we can render empty year sections (År 1..N).
  const templateMaxYear = programTemplate
    ? Math.max(0, ...programTemplate.courses.map(c => c.year))
    : 0;
  const electiveMaxYear = electives.length > 0
    ? Math.max(0, ...electives.map(e => e.year))
    : 0;
  const userMaxYear = courses.length > 0
    ? Math.max(0, ...courses.map(c => c.year))
    : 0;
  const programYearCount = Math.max(templateMaxYear, electiveMaxYear, userMaxYear, 1);
  const allProgramYears = Array.from({ length: programYearCount }, (_, i) => i + 1);

  // Combine filtered courses with empty year buckets so every program year renders.
  const yearEntries: Array<[string, UserCourse[]]> = allProgramYears.map(y => [
    String(y),
    filteredGroupedByYear[y] || [],
  ]);
  // Honour year filter for the "show only this year" case
  const sortedYearEntries = filterYear === 'all'
    ? yearEntries
    : yearEntries.filter(([y]) => y === filterYear);

  return (
    <div className="min-h-screen bg-background">

      <main className={`container max-w-2xl pt-10 pb-4 animate-slide-up ${isDirty ? 'pb-32 md:pb-24' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-2xl font-bold text-foreground">Dina kurser</h2>
          <AddCourseDialog
            open={addDialogOpen} onOpenChange={setAddDialogOpen}
            addSearch={addSearch} setAddSearch={setAddSearch}
            addYear={addYear} setAddYear={setAddYear}
            filteredAvailable={filteredAvailable}
            onAddCourse={handleAddCourse}
          />
        </div>
        <p className="text-muted-foreground mb-4">
          Markera status och hantera delmoment för varje kurs.
        </p>

        {/* Display-only filters */}
        <div className="mb-6 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Sök kurskod eller kursnamn..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="pl-10"
            />
            {filterSearch && (
              <button
                type="button"
                onClick={() => setFilterSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Rensa sökning"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="År" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla år</SelectItem>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>År {y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla statusar</SelectItem>
                <SelectItem value="not_started">⬜ Ej påbörjad</SelectItem>
                <SelectItem value="partly">🟡 Påbörjad</SelectItem>
                <SelectItem value="completed">✅ Avklarad</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Huvudområde" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla huvudområden</SelectItem>
                {availableSubjects.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={filterUnmetOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterUnmetOnly(v => !v)}
              className="h-9 gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" />
              Endast ouppfyllda förkunskaper
            </Button>
            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1.5">
                <X className="h-3.5 w-3.5" /> Rensa filter
              </Button>
            )}
          </div>
        </div>

        <TooltipProvider>
          {sortedYearEntries.length === 0 && (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                {courses.length === 0
                  ? 'Du har inga kurser ännu. Lägg till en kurs för att komma igång.'
                  : 'Inga kurser matchar de valda filtren.'}
              </p>
              {courses.length > 0 && hasActiveFilters && (
                <Button type="button" variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Rensa filter
                </Button>
              )}
            </div>
          )}
          {sortedYearEntries.map(([year, yearCourses]) => {
            const yearNum = Number(year);
            const yearElectives = electivesByYear.get(yearNum) || [];
            const yearStats = yearHpStats.find(s => s.year === yearNum);
            const totalHpYear = yearStats?.total ?? 0;
            const missingHp = Math.max(0, 60 - totalHpYear);
            const showElectivePrompt = missingHp > 0 && yearElectives.length > 0;
            const showMissingNoElectives = missingHp > 0 && yearElectives.length === 0 && yearCourses.length > 0;
            return (
              <div key={year}>
                <YearSection
                  year={year}
                  yearCourses={yearCourses}
                  stats={yearStats}
                  subtasks={subtasks}
                  expandedCourses={expandedCourses}
                  newSubtaskText={newSubtaskText}
                  newSubtaskDate={newSubtaskDate}
                  newSubtaskHp={newSubtaskHp}
                  newSubtaskType={newSubtaskType}
                  blocksMap={blocksMap}
                  courseNameMap={courseNameMap}
                  subjectMap={subjectMap}
                  originalReqMap={originalReqMap}
                  getRequirementResults={getRequirementResults}
                  onUpdateStatus={updateStatus}
                  onDelete={(id, name) => setPendingCourseDelete({ id, name })}
                  onToggleExpanded={toggleExpanded}
                  setNewSubtaskText={setNewSubtaskText}
                  setNewSubtaskDate={setNewSubtaskDate}
                  setNewSubtaskHp={setNewSubtaskHp}
                  setNewSubtaskType={setNewSubtaskType}
                  onToggleSubtask={toggleSubtask}
                  onDeleteSubtask={(s) => setPendingSubtaskDelete(s)}
                  onAddSubtask={handleAddSubtask}
                />
                {showElectivePrompt && (
                  <div className="mb-3 -mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="text-sm text-foreground">
                      <p className="font-medium">År {year} saknar {missingHp} HP</p>
                      <p className="text-xs text-muted-foreground">
                        Ett normalt läsår är 60 HP. Välj {missingHp} HP bland de valbara kurserna nedan för att fylla upp året.
                      </p>
                    </div>
                  </div>
                )}
                {showMissingNoElectives && (
                  <div className="mb-3 -mt-2 rounded-md border border-border bg-muted/30 p-3 flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      År {year} har {totalHpYear} HP — {missingHp} HP saknas för ett fullt läsår (60 HP).
                      Lägg till en kurs manuellt om du planerar fler kurser detta år.
                    </div>
                  </div>
                )}
                {yearElectives.length > 0 && missingHp > 0 && (
                  <div className="mb-6 -mt-1 rounded-md border border-dashed border-border p-3 bg-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Valbara kurser år {year}
                    </p>
                    <ul className="space-y-1.5">
                      {yearElectives.map(e => (
                        <li key={e.code} className="flex items-center gap-2 flex-wrap text-sm">
                          <CourseInfoPopover info={{ code: e.code, name: e.name, hp: e.hp, subject: e.subject }}>
                            <button type="button" className="font-mono font-semibold hover:text-primary hover:underline">{e.code}</button>
                          </CourseInfoPopover>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-foreground flex-1 min-w-0 truncate">{e.name}</span>
                          <Badge variant="outline" className="text-xs">{e.hp} HP</Badge>
                          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => addElective(e)}>
                            <Plus className="h-3 w-3" /> Lägg till
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}


        </TooltipProvider>

      </main>

      {isDirty && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 bg-card border-t shadow-lg">
          <div className="container max-w-2xl py-3 flex items-center gap-3 flex-wrap">
            <p className="text-sm text-foreground flex-1 min-w-[160px]">Du har osparade ändringar</p>
            <Button variant="outline" size="sm" onClick={resetStatusChanges} disabled={saving} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Ångra
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" /> {saving ? 'Sparar...' : 'Spara kursstatus'}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!pendingCourseDelete} onOpenChange={(o) => !o && setPendingCourseDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort kurs?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCourseDelete && (() => {
                const subCount = subtasks.filter(s => s.course_id === pendingCourseDelete.id).length;
                return (
                  <>
                    Kursen "{pendingCourseDelete.name}" tas bort permanent.
                    {subCount > 0 && ` Även ${subCount} delmoment kopplade till kursen kommer att tas bort. Eventuella kalenderhändelser kopplade till dessa delmoment kan också påverkas.`}
                    {' '}Detta går inte att ångra.
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingCourseDelete) {
                  await handleDelete(pendingCourseDelete.id, pendingCourseDelete.name);
                  setPendingCourseDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingSubtaskDelete} onOpenChange={(o) => !o && setPendingSubtaskDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort delmoment?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSubtaskDelete && (
                <>
                  Delmomentet "{pendingSubtaskDelete.title}" tas bort permanent.
                  {pendingSubtaskDelete.event_id && ' Den kopplade kalenderhändelsen tas också bort.'}
                  {' '}Detta går inte att ångra.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingSubtaskDelete) {
                  await deleteSubtask(pendingSubtaskDelete);
                  setPendingSubtaskDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
