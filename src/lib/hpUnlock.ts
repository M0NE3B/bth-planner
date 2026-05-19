/**
 * Computes "HP unlock" relationships used by Dashboard's Fokusera härnäst.
 *
 * Unlike the classic blocker map (course → other courses that strictly
 * require it), this also surfaces typed HP-based requirements:
 *   - completed_hp_in_course     (e.g. "minst 6 HP från MA1448")
 *   - completed_hp_in_subject    (e.g. "minst 15 HP inom Matematik")
 *   - completed_total_hp         (e.g. "minst 150 HP totalt avklarade")
 *
 * The returned map keys are course codes the student already has in their
 * plan. For each such code, the value is a list of unlock entries pointing
 * to target courses (also in plan) whose unmet HP requirement progresses
 * when the student earns HP from this code.
 *
 * Pure function — no React / Supabase — so it's easy to unit test.
 */
import {
  evaluateRequirement,
  primarySubject,
  resolveSubject,
  type CourseRequirement,
  type EvalContext,
} from './prerequisites';

export type UnlockKind = 'hp_in_course' | 'hp_in_subject' | 'total_hp';

export interface UnlockEntry {
  target: string;
  targetYear: number;
  kind: UnlockKind;
}

export interface ComputeHpUnlockInput {
  /** Catalog: target course code → typed requirements. */
  requirementsByCode: Map<string, CourseRequirement[]>;
  /** Student-facing evaluation context (courses + subtasks with subject). */
  evalContext: EvalContext;
  /** Course codes the student actually has in their plan. */
  planCodes: Set<string>;
  /** Optional course code → primary subject (huvudområde). Falls back to prefix. */
  subjectByCode?: Map<string, string>;
  /** Optional course code → year. Defaults to 99 when unknown. */
  yearByCode?: Map<string, number>;
}

const primarySubjectOf = (code: string, override?: string | null): string => {
  if (override) return primarySubject(override) || override;
  return resolveSubject(code).primary;
};

export function computeHpUnlockMap(input: ComputeHpUnlockInput): Map<string, UnlockEntry[]> {
  const { requirementsByCode, evalContext, planCodes } = input;
  const subjectByCode = input.subjectByCode ?? new Map<string, string>();
  const yearByCode = input.yearByCode ?? new Map<string, number>();

  const out = new Map<string, UnlockEntry[]>();
  /** Track (source|target|kind) to dedupe. */
  const seen = new Set<string>();

  const add = (source: string, target: string, kind: UnlockKind) => {
    const sourceUC = source.toUpperCase();
    const targetUC = target.toUpperCase();
    if (sourceUC === targetUC) return; // a course can't unlock itself
    const key = `${sourceUC}|${targetUC}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    const arr = out.get(source) ?? [];
    arr.push({ target, targetYear: yearByCode.get(target) ?? 99, kind });
    out.set(source, arr);
  };

  for (const [target, reqs] of requirementsByCode) {
    if (!planCodes.has(target)) continue;

    for (const req of reqs) {
      // Hard ignore: anything informational / manual
      if (req.type === 'custom_text') continue;
      if (req.manualReview) continue;
      if (req.type === 'completed_hp_in_program_group') continue;
      if (req.type === 'completed_hp_at_level') continue;
      // Classic course→course relationships are already covered by
      // useCatalogPrereqs.blocksByCode → blockingMap. Skip them here.
      if (req.type === 'completed_course' || req.type === 'attended_course') continue;
      if (req.type === 'completed_hp_in_course_group') continue;

      // Only surface unmet requirements
      const result = evaluateRequirement(req, evalContext);
      if (result.fulfilled) continue;

      switch (req.type) {
        case 'completed_hp_in_course': {
          // The required course is the unlock source (only if it's in plan).
          if (!planCodes.has(req.courseCode)) break;
          add(req.courseCode, target, 'hp_in_course');
          break;
        }
        case 'completed_hp_in_subject': {
          const subject = primarySubject(req.subject)?.toLowerCase();
          if (!subject) break;
          // Every plan course in that subject can contribute HP.
          for (const code of planCodes) {
            const cs = primarySubjectOf(code, subjectByCode.get(code))?.toLowerCase();
            if (cs === subject) add(code, target, 'hp_in_subject');
          }
          break;
        }
        case 'completed_total_hp': {
          // Any plan course that isn't already completed can move the needle.
          for (const code of planCodes) {
            const c = evalContext.courses.find((x) => x.course_code === code);
            if (c && c.status === 'completed') continue;
            add(code, target, 'total_hp');
          }
          break;
        }
      }
    }
  }

  return out;
}

/**
 * Score-side helper: compute a capped bonus + a short label list from a list
 * of unlock entries for a single course code. Kept here so the same logic
 * can be unit tested without dragging in the Dashboard component.
 */
export interface UnlockBonus {
  bonus: number;
  reasons: { kind: UnlockKind; target: string }[];
}

export function computeUnlockBonus(
  entries: UnlockEntry[] | undefined,
  opts: {
    /** Lowest year still in progress (i.e. the student's current year). */
    currentYear: number;
    /** Whether the event itself contributes HP — required for total_hp bonus. */
    eventHasHp: boolean;
    /** Targets that already got a classic blocking bonus — skip them here. */
    excludeTargets?: Set<string>;
  },
): UnlockBonus {
  if (!entries || entries.length === 0) return { bonus: 0, reasons: [] };
  const exclude = opts.excludeTargets ?? new Set<string>();
  const reasons: { kind: UnlockKind; target: string }[] = [];

  const tier = (year: number, near: number, mid: number, far: number): number => {
    if (year <= opts.currentYear) return near;
    if (year === opts.currentYear + 1) return mid;
    return far;
  };

  // Track the best bonus per kind, plus collect example reasons.
  let hpInCourse = 0;
  let hpInSubject = 0;
  let totalHp = 0;
  const seenReason = new Set<string>();

  for (const e of entries) {
    if (exclude.has(e.target)) continue;
    if (e.kind === 'hp_in_course') {
      hpInCourse = Math.max(hpInCourse, tier(e.targetYear, 10, 6, 2));
    } else if (e.kind === 'hp_in_subject') {
      hpInSubject = Math.max(hpInSubject, tier(e.targetYear, 6, 4, 1));
    } else if (e.kind === 'total_hp') {
      if (opts.eventHasHp) totalHp = Math.max(totalHp, 3);
    }
    const key = `${e.kind}|${e.target}`;
    if (!seenReason.has(key)) {
      seenReason.add(key);
      reasons.push({ kind: e.kind, target: e.target });
    }
  }

  const raw = hpInCourse + hpInSubject + totalHp;
  return { bonus: Math.min(raw, 18), reasons };
}
