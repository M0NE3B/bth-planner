/**
 * JSON catalog import: parse, validate, plan diffs and execute upserts.
 * Idempotent — never deletes rows. Admin RLS gates the writes.
 */
import { supabase } from '@/integrations/supabase/client';
import type { RequirementType } from '../catalog';

const REQ_TYPES: RequirementType[] = [
  'completed_course',
  'attended_course',
  'completed_hp_in_course',
  'completed_hp_in_subject',
  'completed_total_hp',
  'completed_hp_in_program_group',
  'completed_hp_in_course_group',
  'completed_hp_at_level',
  'custom_text',
];

export interface JsonProgram {
  name: string;
  total_hp?: number | null;
  active?: boolean;
}
export interface JsonCourse {
  course_code: string;
  course_name?: string;
  hp?: number;
  subject_area?: string | null;
  level?: string | null;
  original_prerequisite_text?: string | null;
}
export interface JsonProgramCourse {
  program_name: string;
  course_code: string;
  year: number;
  semester?: string | null;
  period?: string | null;
  mandatory?: boolean;
  sort_order?: number;
}
export interface JsonPrerequisite {
  target_course_code: string;
  requirement_type: RequirementType;
  required_course_code?: string | null;
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

export interface ParsedCatalog {
  programs: JsonProgram[];
  courses: JsonCourse[];
  program_courses: JsonProgramCourse[];
  course_prerequisites: JsonPrerequisite[];
}

export interface ParseResult {
  data: ParsedCatalog | null;
  errors: string[];
}

function asStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}
function asNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}
function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  return undefined;
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}
function asStrArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const out = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return out.length > 0 ? out : undefined;
  }
  if (typeof v === 'string') {
    const out = v.split(',').map((s) => s.trim()).filter(Boolean);
    return out.length > 0 ? out : undefined;
  }
  return undefined;
}

export function parseCatalogJson(text: string): ParseResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { data: null, errors: [`Ogiltig JSON: ${e instanceof Error ? e.message : 'okänt fel'}`] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { data: null, errors: ['Top-level måste vara ett JSON-objekt'] };
  }
  const r = raw as Record<string, unknown>;

  const programsIn = Array.isArray(r.programs) ? (r.programs as unknown[]) : [];
  const coursesIn = Array.isArray(r.courses) ? (r.courses as unknown[]) : [];
  const pcIn = Array.isArray(r.program_courses) ? (r.program_courses as unknown[]) : [];
  const prIn = Array.isArray(r.course_prerequisites) ? (r.course_prerequisites as unknown[]) : [];

  const programs: JsonProgram[] = [];
  programsIn.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const o = p as Record<string, unknown>;
    const name = asStr(pick(o, ['name', 'program_name', 'program']));
    if (!name) { errors.push(`programs[${i}]: saknar name`); return; }
    programs.push({
      name,
      total_hp: asNum(pick(o, ['total_hp', 'totalHp', 'hp'])) ?? null,
      active: asBool(o.active) ?? true,
    });
  });

  const courses: JsonCourse[] = [];
  coursesIn.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const o = c as Record<string, unknown>;
    const course_code = asStr(pick(o, ['course_code', 'code', 'courseCode']));
    if (!course_code) { errors.push(`courses[${i}]: saknar course_code`); return; }
    courses.push({
      course_code: course_code.toUpperCase(),
      course_name: asStr(pick(o, ['course_name', 'name', 'courseName'])),
      hp: asNum(pick(o, ['hp', 'credits'])),
      subject_area: asStr(pick(o, ['subject_area', 'subject', 'huvudområde', 'huvudomrade'])) ?? null,
      level: asStr(pick(o, ['level'])) ?? null,
      original_prerequisite_text: asStr(pick(o, ['original_prerequisite_text', 'originalRequirementsText', 'prerequisite_text'])) ?? null,
    });
  });

  const program_courses: JsonProgramCourse[] = [];
  pcIn.forEach((pc, i) => {
    if (!pc || typeof pc !== 'object') return;
    const o = pc as Record<string, unknown>;
    const program_name = asStr(pick(o, ['program_name', 'program', 'programName']));
    const course_code = asStr(pick(o, ['course_code', 'code', 'courseCode']));
    const year = asNum(pick(o, ['year']));
    if (!program_name || !course_code || year === undefined) {
      errors.push(`program_courses[${i}]: saknar program_name/course_code/year`);
      return;
    }
    program_courses.push({
      program_name,
      course_code: course_code.toUpperCase(),
      year,
      semester: asStr(pick(o, ['semester'])) ?? null,
      period: asStr(pick(o, ['period'])) ?? null,
      mandatory: asBool(o.mandatory) ?? true,
      sort_order: asNum(pick(o, ['sort_order', 'sortOrder'])) ?? 0,
    });
  });

  const course_prerequisites: JsonPrerequisite[] = [];
  prIn.forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    const o = p as Record<string, unknown>;
    const target_course_code = asStr(pick(o, ['target_course_code', 'target_code', 'target']));
    const rtRaw = asStr(pick(o, ['requirement_type', 'type']));
    if (!target_course_code || !rtRaw) {
      errors.push(`course_prerequisites[${i}]: saknar target_course_code/requirement_type`);
      return;
    }
    const originalText = asStr(pick(o, ['original_text', 'text'])) ?? null;
    const manualReviewIn = asBool(pick(o, ['manual_review', 'manualReview']));
    let rt = rtRaw as RequirementType;
    let manual_review = manualReviewIn ?? false;
    if (!REQ_TYPES.includes(rt)) {
      // Never fail import on unknown/too-complex types — downgrade safely.
      rt = 'custom_text';
      manual_review = true;
    }
    course_prerequisites.push({
      target_course_code: target_course_code.toUpperCase(),
      requirement_type: rt,
      required_course_code: (asStr(pick(o, ['required_course_code', 'required_code'])) ?? '').toUpperCase() || null,
      required_hp: asNum(pick(o, ['required_hp', 'hp'])) ?? null,
      required_subject_area: asStr(pick(o, ['required_subject_area', 'subject', 'subject_area'])) ?? null,
      original_text: originalText,
      logic_group: asNum(pick(o, ['logic_group', 'logicGroup'])) ?? null,
      required_level: asStr(pick(o, ['required_level', 'level'])) ?? null,
      course_group_name: asStr(pick(o, ['course_group_name', 'groupName', 'group_name'])) ?? null,
      allowed_program_groups: asStrArray(pick(o, ['allowed_program_groups', 'allowedProgramGroups', 'allowed_program_categories', 'program_groups'])) ?? null,
      allowed_course_codes: asStrArray(pick(o, ['allowed_course_codes', 'allowedCourseCodes', 'course_codes']))?.map((c) => c.toUpperCase()) ?? null,
      manual_review,
      group_operator: (() => {
        const g = asStr(pick(o, ['group_operator', 'groupOperator']));
        return g === 'AND' || g === 'OR' ? g : null;
      })(),
    });
  });

  return {
    data: { programs, courses, program_courses, course_prerequisites },
    errors,
  };
}

