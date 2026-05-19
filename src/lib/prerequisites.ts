/**
 * Prerequisite requirement model + evaluator.
 *
 * Supports multiple requirement types (completed course, attended/started
 * course, completed HP in a course, completed HP within a "huvudområde"/
 * subject area, total completed HP, or a manual custom text requirement).
 *
 * Legacy `prerequisites: string[]` data is normalized to
 * `completed_course` requirements so existing program templates keep working.
 */

export type RequirementType =
  | 'completed_course'
  | 'attended_course'
  | 'completed_hp_in_course'
  | 'completed_hp_in_subject'
  | 'completed_total_hp'
  | 'completed_hp_in_program_group'
  | 'completed_hp_in_course_group'
  | 'completed_hp_at_level'
  | 'custom_text';

export type GroupOperator = 'AND' | 'OR';

export interface BaseRequirement {
  type: RequirementType;
  /** Optional admin-supplied label shown verbatim instead of generated text. */
  label?: string;
  /** Logical grouping for alternative requirements. Rows sharing the same
   *  logicGroup are combined with `groupOperator` (default AND). */
  logicGroup?: number | null;
  groupOperator?: GroupOperator | null;
  /** When true, treat as informational only — never block automatically. */
  manualReview?: boolean;
  /** Original prerequisite text snippet for display alongside structured rule. */
  originalText?: string;
}

export interface CompletedCourseRequirement extends BaseRequirement {
  type: 'completed_course';
  courseCode: string;
}
export interface AttendedCourseRequirement extends BaseRequirement {
  type: 'attended_course';
  courseCode: string;
}
export interface CompletedHpInCourseRequirement extends BaseRequirement {
  type: 'completed_hp_in_course';
  courseCode: string;
  hp: number;
}
export interface CompletedHpInSubjectRequirement extends BaseRequirement {
  type: 'completed_hp_in_subject';
  subject: string;
  hp: number;
}
export interface CompletedTotalHpRequirement extends BaseRequirement {
  type: 'completed_total_hp';
  hp: number;
}
export interface CompletedHpInProgramGroupRequirement extends BaseRequirement {
  type: 'completed_hp_in_program_group';
  hp: number;
  /** Allowed program names/categories, e.g. ["Maskinteknik", "Industriell ekonomi"]. */
  allowedProgramGroups: string[];
}
export interface CompletedHpInCourseGroupRequirement extends BaseRequirement {
  type: 'completed_hp_in_course_group';
  hp: number;
  /** Human label for the group, e.g. "CAD/Datorstöd för ingenjörsarbete". */
  groupName: string;
  /** Optional explicit course codes that fulfill the group. */
  allowedCourseCodes?: string[];
  /** Optional huvudområden whose courses count toward the group. */
  allowedSubjectAreas?: string[];
}
export interface CompletedHpAtLevelRequirement extends BaseRequirement {
  type: 'completed_hp_at_level';
  hp: number;
  /** Course level token, e.g. "advanced" / "A1N". */
  level: string;
}
export interface CustomTextRequirement extends BaseRequirement {
  type: 'custom_text';
  text: string;
  /** When true, treat as blocking. Default false (informational only). */
  blocking?: boolean;
}

export type CourseRequirement =
  | CompletedCourseRequirement
  | AttendedCourseRequirement
  | CompletedHpInCourseRequirement
  | CompletedHpInSubjectRequirement
  | CompletedTotalHpRequirement
  | CompletedHpInProgramGroupRequirement
  | CompletedHpInCourseGroupRequirement
  | CompletedHpAtLevelRequirement
  | CustomTextRequirement;

export const REQUIREMENT_TYPE_LABEL: Record<RequirementType, string> = {
  completed_course: 'Avklarad kurs',
  attended_course: 'Genomgången/påbörjad kurs',
  completed_hp_in_course: 'Avklarade HP i kurs',
  completed_hp_in_subject: 'Avklarade HP inom huvudområde',
  completed_total_hp: 'Totalt avklarade HP',
  completed_hp_in_program_group: 'Avklarade HP inom programgrupp',
  completed_hp_in_course_group: 'Avklarade HP inom kursgrupp',
  completed_hp_at_level: 'Avklarade HP på nivå',
  custom_text: 'Manuellt krav',
};

