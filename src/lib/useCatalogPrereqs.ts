/**
 * Shared hook that loads the database catalog (courses + prerequisites)
 * once and exposes derived helpers the student app uses to evaluate
 * prerequisite status, blocker impact and original text.
 *
 * Falls back gracefully when no catalog data exists yet — callers should
 * merge these maps with their existing static-template maps so behavior
 * never regresses for programs that haven't been imported yet.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { prereqsToRequirements, type CatalogCourse, type CatalogPrerequisite } from './catalog';
import type { CourseRequirement } from './prerequisites';

export interface CatalogPrereqIndex {
  loading: boolean;
  /** Catalog courses keyed by uppercase course_code. */
  courseByCode: Map<string, CatalogCourse>;
  /** Code → display name (catalog only). */
  codeToName: Map<string, string>;
  /** Code → typed CourseRequirement[] derived from catalog prereqs (gymnasium-filtered). */
  requirementsByCode: Map<string, CourseRequirement[]>;
  /** Code → list of target course codes that depend on it (i.e. it unlocks them). */
  blocksByCode: Map<string, string[]>;
  /** Code → original_prerequisite_text from catalog (cleaned, gymnasium removed). */
  originalTextByCode: Map<string, string>;
}

const EMPTY: CatalogPrereqIndex = {
  loading: true,
  courseByCode: new Map(),
  codeToName: new Map(),
  requirementsByCode: new Map(),
  blocksByCode: new Map(),
  originalTextByCode: new Map(),
};

/**
 * Recognises gymnasium / general entry requirements that we explicitly want
 * to hide from students — they are about *being admitted*, not about
 * progressing inside the program.
 */
const GYMNASIUM_PATTERNS: RegExp[] = [
  /grundläggande\s+behörighet/i,
  /områdesbehörighet/i,
  /matematik\s*[1-4]?\s*[a-e]?\b/i,
  /\bma\s*[1-4]\s*[a-e]?\b/i,
  /\bfysik\s*[12]\b/i,
  /\bkemi\s*[12]\b/i,
  /\bbiologi\s*[12]\b/i,
  /\bengelska\s*[5-7]\b/i,
  /\bsvenska\s*[1-3]\b/i,
  /gymnasie/i,
  /samhällskunskap\s*[1-3]/i,
  /standardbehörighet/i,
  /yrkeserfarenhet/i,
  /arbetslivserfarenhet/i,
];

export function isGymnasiumText(text: string | null | undefined): boolean {
  if (!text) return false;
  return GYMNASIUM_PATTERNS.some((p) => p.test(text));
}

/** Drop a free-text requirement when it's clearly gymnasium/entry-only. */
export function isGymnasiumRequirement(r: CourseRequirement): boolean {
  if (r.type === 'custom_text') return isGymnasiumText(r.text) || isGymnasiumText(r.originalText);
  // Free-text-only program/course-group rules also tend to be entry-noise
  if ((r.type === 'completed_hp_in_program_group' || r.type === 'completed_hp_in_course_group') && r.manualReview) {
    return isGymnasiumText(r.originalText);
  }
  return false;
}

/** Remove gymnasium sentences from an original prerequisite text block. */
export function cleanOriginalText(text: string | null | undefined): string {
  if (!text) return '';
  const sentences = text.split(/(?<=[.;])\s+/);
  return sentences.filter((s) => !isGymnasiumText(s)).join(' ').trim();
}

/** Filter a "blocks" list down to courses the student actually has in their plan. */
export function filterPlanBlocks(blocks: string[] | undefined, planCodes: Set<string>): string[] {
  if (!blocks || blocks.length === 0) return [];
  return blocks.filter((c) => planCodes.has(c));
}

export function useCatalogPrereqs(): CatalogPrereqIndex {
  const [state, setState] = useState<CatalogPrereqIndex>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [coursesRes, prereqsRes] = await Promise.all([
        supabase.from('courses_catalog' as never).select('*'),
        supabase.from('course_prerequisites' as never).select('*'),
      ]);
      if (cancelled) return;
      const courses = (coursesRes.data ?? []) as unknown as CatalogCourse[];
      const prereqs = (prereqsRes.data ?? []) as unknown as CatalogPrerequisite[];
      setState(buildIndex(courses, prereqs));
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function buildIndex(
  courses: CatalogCourse[],
  prereqs: CatalogPrerequisite[],
): CatalogPrereqIndex {
  const courseByCode = new Map<string, CatalogCourse>();
  const codeToName = new Map<string, string>();
  const originalTextByCode = new Map<string, string>();
  const courseById = new Map<string, CatalogCourse>();
  for (const c of courses) {
    courseByCode.set(c.course_code.toUpperCase(), c);
    courseById.set(c.id, c);
    codeToName.set(c.course_code, c.course_name);
    const cleaned = cleanOriginalText(c.original_prerequisite_text);
    if (cleaned) originalTextByCode.set(c.course_code, cleaned);
  }
  // Group prereq rows by target course
  const byTarget = new Map<string, CatalogPrerequisite[]>();
  for (const r of prereqs) {
    const arr = byTarget.get(r.target_course_id) ?? [];
    arr.push(r);
    byTarget.set(r.target_course_id, arr);
  }
  const requirementsByCode = new Map<string, CourseRequirement[]>();
  const blocksByCode = new Map<string, string[]>();
  for (const [targetId, rows] of byTarget) {
    const target = courseById.get(targetId);
    if (!target) continue;
    const reqs = prereqsToRequirements(rows, courses).filter((r) => !isGymnasiumRequirement(r));
    if (reqs.length > 0) requirementsByCode.set(target.course_code, reqs);
    // Build blocker map (which courses does X unlock?)
    for (const r of rows) {
      if (
        (r.requirement_type === 'completed_course' || r.requirement_type === 'attended_course'
          || r.requirement_type === 'completed_hp_in_course')
        && r.required_course_id
      ) {
        const required = courseById.get(r.required_course_id);
        if (!required) continue;
        const list = blocksByCode.get(required.course_code) ?? [];
        if (!list.includes(target.course_code)) list.push(target.course_code);
        blocksByCode.set(required.course_code, list);
      }
    }
  }
  return { loading: false, courseByCode, codeToName, requirementsByCode, blocksByCode, originalTextByCode };
}