// ---------- DB snapshot ----------

export interface DbSnapshot {
  programByName: Map<string, { id: string; total_hp: number | null; active: boolean }>;
  courseByCode: Map<string, {
    id: string; course_name: string; hp: number;
    subject_area: string | null; level: string | null;
    original_prerequisite_text: string | null;
  }>;
  programCourseByPlacement: Map<string, {
    id: string; year: number; semester: string | null; period: string | null;
    mandatory: boolean; sort_order: number;
  }>;
  prereqKeys: Set<string>;
}

/** Placement key — matches DB unique index program_courses_placement_uniq. */
function placementKey(
  programId: string, courseId: string,
  year: number, semester: string | null, period: string | null, mandatory: boolean,
): string {
  return [programId, courseId, year, semester ?? '', period ?? '', mandatory ? '1' : '0'].join('|');
}

function prereqKey(
  targetId: string, type: RequirementType,
  requiredCourseId: string | null, requiredSubject: string | null,
  requiredHp: number | null, originalText: string | null,
): string {
  return [
    targetId, type,
    requiredCourseId ?? '',
    (requiredSubject ?? '').toLowerCase(),
    requiredHp ?? '',
    (originalText ?? '').toLowerCase(),
  ].join('|');
}

export async function fetchDbSnapshot(): Promise<DbSnapshot> {
  const [p, c, pc, pr] = await Promise.all([
    supabase.from('programs_catalog').select('id, name, total_hp, active'),
    supabase.from('courses_catalog').select('id, course_code, course_name, hp, subject_area, level, original_prerequisite_text'),
    supabase.from('program_courses').select('id, program_id, course_id, year, semester, period, mandatory, sort_order'),
    supabase.from('course_prerequisites').select('target_course_id, requirement_type, required_course_id, required_hp, required_subject_area, original_text'),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  if (pc.error) throw pc.error;
  if (pr.error) throw pr.error;

  const programByName = new Map<string, { id: string; total_hp: number | null; active: boolean }>();
  for (const row of (p.data ?? []) as Array<{ id: string; name: string; total_hp: number | null; active: boolean }>) {
    programByName.set(row.name, { id: row.id, total_hp: row.total_hp, active: row.active });
  }
  const courseByCode = new Map<string, {
    id: string; course_name: string; hp: number;
    subject_area: string | null; level: string | null;
    original_prerequisite_text: string | null;
  }>();
  for (const row of (c.data ?? []) as Array<{
    id: string; course_code: string; course_name: string; hp: number;
    subject_area: string | null; level: string | null; original_prerequisite_text: string | null;
  }>) {
    courseByCode.set(row.course_code.toUpperCase(), {
      id: row.id, course_name: row.course_name, hp: Number(row.hp),
      subject_area: row.subject_area, level: row.level,
      original_prerequisite_text: row.original_prerequisite_text,
    });
  }
  const programCourseByPlacement = new Map<string, {
    id: string; year: number; semester: string | null; period: string | null;
    mandatory: boolean; sort_order: number;
  }>();
  for (const row of (pc.data ?? []) as Array<{
    id: string; program_id: string; course_id: string;
    year: number; semester: string | null; period: string | null;
    mandatory: boolean; sort_order: number;
  }>) {
    const k = placementKey(row.program_id, row.course_id, row.year, row.semester, row.period, row.mandatory);
    programCourseByPlacement.set(k, {
      id: row.id, year: row.year, semester: row.semester, period: row.period,
      mandatory: row.mandatory, sort_order: row.sort_order,
    });
  }
  const prereqKeys = new Set<string>();
  for (const row of (pr.data ?? []) as Array<{
    target_course_id: string; requirement_type: RequirementType;
    required_course_id: string | null; required_hp: number | null;
    required_subject_area: string | null; original_text: string | null;
  }>) {
    prereqKeys.add(prereqKey(
      row.target_course_id, row.requirement_type, row.required_course_id,
      row.required_subject_area, row.required_hp, row.original_text,
    ));
  }
  return { programByName, courseByCode, programCourseByPlacement, prereqKeys };
}

// ---------- Plan ----------

export interface ImportPlan {
  programs: { insert: JsonProgram[]; update: JsonProgram[]; unchanged: JsonProgram[] };
  courses: { insert: JsonCourse[]; update: JsonCourse[]; unchanged: JsonCourse[] };
  program_courses: { insert: JsonProgramCourse[]; update: JsonProgramCourse[]; unchanged: JsonProgramCourse[] };
  prerequisites: { insert: JsonPrerequisite[]; duplicates: JsonPrerequisite[]; manual: JsonPrerequisite[] };
  warnings: string[];
  errors: string[];
}

export function planJsonImport(data: ParsedCatalog, snap: DbSnapshot): ImportPlan {
  const warnings: string[] = [];
  const errors: string[] = [];

  // ---- programs ----
  const programs = { insert: [] as JsonProgram[], update: [] as JsonProgram[], unchanged: [] as JsonProgram[] };
  for (const p of data.programs) {
    const existing = snap.programByName.get(p.name);
    if (!existing) programs.insert.push(p);
    else if (existing.total_hp !== (p.total_hp ?? null) || existing.active !== (p.active ?? true)) programs.update.push(p);
    else programs.unchanged.push(p);
  }

  // ---- courses ----
  const seenCodes = new Set<string>();
  const courses = { insert: [] as JsonCourse[], update: [] as JsonCourse[], unchanged: [] as JsonCourse[] };
  for (const c of data.courses) {
    if (seenCodes.has(c.course_code)) {
      warnings.push(`Dubblett av course_code i filen: ${c.course_code}`);
    }
    seenCodes.add(c.course_code);
    if (!c.course_name) warnings.push(`${c.course_code}: saknar course_name`);
    if (c.hp === undefined || c.hp === null) warnings.push(`${c.course_code}: saknar hp`);
    if (!c.subject_area) warnings.push(`${c.course_code}: saknar huvudområde`);

    const existing = snap.courseByCode.get(c.course_code);
    if (!existing) {
      courses.insert.push(c);
    } else {
      const changed =
        (c.course_name !== undefined && c.course_name !== existing.course_name) ||
        (c.hp !== undefined && Number(c.hp) !== Number(existing.hp)) ||
        (c.subject_area !== undefined && (c.subject_area ?? null) !== existing.subject_area) ||
        (c.level !== undefined && (c.level ?? null) !== existing.level) ||
        (c.original_prerequisite_text !== undefined && (c.original_prerequisite_text ?? null) !== existing.original_prerequisite_text);
      if (changed) courses.update.push(c);
      else courses.unchanged.push(c);
    }
  }

  // Programs/courses known after merge (file + db)
  const knownProgramNames = new Set<string>([
    ...snap.programByName.keys(),
    ...data.programs.map((p) => p.name),
  ]);
  const knownCourseCodes = new Set<string>([
    ...snap.courseByCode.keys(),
    ...data.courses.map((c) => c.course_code),
  ]);

  // ---- program_courses ----
  const program_courses = { insert: [] as JsonProgramCourse[], update: [] as JsonProgramCourse[], unchanged: [] as JsonProgramCourse[] };
  const seenPair = new Set<string>();
  for (const pc of data.program_courses) {
    if (!knownProgramNames.has(pc.program_name)) {
      warnings.push(`program_courses: okänt program "${pc.program_name}"`); continue;
    }
    if (!knownCourseCodes.has(pc.course_code)) {
      warnings.push(`program_courses: okänd kurskod "${pc.course_code}"`); continue;
    }
    const pairKey = `${pc.program_name}|${pc.course_code}`;
    if (seenPair.has(pairKey)) {
      warnings.push(`program_courses: dubblett ${pairKey}`); continue;
    }
    seenPair.add(pairKey);

    const programId = snap.programByName.get(pc.program_name)?.id;
    const courseId = snap.courseByCode.get(pc.course_code)?.id;
    if (!programId || !courseId) {
      // Will be inserted post-program/course upsert
      program_courses.insert.push(pc);
      continue;
    }
    const existing = snap.programCourseByPair.get(`${programId}|${courseId}`);
    if (!existing) program_courses.insert.push(pc);
    else {
      const changed =
        existing.year !== pc.year ||
        (existing.semester ?? null) !== (pc.semester ?? null) ||
        (existing.period ?? null) !== (pc.period ?? null) ||
        existing.mandatory !== (pc.mandatory ?? true) ||
        existing.sort_order !== (pc.sort_order ?? 0);
      if (changed) program_courses.update.push(pc);
      else program_courses.unchanged.push(pc);
    }
  }

  // ---- prerequisites ----
  const prerequisites = { insert: [] as JsonPrerequisite[], duplicates: [] as JsonPrerequisite[], manual: [] as JsonPrerequisite[] };
  const fileKeys = new Set<string>();
  for (const pr of data.course_prerequisites) {
    if (!knownCourseCodes.has(pr.target_course_code)) {
      warnings.push(`prerequisite: okänd target_course_code "${pr.target_course_code}"`); continue;
    }
    if (pr.required_course_code && !knownCourseCodes.has(pr.required_course_code)) {
      warnings.push(`prerequisite för ${pr.target_course_code}: required_course_code "${pr.required_course_code}" saknas`);
    }
    if (pr.requirement_type === 'custom_text') prerequisites.manual.push(pr);

    const targetId = snap.courseByCode.get(pr.target_course_code)?.id ?? `new:${pr.target_course_code}`;
    const reqCourseId = pr.required_course_code
      ? (snap.courseByCode.get(pr.required_course_code)?.id ?? `new:${pr.required_course_code}`)
      : null;
    const key = prereqKey(targetId, pr.requirement_type, reqCourseId, pr.required_subject_area, pr.required_hp, pr.original_text);

    if (fileKeys.has(key)) {
      prerequisites.duplicates.push(pr); continue;
    }
    fileKeys.add(key);

    // Only flag DB duplicates when both ids resolve to existing rows.
    if (!targetId.startsWith('new:') && !(reqCourseId ?? '').toString().startsWith('new:')) {
      if (snap.prereqKeys.has(key)) {
        prerequisites.duplicates.push(pr); continue;
      }
    }
    prerequisites.insert.push(pr);
  }

  return { programs, courses, program_courses, prerequisites, warnings, errors };
}

// ---------- Execute ----------

export interface ImportResult {
  programs: { inserted: number; updated: number };
  courses: { inserted: number; updated: number };
  program_courses: { inserted: number; updated: number };
  prerequisites: { inserted: number; skipped: number };
  warnings: string[];
}

export async function executeJsonImport(data: ParsedCatalog): Promise<ImportResult> {
  const warnings: string[] = [];

  // 1. Programs upsert
  let programsInserted = 0;
  let programsUpdated = 0;
  if (data.programs.length > 0) {
    const beforeSnap = await fetchDbSnapshot();
    const payload = data.programs.map((p) => ({
      name: p.name,
      total_hp: p.total_hp ?? null,
      active: p.active ?? true,
    }));
    const { error } = await supabase
      .from('programs_catalog')
      .upsert(payload, { onConflict: 'name' });
    if (error) throw error;
    for (const p of data.programs) {
      if (beforeSnap.programByName.has(p.name)) programsUpdated++;
      else programsInserted++;
    }
  }

  // 2. Courses upsert
  let coursesInserted = 0;
  let coursesUpdated = 0;
  let beforeCourseSnap = await fetchDbSnapshot();
  if (data.courses.length > 0) {
    const payload = data.courses.map((c) => ({
      course_code: c.course_code,
      course_name: c.course_name ?? c.course_code,
      hp: c.hp ?? 0,
      subject_area: c.subject_area ?? null,
      level: c.level ?? null,
      original_prerequisite_text: c.original_prerequisite_text ?? null,
      active: true,
    }));
    const { error } = await supabase
      .from('courses_catalog')
      .upsert(payload, { onConflict: 'course_code' });
    if (error) throw error;
    for (const c of data.courses) {
      if (beforeCourseSnap.courseByCode.has(c.course_code)) coursesUpdated++;
      else coursesInserted++;
    }
    beforeCourseSnap = await fetchDbSnapshot();
  }

  const snap = beforeCourseSnap;

  // 3. Program courses
  let pcInserted = 0;
  let pcUpdated = 0;
  if (data.program_courses.length > 0) {
    const payload: Array<{
      program_id: string; course_id: string; year: number;
      semester: string | null; period: string | null;
      mandatory: boolean; sort_order: number;
    }> = [];
    const seen = new Set<string>();
    for (const pc of data.program_courses) {
      const programId = snap.programByName.get(pc.program_name)?.id;
      const courseId = snap.courseByCode.get(pc.course_code)?.id;
      if (!programId || !courseId) {
        warnings.push(`Hoppade över program_course (${pc.program_name} / ${pc.course_code}): saknar program/kurs i DB`);
        continue;
      }
      const pairKey = `${programId}|${courseId}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      if (snap.programCourseByPair.has(pairKey)) pcUpdated++; else pcInserted++;
      payload.push({
        program_id: programId,
        course_id: courseId,
        year: pc.year,
        semester: pc.semester ?? null,
        period: pc.period ?? null,
        mandatory: pc.mandatory ?? true,
        sort_order: pc.sort_order ?? 0,
      });
    }
    if (payload.length > 0) {
      const { error } = await supabase
        .from('program_courses')
        .upsert(payload, { onConflict: 'program_id,course_id' });
      if (error) throw error;
    }
  }

  // 4. Prerequisites (insert-only, deduped)
  let prInserted = 0;
  let prSkipped = 0;
  if (data.course_prerequisites.length > 0) {
    const payload: Array<Record<string, unknown>> = [];
    const seen = new Set<string>(snap.prereqKeys);
    for (const pr of data.course_prerequisites) {
      const target = snap.courseByCode.get(pr.target_course_code);
      if (!target) { prSkipped++; warnings.push(`Hoppade över prereq: okänd target ${pr.target_course_code}`); continue; }
      const required = pr.required_course_code
        ? snap.courseByCode.get(pr.required_course_code)
        : undefined;
      if (pr.required_course_code && !required) {
        // Preserve as manual_review custom_text rather than dropping silently.
        prSkipped++;
        warnings.push(`Hoppade över prereq för ${pr.target_course_code}: required ${pr.required_course_code} saknas`);
        continue;
      }
      const k = prereqKey(target.id, pr.requirement_type, required?.id ?? null, pr.required_subject_area, pr.required_hp, pr.original_text);
      if (seen.has(k)) { prSkipped++; continue; }
      seen.add(k);
      payload.push({
        target_course_id: target.id,
        requirement_type: pr.requirement_type,
        required_course_id: required?.id ?? null,
        required_hp: pr.required_hp ?? null,
        required_subject_area: pr.required_subject_area ?? null,
        original_text: pr.original_text ?? null,
        logic_group: pr.logic_group ?? null,
        required_level: pr.required_level ?? null,
        course_group_name: pr.course_group_name ?? null,
        allowed_program_groups: pr.allowed_program_groups ?? null,
        allowed_course_codes: pr.allowed_course_codes ?? null,
        manual_review: !!pr.manual_review,
        group_operator: pr.group_operator ?? null,
      });
    }
    if (payload.length > 0) {
      const { error } = await supabase.from('course_prerequisites').insert(payload as never);
      if (error) throw error;
      prInserted = payload.length;
    }
  }

  return {
    programs: { inserted: programsInserted, updated: programsUpdated },
    courses: { inserted: coursesInserted, updated: coursesUpdated },
    program_courses: { inserted: pcInserted, updated: pcUpdated },
    prerequisites: { inserted: prInserted, skipped: prSkipped },
    warnings,
  };
}
