
ALTER TYPE public.course_requirement_type ADD VALUE IF NOT EXISTS 'completed_hp_in_program_group';
ALTER TYPE public.course_requirement_type ADD VALUE IF NOT EXISTS 'completed_hp_in_course_group';
ALTER TYPE public.course_requirement_type ADD VALUE IF NOT EXISTS 'completed_hp_at_level';

ALTER TABLE public.course_prerequisites
  ADD COLUMN IF NOT EXISTS required_level text,
  ADD COLUMN IF NOT EXISTS course_group_name text,
  ADD COLUMN IF NOT EXISTS allowed_program_groups text[],
  ADD COLUMN IF NOT EXISTS allowed_course_codes text[],
  ADD COLUMN IF NOT EXISTS manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_operator text;
