
CREATE OR REPLACE FUNCTION public._canonical_program_name(_legacy text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _match text;
BEGIN
  IF _legacy IS NULL THEN RETURN NULL; END IF;

  SELECT name INTO _match FROM public.programs_catalog
    WHERE active AND name = _legacy LIMIT 1;
  IF _match IS NOT NULL THEN RETURN _match; END IF;

  SELECT name INTO _match FROM public.programs_catalog pc
    WHERE pc.active
      AND EXISTS (
        SELECT 1 FROM regexp_matches(_legacy, '\(([A-Z]{4,6})\)', 'g') AS m(parts)
        WHERE pc.name ILIKE '%(' || m.parts[1] || ')%'
      )
    LIMIT 1;
  IF _match IS NOT NULL THEN RETURN _match; END IF;

  IF _legacy ILIKE 'Civilingenjör i industriell ekonomi och management%' THEN
    RETURN 'Civilingenjör i industriell ekonomi och management (IYACI)';
  END IF;
  IF _legacy ILIKE 'Civilingenjör i industriell ekonomi – Industriell mjukvaruutveckling%' THEN
    RETURN 'Civilingenjör i industriell ekonomi – Industriell mjukvaruutveckling (IEACI)';
  END IF;
  IF _legacy ILIKE 'Civilingenjör i mjukvaruutveckling%' THEN
    RETURN 'Civilingenjör i mjukvaruutveckling (PAAMV)';
  END IF;
  IF _legacy ILIKE 'Civilingenjör i datorsäkerhet%' THEN
    RETURN 'Civilingenjör i datorsäkerhet (DVADS)';
  END IF;
  IF _legacy ILIKE 'Civilingenjör i AI och maskininlärning%' THEN
    RETURN 'Civilingenjör i AI och maskininlärning (DVAAM)';
  END IF;
  IF _legacy ILIKE 'Civilingenjör i spelteknik%' THEN
    RETURN 'Civilingenjör i spelteknik (DVASP)';
  END IF;
  IF _legacy ILIKE 'Civilingenjör i spel- och programvaruteknik%' THEN
    RETURN 'Civilingenjör i spel- och programvaruteknik (PAASP)';
  END IF;

  RETURN _legacy;
END;
$$;

UPDATE public.profiles p
SET program_name = public._canonical_program_name(p.program_name)
WHERE p.program_name IS NOT NULL
  AND public._canonical_program_name(p.program_name) IS DISTINCT FROM p.program_name;

CREATE OR REPLACE FUNCTION public.remap_my_profile_program()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current text;
  _new text;
BEGIN
  SELECT program_name INTO _current FROM public.profiles WHERE user_id = auth.uid();
  IF _current IS NULL THEN RETURN NULL; END IF;
  _new := public._canonical_program_name(_current);
  IF _new IS DISTINCT FROM _current THEN
    UPDATE public.profiles SET program_name = _new WHERE user_id = auth.uid();
  END IF;
  RETURN _new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remap_my_profile_program() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sync_existing_users_to_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profiles_remapped int := 0;
  _links_added int := 0;
  _mandatory_seeded int := 0;
  _orphans_removed int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratörer kan köra användarsynk';
  END IF;

  WITH upd AS (
    UPDATE public.profiles p
       SET program_name = public._canonical_program_name(p.program_name)
     WHERE p.program_name IS NOT NULL
       AND public._canonical_program_name(p.program_name) IS DISTINCT FROM p.program_name
    RETURNING 1
  )
  SELECT count(*) INTO _profiles_remapped FROM upd;

  WITH upd AS (
    UPDATE public.user_courses uc
       SET catalog_course_id = cc.id
      FROM public.courses_catalog cc
     WHERE uc.catalog_course_id IS NULL
       AND upper(cc.course_code) = upper(uc.course_code)
    RETURNING 1
  )
  SELECT count(*) INTO _links_added FROM upd;

  WITH ins AS (
    INSERT INTO public.user_courses (user_id, course_code, course_name, hp, year, status, catalog_course_id)
    SELECT p.user_id, cc.course_code, cc.course_name, cc.hp, pc.year, 'not_started', cc.id
      FROM public.profiles p
      JOIN public.programs_catalog pg ON pg.active AND pg.name = p.program_name
      JOIN public.program_courses pc ON pc.program_id = pg.id AND pc.mandatory = true
      JOIN public.courses_catalog cc ON cc.id = pc.course_id
     WHERE p.setup_complete = true
       AND NOT EXISTS (
         SELECT 1 FROM public.user_courses uc
         WHERE uc.user_id = p.user_id
           AND upper(uc.course_code) = upper(cc.course_code)
       )
    RETURNING 1
  )
  SELECT count(*) INTO _mandatory_seeded FROM ins;

  WITH del AS (
    DELETE FROM public.user_courses uc
     USING public.profiles p
     WHERE uc.user_id = p.user_id
       AND uc.status = 'not_started'
       AND NOT EXISTS (
         SELECT 1 FROM public.programs_catalog pg
         JOIN public.program_courses pc ON pc.program_id = pg.id
         JOIN public.courses_catalog cc ON cc.id = pc.course_id
         WHERE pg.active AND pg.name = p.program_name
           AND upper(cc.course_code) = upper(uc.course_code)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.study_events se
         WHERE se.user_id = uc.user_id
           AND upper(se.course_code) = upper(uc.course_code)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.course_subtasks cs
         WHERE cs.course_id = uc.id
       )
    RETURNING 1
  )
  SELECT count(*) INTO _orphans_removed FROM del;

  RETURN jsonb_build_object(
    'profiles_remapped', _profiles_remapped,
    'catalog_links_added', _links_added,
    'mandatory_seeded', _mandatory_seeded,
    'orphans_removed', _orphans_removed,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sync_existing_users_to_catalog() TO authenticated;