// ---------- Subject (huvudområde) ----------

const PREFIX_TO_SUBJECT: Record<string, string> = {
  MA: 'Matematik',
  MS: 'Matematik',
  DV: 'Datavetenskap',
  IY: 'Industriell ekonomi och management',
  FY: 'Fysik',
  PA: 'Programvaruteknik',
  ET: 'Elektroteknik',
  SL: 'Hållbar utveckling',
  MT: 'Maskinteknik',
  TE: 'Teknik',
};

/** Returns the primary subject (everything before the first comma), trimmed. */
export function primarySubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const head = subject.split(',')[0]?.trim();
  return head || null;
}

/** Resolves a course's huvudområde from explicit data, falling back to code prefix. */
export function resolveSubject(
  code: string,
  explicit?: string | null,
): { full: string; primary: string } {
  const cleanExplicit = explicit?.trim();
  if (cleanExplicit) {
    return { full: cleanExplicit, primary: primarySubject(cleanExplicit) || cleanExplicit };
  }
  const prefix = (code.match(/^[A-Za-z]+/)?.[0] || '').toUpperCase();
  const guessed = PREFIX_TO_SUBJECT[prefix];
  const value = guessed || 'Okänt huvudområde';
  return { full: value, primary: value };
}

// ---------- Normalization (legacy -> typed requirements) ----------

interface CourseLike {
  code: string;
  prerequisites?: string[];
  requirements?: CourseRequirement[];
  originalRequirementsText?: string;
}

/**
 * Returns the typed requirement list for a course. If explicit `requirements`
 * exist they are returned as-is; otherwise legacy `prerequisites` codes are
 * converted to `completed_course`. If the original text mentions "genomgång"
 * for a code, that code is treated as `attended_course` instead.
 */
export function normalizeRequirements(course: CourseLike): CourseRequirement[] {
  if (course.requirements && course.requirements.length > 0) return course.requirements;
  const codes = course.prerequisites || [];
  if (codes.length === 0) return [];
  const text = (course.originalRequirementsText || '').toLowerCase();
  return codes.map<CourseRequirement>((code) => {
    const codeLower = code.toLowerCase();
    if (text && new RegExp(`genomg[åa]ng[a-zåäö]{0,12}[ \\t][^.]{0,200}\\b${codeLower}\\b`).test(text)) {
      return { type: 'attended_course', courseCode: code };
    }
    return { type: 'completed_course', courseCode: code };
  });
}

// ---------- Evaluation ----------

export type UserCourseStatus = 'completed' | 'partly' | 'not_started';

export interface EvalCourse {
  course_code: string;
  status: UserCourseStatus | string;
  hp: number;
  /** Optional subject value attached at evaluation time (preferred over fallback). */
  subject?: string | null;
}

export interface EvalSubtask {
  course_code: string;
  completed: boolean;
  hp: number;
}

export interface EvalContext {
  courses: EvalCourse[];
  subtasks?: EvalSubtask[];
}

export interface RequirementResult {
  requirement: CourseRequirement;
  fulfilled: boolean;
  /** Soft = partly fulfilled (e.g. attended_course is met by partly status). */
  severity: 'met' | 'soft' | 'hard';
  /** Human-readable Swedish description. */
  message: string;
  /** Numeric progress for HP-style requirements (currentHp/requiredHp). */
  progress?: { current: number; required: number };
}

function courseDisplay(code: string, name?: string | null): string {
  return name ? `${name} (${code})` : code;
}

/** Completed HP attributable to a course code (full course HP if completed,
 *  otherwise sum of completed subtasks for that course). */
