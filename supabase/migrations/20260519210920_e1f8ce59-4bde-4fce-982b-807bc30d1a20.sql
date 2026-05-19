
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status_onboarding_complete boolean NOT NULL DEFAULT false;

-- Mark existing users (who have already set up plan with courses/events/subtasks)
-- as having completed the status step so they don't get forced through it.
UPDATE public.profiles p
SET status_onboarding_complete = true
WHERE setup_complete = true
  AND (
    EXISTS (SELECT 1 FROM public.user_courses uc WHERE uc.user_id = p.user_id AND uc.status <> 'not_started')
    OR EXISTS (SELECT 1 FROM public.study_events se WHERE se.user_id = p.user_id)
    OR EXISTS (SELECT 1 FROM public.course_subtasks cs WHERE cs.user_id = p.user_id)
  );

-- Also mark very old users with completed setup but no activity at all as completed,
-- to avoid surprising them with a forced step. Only brand new setups (no courses) remain false.
UPDATE public.profiles p
SET status_onboarding_complete = true
WHERE setup_complete = true
  AND status_onboarding_complete = false
  AND EXISTS (SELECT 1 FROM public.user_courses uc WHERE uc.user_id = p.user_id);
