UPDATE public.courses_catalog SET subject_area = 'Fysik' WHERE active AND subject_area IS NULL AND course_code ILIKE 'FY%';
UPDATE public.courses_catalog SET subject_area = 'Kemi' WHERE active AND subject_area IS NULL AND course_code ILIKE 'KM%';
UPDATE public.courses_catalog SET subject_area = 'Teknik' WHERE active AND subject_area IS NULL AND course_code ILIKE 'TE%';