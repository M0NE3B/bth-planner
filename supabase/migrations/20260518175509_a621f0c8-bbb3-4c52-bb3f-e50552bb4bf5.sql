ALTER TABLE public.program_courses
  DROP CONSTRAINT IF EXISTS program_courses_program_id_course_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS program_courses_placement_uniq
  ON public.program_courses (
    program_id,
    course_id,
    year,
    COALESCE(semester, ''),
    COALESCE(period, ''),
    mandatory
  );