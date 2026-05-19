/**
 * Compatibility layer for the upcoming switch from static program templates
 * to the database-backed catalog. NOT yet wired into the student app — call
 * sites should opt in explicitly.
 *
 * Matching key: course_code (case-insensitive). user_courses rows are NEVER
 * deleted or rewritten here; we only resolve the matching catalog row.
 */
import { supabase } from '@/integrations/supabase/client';
import type { CatalogCourse } from './catalog';

export interface UserCourseLike {
  course_code: string;
  catalog_course_id?: string | null;
}

export interface ResolvedUserCourse<T extends UserCourseLike> {
  userCourse: T;
  catalog: CatalogCourse | null;
  matched: boolean;
}

/**
 * Resolve a list of user_courses against the catalog. Pure function — no DB
 * writes. Falls back to `null` when no catalog match exists so the caller
 * can keep showing the original user course.
 */
export function resolveUserCoursesAgainstCatalog<T extends UserCourseLike>(
  userCourses: T[],
  catalog: CatalogCourse[],
): ResolvedUserCourse<T>[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const byCode = new Map(catalog.map((c) => [c.course_code.toUpperCase(), c]));
  return userCourses.map((uc) => {
    const fromLink = uc.catalog_course_id ? byId.get(uc.catalog_course_id) ?? null : null;
    const fromCode = byCode.get(uc.course_code.toUpperCase()) ?? null;
    const catalogRow = fromLink ?? fromCode;
    return { userCourse: uc, catalog: catalogRow, matched: !!catalogRow };
  });
}

export interface MigrationReport {
  matched_user_courses: number;
  unmatched_user_courses: number;
  already_linked: number;
  users_affected: number;
  study_events_preserved: number;
  course_subtasks_preserved: number;
  unmatched_codes: string[];
  generated_at: string;
}

export async function fetchMigrationReport(): Promise<MigrationReport> {
  const { data, error } = await supabase.rpc('admin_catalog_migration_report');
  if (error) throw error;
  return data as unknown as MigrationReport;
}

export interface BackfillResult {
  rows_linked: number;
  remaining_unlinked: number;
  ran_at: string;
}

export async function runCatalogBackfill(): Promise<BackfillResult> {
  const { data, error } = await supabase.rpc('admin_backfill_user_courses_catalog');
  if (error) throw error;
  return data as unknown as BackfillResult;
}

export interface UserSyncResult {
  profiles_remapped: number;
  catalog_links_added: number;
  mandatory_seeded: number;
  orphans_removed: number;
  ran_at: string;
}

export async function runExistingUsersSync(): Promise<UserSyncResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('admin_sync_existing_users_to_catalog');
  if (error) throw error;
  return data as UserSyncResult;
}
