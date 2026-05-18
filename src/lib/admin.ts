/**
 * Admin write helpers for the course catalog, programs, and prerequisites.
 * All writes are gated by RLS policies ("Admins manage ..."); calls from
 * non-admins will fail with a permission error.
 */
import { supabase } from '@/integrations/supabase/client';
import type { CourseRequirement } from './prerequisites';
import { normalizeRequirements } from './prerequisites';
import { bthPrograms } from './programs';
import type { ProgramCourse, ProgramTemplate } from './programs/types';
import type {
  CatalogCourse,
  CatalogPrerequisite,
  CatalogProgram,
  CatalogProgramCourse,
  RequirementType,
} from './catalog';

// ---------- Courses ----------

export interface CourseInput {
  id?: string;
  course_code: string;
  course_name: string;
  hp: number;
  subject_area?: string | null;
  level?: string | null;
  original_prerequisite_text?: string | null;
  active?: boolean;
}

export async function upsertCourse(input: CourseInput): Promise<CatalogCourse> {
  const payload = {
    course_code: input.course_code.trim(),
    course_name: input.course_name.trim(),
    hp: input.hp,
    subject_area: input.subject_area?.trim() || null,
    level: input.level?.trim() || null,
    original_prerequisite_text: input.original_prerequisite_text?.trim() || null,
    active: input.active ?? true,
  };
  const query = input.id
    ? supabase.from('courses_catalog').update(payload).eq('id', input.id).select('*').single()
    : supabase.from('courses_catalog').upsert(payload, { onConflict: 'course_code' }).select('*').single();
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as CatalogCourse;
}

export async function archiveCourse(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('courses_catalog')
    .update({ active })
    .eq('id', id);
  if (error) throw error;
}

// ---------- Prerequisites ----------

export interface PrerequisiteInput {
  requirement_type: RequirementType;
  required_course_id?: string | null;
  required_hp?: number | null;
  required_subject_area?: string | null;
  original_text?: string | null;
  logic_group?: number | null;
  required_level?: string | null;
  course_group_name?: string | null;
  allowed_program_groups?: string[] | null;
  allowed_course_codes?: string[] | null;
  manual_review?: boolean;
  group_operator?: 'AND' | 'OR' | null;
}

export async function replacePrerequisites(
  targetCourseId: string,
  rows: PrerequisiteInput[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from('course_prerequisites')
    .delete()
    .eq('target_course_id', targetCourseId);
  if (delErr) throw delErr;
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    target_course_id: targetCourseId,
    requirement_type: r.requirement_type,
    required_course_id: r.required_course_id ?? null,
    required_hp: r.required_hp ?? null,
    required_subject_area: r.required_subject_area?.trim() || null,
    original_text: r.original_text?.trim() || null,
    logic_group: r.logic_group ?? null,
    required_level: r.required_level?.trim() || null,
    course_group_name: r.course_group_name?.trim() || null,
    allowed_program_groups: r.allowed_program_groups && r.allowed_program_groups.length > 0 ? r.allowed_program_groups : null,
    allowed_course_codes: r.allowed_course_codes && r.allowed_course_codes.length > 0 ? r.allowed_course_codes : null,
    manual_review: !!r.manual_review,
    group_operator: r.group_operator ?? null,
  }));
  const { error } = await supabase.from('course_prerequisites').insert(payload as never);
  if (error) throw error;
}

// ---------- Programs ----------

export interface ProgramInput {
  id?: string;
  name: string;
  total_hp?: number | null;
  active?: boolean;
}

export async function upsertProgram(input: ProgramInput): Promise<CatalogProgram> {
  const payload = {
    name: input.name.trim(),
    total_hp: input.total_hp ?? null,
    active: input.active ?? true,
  };
  const query = input.id
    ? supabase.from('programs_catalog').update(payload).eq('id', input.id).select('*').single()
    : supabase.from('programs_catalog').upsert(payload, { onConflict: 'name' }).select('*').single();
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as CatalogProgram;
}

export async function archiveProgram(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('programs_catalog').update({ active }).eq('id', id);
  if (error) throw error;
}

export interface ProgramCourseInput {
  id?: string;
  program_id: string;
  course_id: string;
  year: number;
  semester?: string | null;
  period?: string | null;
  mandatory?: boolean;
  sort_order?: number;
}

export async function upsertProgramCourse(input: ProgramCourseInput): Promise<CatalogProgramCourse> {
  const payload = {
    program_id: input.program_id,
    course_id: input.course_id,
    year: input.year,
    semester: input.semester ?? null,
    period: input.period ?? null,
    mandatory: input.mandatory ?? true,
    sort_order: input.sort_order ?? 0,
  };
  const query = input.id
    ? supabase.from('program_courses').update(payload).eq('id', input.id).select('*').single()
    : supabase
        .from('program_courses')
        .upsert(payload, { onConflict: 'program_id,course_id' })
        .select('*')
        .single();
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as CatalogProgramCourse;
}

