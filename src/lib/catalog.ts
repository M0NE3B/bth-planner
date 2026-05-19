/**
 * Helpers for reading the new database-backed course catalog and program
 * templates. Keeps backward compatibility with the existing static program
 * templates in src/lib/programs/* — callers should fall back to the static
 * templates when the catalog has not been populated yet.
 */
import { supabase } from '@/integrations/supabase/client';
import type { CourseRequirement } from './prerequisites';
import type { ProgramCourse, ProgramTemplate } from './programs/types';

export interface CatalogCourse {
  id: string;
  course_code: string;
  course_name: string;
  hp: number;
  subject_area: string | null;
  level: string | null;
  original_prerequisite_text: string | null;
  active: boolean;
}

export interface CatalogProgram {
  id: string;
  name: string;
  total_hp: number | null;
  active: boolean;
}

export interface CatalogProgramCourse {
  id: string;
  program_id: string;
  course_id: string;
  year: number;
  semester: string | null;
  period: string | null;
  mandatory: boolean;
  sort_order: number;
}

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

export interface CatalogPrerequisite {
  id: string;
  target_course_id: string;
  requirement_type: RequirementType;
  required_course_id: string | null;
  required_hp: number | null;
  required_subject_area: string | null;
  original_text: string | null;
  logic_group: number | null;
  required_level?: string | null;
  course_group_name?: string | null;
  allowed_program_groups?: string[] | null;
  allowed_course_codes?: string[] | null;
  manual_review?: boolean;
  group_operator?: GroupOperator | null;
}

/** Fetch the entire active course catalog. */
export async function fetchCourseCatalog(): Promise<CatalogCourse[]> {
  const { data, error } = await supabase
    .from('courses_catalog' as never)
    .select('*')
    .eq('active', true);
  if (error) throw error;
  return (data ?? []) as unknown as CatalogCourse[];
}

/** Fetch all active programs. */
export async function fetchPrograms(): Promise<CatalogProgram[]> {
  const { data, error } = await supabase
    .from('programs_catalog' as never)
    .select('*')
    .eq('active', true);
  if (error) throw error;
  return (data ?? []) as unknown as CatalogProgram[];
}

/** Fetch the course list for a given program from the database. */
export async function fetchProgramCourses(programId: string): Promise<
  Array<CatalogProgramCourse & { course: CatalogCourse }>
> {
  const { data, error } = await supabase
    .from('program_courses' as never)
    .select('*, course:courses_catalog(*)')
    .eq('program_id', programId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Array<
    CatalogProgramCourse & { course: CatalogCourse }
  >;
}

/** Fetch prerequisites for a given target course. */
export async function fetchPrerequisitesFor(
  targetCourseId: string,
): Promise<CatalogPrerequisite[]> {
  const { data, error } = await supabase
    .from('course_prerequisites' as never)
    .select('*')
    .eq('target_course_id', targetCourseId);
  if (error) throw error;
  return (data ?? []) as unknown as CatalogPrerequisite[];
}

/**
 * Convert a list of database prerequisite rows into the in-memory
 * CourseRequirement shape used by src/lib/prerequisites.ts. Requires the
 * course catalog so it can map required_course_id → course_code.
 */
export function prereqsToRequirements(
  rows: CatalogPrerequisite[],
  catalog: CatalogCourse[],
): CourseRequirement[] {
  const codeById = new Map(catalog.map((c) => [c.id, c.course_code]));
  return rows.map((r) => {
    const code = r.required_course_id ? codeById.get(r.required_course_id) : undefined;
    const manual = !!r.manual_review;
    const g = {
      logicGroup: r.logic_group ?? null,
      groupOperator: r.group_operator ?? null,
    };
    switch (r.requirement_type) {
      case 'completed_course':
        return { type: 'completed_course', courseCode: code ?? '', ...g };
      case 'attended_course':
        return { type: 'attended_course', courseCode: code ?? '', ...g };
      case 'completed_hp_in_course':
        return { type: 'completed_hp_in_course', courseCode: code ?? '', hp: r.required_hp ?? 0, originalText: r.original_text ?? undefined, ...g };
      case 'completed_hp_in_subject':
        return { type: 'completed_hp_in_subject', subject: r.required_subject_area ?? '', hp: r.required_hp ?? 0, originalText: r.original_text ?? undefined, ...g };
      case 'completed_total_hp':
        return { type: 'completed_total_hp', hp: r.required_hp ?? 0, originalText: r.original_text ?? undefined, ...g };
      case 'completed_hp_in_program_group':
        return {
          type: 'completed_hp_in_program_group',
          hp: r.required_hp ?? 0,
          allowedProgramGroups: r.allowed_program_groups ?? [],
          manualReview: manual,
          originalText: r.original_text ?? undefined,
          ...g,
        };
      case 'completed_hp_in_course_group':
        return {
          type: 'completed_hp_in_course_group',
          hp: r.required_hp ?? 0,
          groupName: r.course_group_name ?? '',
          allowedCourseCodes: r.allowed_course_codes ?? [],
          allowedSubjectAreas: r.required_subject_area ? [r.required_subject_area] : [],
          manualReview: manual,
          originalText: r.original_text ?? undefined,
          ...g,
        };
      case 'completed_hp_at_level':
        return {
          type: 'completed_hp_at_level',
          hp: r.required_hp ?? 0,
          level: r.required_level ?? '',
          manualReview: manual,
          originalText: r.original_text ?? undefined,
          ...g,
        };
      case 'custom_text':
      default:
        return { type: 'custom_text', text: r.original_text ?? '', blocking: false, ...g };
    }
  });
}

/**
 * Build a ProgramTemplate (the legacy in-memory shape used across the app)
 * from the database catalog. Returns null when the program has no rows yet,
 * so callers can fall back to the static template.
 */
export async function buildProgramTemplateFromCatalog(
  programName: string,
): Promise<ProgramTemplate | null> {
  const { data: programRows, error: pErr } = await supabase
    .from('programs_catalog' as never)
    .select('*')
    .eq('name', programName)
    .eq('active', true)
    .limit(1);
  if (pErr) throw pErr;
  const program = (programRows ?? [])[0] as unknown as CatalogProgram | undefined;
  if (!program) return null;

  const [pcRows, catalog] = await Promise.all([
    fetchProgramCourses(program.id),
    fetchCourseCatalog(),
  ]);
  if (pcRows.length === 0) return null;

  // Paginate — course_prerequisites can exceed the default 1000-row cap.
  const prereqs: CatalogPrerequisite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('course_prerequisites' as never)
      .select('*')
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as unknown as CatalogPrerequisite[];
    prereqs.push(...rows);
    if (rows.length < 1000) break;
  }
  const prereqsByTarget = new Map<string, CatalogPrerequisite[]>();
  for (const r of prereqs) {
    const list = prereqsByTarget.get(r.target_course_id) ?? [];
    list.push(r);
    prereqsByTarget.set(r.target_course_id, list);
  }

  const courses: ProgramCourse[] = pcRows.map((row) => {
    const reqRows = prereqsByTarget.get(row.course_id) ?? [];
    const requirements = prereqsToRequirements(reqRows, catalog);
    const semester = (row.semester === 'HT' || row.semester === 'VT')
      ? row.semester
      : 'HT';
    return {
      name: row.course.course_name,
      code: row.course.course_code,
      hp: Number(row.course.hp),
      year: row.year,
      semester,
      subject: row.course.subject_area ?? undefined,
      originalRequirementsText: row.course.original_prerequisite_text ?? undefined,
      requirements: requirements.length > 0 ? requirements : undefined,
    };
  });

  return { name: program.name, courses };
}
