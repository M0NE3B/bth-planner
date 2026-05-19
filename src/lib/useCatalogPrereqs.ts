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
  /** Code → typed CourseRequirement[] derived from catalog prereqs. */
  requirementsByCode: Map<string, CourseRequirement[]>;
  /** Code → list of target course codes that depend on it (i.e. it unlocks them). */
  blocksByCode: Map<string, string[]>;
  /** Code → original_prerequisite_text from catalog. */
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
    if (c.original_prerequisite_text) originalTextByCode.set(c.course_code, c.original_prerequisite_text);
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
    const reqs = prereqsToRequirements(rows, courses);
    requirementsByCode.set(target.course_code, reqs);
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