export function completedHpForCourse(code: string, ctx: EvalContext): number {
  const c = ctx.courses.find(x => x.course_code === code);
  if (c && c.status === 'completed') return Number(c.hp) || 0;
  const subs = (ctx.subtasks || []).filter(s => s.course_code === code && s.completed);
  return subs.reduce((sum, s) => sum + (Number(s.hp) || 0), 0);
}

/** Completed HP within a huvudområde. Avoids double counting:
 *  fully completed courses contribute full HP; otherwise only completed subtasks. */
export function completedHpInSubject(subject: string, ctx: EvalContext): number {
  const target = subject.trim().toLowerCase();
  let total = 0;
  const accountedCourses = new Set<string>();
  for (const c of ctx.courses) {
    const cs = primarySubject(c.subject || resolveSubject(c.course_code).primary)?.toLowerCase();
    if (cs !== target) continue;
    if (c.status === 'completed') {
      total += Number(c.hp) || 0;
      accountedCourses.add(c.course_code);
    }
  }
  for (const s of ctx.subtasks || []) {
    if (!s.completed) continue;
    if (accountedCourses.has(s.course_code)) continue;
    const c = ctx.courses.find(x => x.course_code === s.course_code);
    const subj = primarySubject(c?.subject || resolveSubject(s.course_code).primary)?.toLowerCase();
    if (subj === target) total += Number(s.hp) || 0;
  }
  return total;
}

export function totalCompletedHp(ctx: EvalContext): number {
  let total = 0;
  const accounted = new Set<string>();
  for (const c of ctx.courses) {
    if (c.status === 'completed') {
      total += Number(c.hp) || 0;
      accounted.add(c.course_code);
    }
  }
  for (const s of ctx.subtasks || []) {
    if (s.completed && !accounted.has(s.course_code)) total += Number(s.hp) || 0;
  }
  return total;
}

export interface EvaluateOptions {
  /** Map of course code -> course name for nicer messages. */
  nameMap?: Map<string, string>;
}

