-- 1. Nullable catalog reference on user_courses (no data touched on existing rows)
ALTER TABLE public.user_courses
  ADD COLUMN IF NOT EXISTS catalog_course_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_user_courses_catalog_course_id
  ON public.user_courses(catalog_course_id);

CREATE INDEX IF NOT EXISTS idx_user_courses_course_code
  ON public.user_courses(course_code);

-- 2. Read-only report function (admin only)
CREATE OR REPLACE FUNCTION public.admin_catalog_migration_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _matched int;
  _unmatched int;
  _users int;
  _events int;
  _subtasks int;
  _already_linked int;
  _unmatched_codes jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratörer kan köra migrationsrapporten';
  END IF;

  SELECT count(*) INTO _matched
  FROM public.user_courses uc
  WHERE EXISTS (
    SELECT 1 FROM public.courses_catalog cc
    WHERE upper(cc.course_code) = upper(uc.course_code)
  );

  SELECT count(*) INTO _unmatched
  FROM public.user_courses uc
  WHERE NOT EXISTS (
    SELECT 1 FROM public.courses_catalog cc
    WHERE upper(cc.course_code) = upper(uc.course_code)
  );

  SELECT count(DISTINCT user_id) INTO _users FROM public.user_courses;

  SELECT count(*) INTO _events FROM public.study_events;
  SELECT count(*) INTO _subtasks FROM public.course_subtasks;

  SELECT count(*) INTO _already_linked
  FROM public.user_courses WHERE catalog_course_id IS NOT NULL;

  SELECT COALESCE(jsonb_agg(DISTINCT upper(uc.course_code) ORDER BY upper(uc.course_code)), '[]'::jsonb)
  INTO _unmatched_codes
  FROM public.user_courses uc
  WHERE NOT EXISTS (
    SELECT 1 FROM public.courses_catalog cc
    WHERE upper(cc.course_code) = upper(uc.course_code)
  );

  RETURN jsonb_build_object(
    'matched_user_courses', _matched,
    'unmatched_user_courses', _unmatched,
    'already_linked', _already_linked,
    'users_affected', _users,
    'study_events_preserved', _events,
    'course_subtasks_preserved', _subtasks,
    'unmatched_codes', _unmatched_codes,
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_catalog_migration_report() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_catalog_migration_report() TO authenticated;

-- 3. Idempotent backfill (admin only) — only sets catalog_course_id, nothing else
CREATE OR REPLACE FUNCTION public.admin_backfill_user_courses_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated int;
  _remaining_unmatched int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratörer kan köra backfill';
  END IF;

  WITH upd AS (
    UPDATE public.user_courses uc
       SET catalog_course_id = cc.id
      FROM public.courses_catalog cc
     WHERE uc.catalog_course_id IS NULL
       AND upper(cc.course_code) = upper(uc.course_code)
    RETURNING uc.id
  )
  SELECT count(*) INTO _updated FROM upd;

  SELECT count(*) INTO _remaining_unmatched
  FROM public.user_courses
  WHERE catalog_course_id IS NULL;

  RETURN jsonb_build_object(
    'rows_linked', _updated,
    'remaining_unlinked', _remaining_unmatched,
    'ran_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_backfill_user_courses_catalog() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_backfill_user_courses_catalog() TO authenticated;