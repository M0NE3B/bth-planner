
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dismissed_course_codes text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.auto_sync_my_account_to_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _current_program text;
  _canonical text;
  _links_added int := 0;
  _mandatory_seeded int := 0;
  _orphans_removed int := 0;
  _already_migrated timestamptz;
  _dismissed text[];
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no_auth');
  END IF;

  SELECT program_name, catalog_migrated_at, COALESCE(dismissed_course_codes, '{}')
    INTO _current_program, _already_migrated, _dismissed
    FROM public.profiles WHERE user_id = _uid;

  IF _already_migrated IS NOT NULL THEN
    RETURN jsonb_build_object('skipped', 'already_migrated', 'at', _already_migrated);
  END IF;

  IF _current_program IS NOT NULL THEN
    _canonical := public._canonical_program_name(_current_program);
    IF _canonical IS DISTINCT FROM _current_program THEN
      UPDATE public.profiles SET program_name = _canonical WHERE user_id = _uid;
      _current_program := _canonical;
    END IF;
  END IF;

  WITH upd AS (
    UPDATE public.user_courses uc
       SET catalog_course_id = cc.id
      FROM public.courses_catalog cc
     WHERE uc.user_id = _uid
       AND uc.catalog_course_id IS NULL
       AND upper(cc.course_code) = upper(uc.course_code)
    RETURNING 1
  )
  SELECT count(*) INTO _links_added FROM upd;

  IF _current_program IS NOT NULL THEN
    WITH ins AS (
      INSERT INTO public.user_courses (user_id, course_code, course_name, hp, year, status, catalog_course_id)
      SELECT _uid, cc.course_code, cc.course_name, cc.hp, pc.year, 'not_started', cc.id
        FROM public.programs_catalog pg
        JOIN public.program_courses pc ON pc.program_id = pg.id AND pc.mandatory = true
        JOIN public.courses_catalog cc ON cc.id = pc.course_id
       WHERE pg.active AND pg.name = _current_program
         AND upper(cc.course_code) <> ALL (COALESCE(ARRAY(SELECT upper(unnest(_dismissed))), '{}'::text[]))
         AND NOT EXISTS (
           SELECT 1 FROM public.user_courses uc
           WHERE uc.user_id = _uid
             AND upper(uc.course_code) = upper(cc.course_code)
         )
      RETURNING 1
    )
    SELECT count(*) INTO _mandatory_seeded FROM ins;

    WITH del AS (
      DELETE FROM public.user_courses uc
       WHERE uc.user_id = _uid
         AND uc.status = 'not_started'
         AND NOT EXISTS (
           SELECT 1 FROM public.programs_catalog pg
           JOIN public.program_courses pc ON pc.program_id = pg.id
           JOIN public.courses_catalog cc ON cc.id = pc.course_id
           WHERE pg.active AND pg.name = _current_program
             AND upper(cc.course_code) = upper(uc.course_code)
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.study_events se
           WHERE se.user_id = _uid
             AND upper(se.course_code) = upper(uc.course_code)
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.course_subtasks cs
           WHERE cs.course_id = uc.id
         )
      RETURNING 1
    )
    SELECT count(*) INTO _orphans_removed FROM del;
  END IF;

  UPDATE public.profiles SET catalog_migrated_at = now() WHERE user_id = _uid;

  RETURN jsonb_build_object(
    'migrated', true,
    'program_name', _current_program,
    'catalog_links_added', _links_added,
    'mandatory_seeded', _mandatory_seeded,
    'orphans_removed', _orphans_removed,
    'ran_at', now()
  );
END;
$function$;