export function evaluateRequirement(
  req: CourseRequirement,
  ctx: EvalContext,
  opts: EvaluateOptions = {},
): RequirementResult {
  const nameOf = (code: string) => opts.nameMap?.get(code);

  switch (req.type) {
    case 'completed_course': {
      const c = ctx.courses.find(x => x.course_code === req.courseCode);
      const status = c?.status;
      if (status === 'completed') {
        return { requirement: req, fulfilled: true, severity: 'met', message: `Avklarad: ${courseDisplay(req.courseCode, nameOf(req.courseCode))}` };
      }
      const severity: 'soft' | 'hard' = status === 'partly' ? 'soft' : 'hard';
      return {
        requirement: req,
        fulfilled: false,
        severity,
        message: `Kräver avklarad kurs: ${courseDisplay(req.courseCode, nameOf(req.courseCode))}`,
      };
    }
    case 'attended_course': {
      const c = ctx.courses.find(x => x.course_code === req.courseCode);
      const status = c?.status;
      const met = status === 'completed' || status === 'partly';
      return {
        requirement: req,
        fulfilled: met,
        severity: met ? 'met' : 'hard',
        message: met
          ? `Genomgången: ${courseDisplay(req.courseCode, nameOf(req.courseCode))}`
          : `Kräver genomgången/påbörjad kurs: ${courseDisplay(req.courseCode, nameOf(req.courseCode))}`,
      };
    }
    case 'completed_hp_in_course': {
      const have = completedHpForCourse(req.courseCode, ctx);
      const met = have + 1e-6 >= req.hp;
      return {
        requirement: req,
        fulfilled: met,
        severity: met ? 'met' : have > 0 ? 'soft' : 'hard',
        message: met
          ? `Minst ${req.hp} HP klart i ${courseDisplay(req.courseCode, nameOf(req.courseCode))}`
          : `Kräver minst ${req.hp} HP från ${courseDisplay(req.courseCode, nameOf(req.courseCode))}`,
        progress: { current: have, required: req.hp },
      };
    }
    case 'completed_hp_in_subject': {
      const have = completedHpInSubject(req.subject, ctx);
      const met = have + 1e-6 >= req.hp;
      return {
        requirement: req,
        fulfilled: met,
        severity: met ? 'met' : have > 0 ? 'soft' : 'hard',
        message: met
          ? `Minst ${req.hp} HP klart inom ${req.subject}`
          : `Kräver minst ${req.hp} HP inom ${req.subject}`,
        progress: { current: have, required: req.hp },
      };
    }
    case 'completed_total_hp': {
      const have = totalCompletedHp(ctx);
      const met = have + 1e-6 >= req.hp;
      // Original text from the course plan often clarifies *what* the HP
      // requirement is about (e.g. "Matematisk statistik", "programmering").
      // Show a short snippet so the rule isn't ambiguous in the UI.
      const ctxSnippet = (req.originalText || '').trim();
      const short = ctxSnippet.length > 90 ? ctxSnippet.slice(0, 87) + '…' : ctxSnippet;
      const suffix = short ? ` – ${short}` : '';
      return {
        requirement: req,
        fulfilled: met,
        severity: met ? 'met' : have > 0 ? 'soft' : 'hard',
        message: met
          ? `Minst ${req.hp} HP totalt avklarade${suffix}`
          : `Kräver minst ${req.hp} avklarade HP totalt${suffix}`,
        progress: { current: have, required: req.hp },
      };
    }
    case 'completed_hp_in_program_group': {
      // Cannot be evaluated reliably without program-group data — informational.
      const groups = (req.allowedProgramGroups || []).join(', ') || 'angiven programgrupp';
      return {
        requirement: req,
        fulfilled: true,
        severity: 'met',
        message: `Manuellt krav: minst ${req.hp} HP från ${groups}`,
      };
    }
    case 'completed_hp_in_course_group': {
      // Evaluate when explicit course codes or subject areas are known.
      const codes = new Set((req.allowedCourseCodes || []).map((c) => c.toUpperCase()));
      const subjects = (req.allowedSubjectAreas || []).map((s) => s.toLowerCase());
      const canEvaluate = !req.manualReview && (codes.size > 0 || subjects.length > 0);
      if (!canEvaluate) {
        return {
          requirement: req,
          fulfilled: true,
          severity: 'met',
          message: `Manuellt krav: minst ${req.hp} HP inom ${req.groupName || 'kursgrupp'}`,
        };
      }
      let have = 0;
      const accounted = new Set<string>();
      for (const c of ctx.courses) {
        const codeMatch = codes.has(c.course_code.toUpperCase());
        const subjMatch = subjects.length > 0 && subjects.includes(
          (primarySubject(c.subject || resolveSubject(c.course_code).primary) || '').toLowerCase(),
        );
        if ((codeMatch || subjMatch) && c.status === 'completed') {
          have += Number(c.hp) || 0;
          accounted.add(c.course_code);
        }
      }
      for (const s of ctx.subtasks || []) {
        if (!s.completed || accounted.has(s.course_code)) continue;
        const course = ctx.courses.find((x) => x.course_code === s.course_code);
        const codeMatch = codes.has(s.course_code.toUpperCase());
        const subjMatch = subjects.length > 0 && subjects.includes(
          (primarySubject(course?.subject || resolveSubject(s.course_code).primary) || '').toLowerCase(),
        );
        if (codeMatch || subjMatch) have += Number(s.hp) || 0;
      }
      const met = have + 1e-6 >= req.hp;
      return {
        requirement: req,
        fulfilled: met,
        severity: met ? 'met' : have > 0 ? 'soft' : 'hard',
        message: met
          ? `Minst ${req.hp} HP klart inom ${req.groupName || 'kursgrupp'}`
          : `Kräver minst ${req.hp} HP inom ${req.groupName || 'kursgrupp'}`,
        progress: { current: have, required: req.hp },
      };
    }
    case 'completed_hp_at_level': {
      // No course-level data on EvalCourse yet — informational only.
      return {
        requirement: req,
        fulfilled: true,
        severity: 'met',
        message: `Manuellt krav: minst ${req.hp} HP på nivå ${req.level || 'angiven'}`,
      };
    }
    case 'custom_text': {
      const isManual = req.manualReview || !req.blocking;
      return {
        requirement: req,
        fulfilled: isManual,
        severity: isManual ? 'met' : 'hard',
        message: `Manuellt krav: ${req.text}`,
      };
    }
  }
}

