ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_checklist_dismissed boolean NOT NULL DEFAULT false;

-- Mark existing users (who already have courses/events/subtasks) as dismissed so they don't see the checklist
UPDATE public.profiles p
SET onboarding_checklist_dismissed = true
WHERE p.setup_complete = true
  AND (
    EXISTS (SELECT 1 FROM public.study_events se WHERE se.user_id = p.user_id)
    OR EXISTS (
      SELECT 1 FROM public.course_subtasks cs
      JOIN public.user_courses uc ON uc.id = cs.course_id
      WHERE uc.user_id = p.user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_courses uc
      WHERE uc.user_id = p.user_id AND uc.status <> 'not_started'
    )
  );