export async function removeProgramCourse(id: string): Promise<void> {
  const { error } = await supabase.from('program_courses').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Import from static templates ----------

export interface ImportPreview {
  programs: number;
  uniqueCourses: number;
  programCourseLinks: number;
  prerequisites: number;
}

export interface ImportProgress {
  step: string;
  done: number;
  total: number;
}

export function previewStaticImport(): ImportPreview {
  const courseSet = new Map<string, ProgramCourse>();
  let links = 0;
  let prereqs = 0;
  for (const p of bthPrograms) {
    for (const c of p.courses) {
      links += 1;
      const key = c.code.toUpperCase();
      if (!courseSet.has(key)) courseSet.set(key, c);
      prereqs += normalizeRequirements(c).length;
    }
  }
  return {
    programs: bthPrograms.length,
    uniqueCourses: courseSet.size,
    programCourseLinks: links,
    prerequisites: prereqs,
  };
}

function requirementToRow(r: CourseRequirement, codeToId: Map<string, string>): PrerequisiteInput {
  switch (r.type) {
    case 'completed_course':
      return {
        requirement_type: 'completed_course',
        required_course_id: codeToId.get(r.courseCode.toUpperCase()) ?? null,
        original_text: r.courseCode,
      };
    case 'attended_course':
      return {
        requirement_type: 'attended_course',
        required_course_id: codeToId.get(r.courseCode.toUpperCase()) ?? null,
        original_text: r.courseCode,
      };
    case 'completed_hp_in_course':
      return {
        requirement_type: 'completed_hp_in_course',
        required_course_id: codeToId.get(r.courseCode.toUpperCase()) ?? null,
        required_hp: r.hp,
      };
    case 'completed_hp_in_subject':
      return {
        requirement_type: 'completed_hp_in_subject',
        required_subject_area: r.subject,
        required_hp: r.hp,
      };
    case 'completed_total_hp':
      return { requirement_type: 'completed_total_hp', required_hp: r.hp };
    case 'custom_text':
      return { requirement_type: 'custom_text', original_text: r.text };
  }
}

/**
 * Idempotent import: upsert all unique courses (by code), all programs (by name),
 * then their links and prerequisites. Calls progressCb between phases.
 */
export async function importFromStaticTemplates(
  templates: ProgramTemplate[] = bthPrograms,
  progressCb?: (p: ImportProgress) => void,
): Promise<ImportPreview> {
  // 1. Build unique course map
  const uniqueCourses = new Map<string, ProgramCourse>();
  for (const p of templates) {
    for (const c of p.courses) {
      const key = c.code.toUpperCase();
      if (!uniqueCourses.has(key)) uniqueCourses.set(key, c);
    }
  }

  progressCb?.({ step: 'Importerar kurser', done: 0, total: uniqueCourses.size });

  // 2. Upsert courses
  const coursePayload = Array.from(uniqueCourses.values()).map((c) => ({
    course_code: c.code,
    course_name: c.name,
    hp: c.hp,
    subject_area: c.subject ?? null,
    original_prerequisite_text: c.originalRequirementsText ?? null,
    active: true,
  }));
  const { data: upserted, error: cErr } = await supabase
    .from('courses_catalog')
    .upsert(coursePayload, { onConflict: 'course_code' })
    .select('id, course_code');
  if (cErr) throw cErr;
  const codeToId = new Map<string, string>();
  for (const row of upserted ?? []) {
    codeToId.set((row as { course_code: string }).course_code.toUpperCase(), (row as { id: string }).id);
  }
  progressCb?.({ step: 'Importerar kurser', done: uniqueCourses.size, total: uniqueCourses.size });

  // 3. Upsert programs
  progressCb?.({ step: 'Importerar program', done: 0, total: templates.length });
  const programPayload = templates.map((p) => ({
    name: p.name,
    total_hp: p.courses.reduce((s, c) => s + (Number(c.hp) || 0), 0),
    active: true,
  }));
  const { data: progRows, error: pErr } = await supabase
    .from('programs_catalog')
    .upsert(programPayload, { onConflict: 'name' })
    .select('id, name');
  if (pErr) throw pErr;
  const nameToProgramId = new Map<string, string>();
  for (const row of progRows ?? []) {
    nameToProgramId.set((row as { name: string }).name, (row as { id: string }).id);
  }
  progressCb?.({ step: 'Importerar program', done: templates.length, total: templates.length });

  // 4. Program courses + prerequisites per program
  let totalPrereqs = 0;
  let totalLinks = 0;
  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i];
    progressCb?.({ step: `Länkar kurser för ${tpl.name}`, done: i, total: templates.length });
    const programId = nameToProgramId.get(tpl.name);
    if (!programId) continue;

    const links = tpl.courses
      .map((c, idx) => {
        const courseId = codeToId.get(c.code.toUpperCase());
        if (!courseId) return null;
        return {
          program_id: programId,
          course_id: courseId,
          year: c.year,
          semester: c.semester,
          mandatory: true,
          sort_order: idx,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (links.length > 0) {
      const { error: linkErr } = await supabase
        .from('program_courses')
        .upsert(links, { onConflict: 'program_id,course_id' });
      if (linkErr) throw linkErr;
      totalLinks += links.length;
    }

    // Prerequisites — for each course in this program, replace its rows
    for (const c of tpl.courses) {
      const courseId = codeToId.get(c.code.toUpperCase());
      if (!courseId) continue;
      const reqs = normalizeRequirements(c);
      if (reqs.length === 0) continue;
      const rows = reqs.map((r) => requirementToRow(r, codeToId));
      await replacePrerequisites(courseId, rows);
      totalPrereqs += rows.length;
    }
  }

  progressCb?.({ step: 'Klar', done: templates.length, total: templates.length });

  return {
    programs: templates.length,
    uniqueCourses: uniqueCourses.size,
    programCourseLinks: totalLinks,
    prerequisites: totalPrereqs,
  };
}

// Re-export to make imports easier from the admin UI
export type { CatalogCourse, CatalogPrerequisite, CatalogProgram, CatalogProgramCourse };