export interface CourseRequirementsResult {
  results: RequirementResult[];
  unmet: RequirementResult[];
  hardUnmet: RequirementResult[];
  softUnmet: RequirementResult[];
  allMet: boolean;
}

export function evaluateCourseRequirements(
  course: CourseLike,
  ctx: EvalContext,
  opts: EvaluateOptions = {},
): CourseRequirementsResult {
  const reqs = normalizeRequirements(course);
  let rawResults = reqs.map(r => evaluateRequirement(r, ctx, opts));

  // If we have a "minst X HP från KURS"-krav för en kurs så är "kräver
  // genomgång/avklarad" för samma kurs redundant — visa bara HP-kravet.
  const hpCourseCodes = new Set(
    rawResults
      .filter(r => r.requirement.type === 'completed_hp_in_course')
      .map(r => (r.requirement as { courseCode: string }).courseCode),
  );
  if (hpCourseCodes.size > 0) {
    rawResults = rawResults.filter(r => {
      const t = r.requirement.type;
      if (t !== 'attended_course' && t !== 'completed_course') return true;
      const code = (r.requirement as { courseCode: string }).courseCode;
      return !hpCourseCodes.has(code);
    });
  }

  // Coalesce OR groups (rows sharing logicGroup with groupOperator === 'OR')
  // into a single composite result so the UI shows "X ELLER Y" instead of
  // two AND-style bullets.
  const results: RequirementResult[] = [];
  const orGroups = new Map<number, RequirementResult[]>();
  for (const r of rawResults) {
    const lg = r.requirement.logicGroup;
    const op = r.requirement.groupOperator;
    if (lg != null && op === 'OR') {
      const arr = orGroups.get(lg) ?? [];
      arr.push(r);
      orGroups.set(lg, arr);
    } else {
      results.push(r);
    }
  }
  for (const [, group] of orGroups) {
    if (group.length === 1) { results.push(group[0]); continue; }
    const fulfilled = group.some(g => g.fulfilled);
    const severity: RequirementResult['severity'] = fulfilled
      ? 'met'
      : group.some(g => g.severity === 'soft') ? 'soft' : 'hard';
    // Strip a leading "Kräver " / "Avklarad" / "Genomgången" prefix so the
    // joined message reads naturally.
    const stripPrefix = (m: string) => m
      .replace(/^Kräver\s+(avklarad kurs|genomgången\/påbörjad kurs|minst\s+)/i, (_, p) => /minst/i.test(p) ? 'minst ' : '')
      .replace(/^(Avklarad|Genomgången):\s*/i, '');
    const parts = group.map(g => stripPrefix(g.message));
    const verb = fulfilled ? 'Uppfyllt – något av:' : 'Kräver något av:';
    results.push({
      requirement: group[0].requirement,
      fulfilled,
      severity,
      message: `${verb} ${parts.join(' ELLER ')}`,
    });
  }

  // Dedupe identical messages (data often has duplicate prereq rows from
  // imports — students shouldn't see the same rule listed 3 times).
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    if (seen.has(r.message)) return false;
    seen.add(r.message);
    return true;
  });
  const unmet = deduped.filter(r => !r.fulfilled);
  return {
    results: deduped,
    unmet,
    hardUnmet: unmet.filter(r => r.severity === 'hard'),
    softUnmet: unmet.filter(r => r.severity === 'soft'),
    allMet: unmet.length === 0,
  };
}
