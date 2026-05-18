# JSON catalog import (admin)

Add a second import option in **Admin → Import & verktyg** alongside the existing "Importera från statiska mallar". The static button stays untouched. No deletes, no user-data backfill, no app switch.

## UX flow

1. New card "Importera från JSON" under existing static-import card in `ImportTab.tsx`.
2. Two input modes: file upload (`.json`) + paste-into-textarea. Both populate the same parsed state.
3. "Validera & förhandsgranska" button → runs parsing + validation, opens a preview panel (not a modal — too much content).
4. Preview shows:
   - Counts: programs, courses, program-course links, prerequisites — split into **nya** vs **uppdateras** vs **oförändrade**.
   - Collapsible lists per section showing first ~20 rows + total count.
   - Separate section "Manuell granskning" listing `custom_text` and unresolved prerequisites.
   - Warnings list (yellow) and errors list (red).
5. "Importera nu" button is disabled if errors exist. Confirmation `AlertDialog` before write.
6. After import: success toast + summary panel (inserted/updated/skipped per entity, warnings carried over).

## Accepted JSON shape

Top-level object, all arrays optional:

```json
{
  "metadata": { "source": "...", "exported_at": "..." },
  "programs": [
    { "name": "Civilingenjör i mjukvaruteknik", "total_hp": 300, "active": true }
  ],
  "courses": [
    { "course_code": "DV1654", "course_name": "...", "hp": 6,
      "subject_area": "Datavetenskap", "level": "Grundnivå",
      "original_prerequisite_text": "..." }
  ],
  "program_courses": [
    { "program_name": "...", "course_code": "DV1654",
      "year": 1, "semester": "HT", "period": "1", "mandatory": true, "sort_order": 0 }
  ],
  "course_prerequisites": [
    { "target_course_code": "DV1654",
      "requirement_type": "completed_course",
      "required_course_code": "DV1612",
      "required_hp": null, "required_subject_area": null,
      "original_text": "DV1612", "logic_group": null }
  ]
}
```

Field-name tolerance (mapped during parsing):
- `program` → `program_name`, `code`/`courseCode` → `course_code`, `name`/`courseName` → `course_name`, `credits` → `hp`, `subject`/`huvudområde` → `subject_area`.
- Programs may be referenced from `program_courses` by `program_name` or `program_id` (id only used if it matches an existing row).

## Validation rules

Errors (block import):
- JSON not parseable / top-level not object.
- `requirement_type` not in the 6 known values.
- Row missing all natural-key fields (course without `course_code`, program without `name`).

Warnings (show, allow import):
- Course missing `course_name`, `hp`, or `subject_area`.
- Duplicate `course_code` within the file.
- `program_courses` row pointing to a program/course not in file *and* not in DB.
- `course_prerequisites` pointing to a `required_course_code` not in file or DB.
- `requirement_type = 'custom_text'` (always flagged for manual review).
- `program_courses` duplicate by (program, course, year, semester, period).
- Prerequisite duplicate by (target, type, required_course/subject/hp, original_text).

## Upsert behavior (idempotent)

- **Programs**: upsert by `name` (existing `programs_catalog_name_key`). Set `total_hp`, `active`.
- **Courses**: upsert by `course_code` (existing unique). Update name, hp, subject_area, level, original_prerequisite_text. Never set `active=false` here.
- **program_courses**: upsert by `(program_id, course_id)` (existing onConflict used by static import). For rows that resolve to the same pair, update year/semester/period/mandatory/sort_order.
- **course_prerequisites**: dedupe in-memory by composite key `(target, type, required_course_id, required_subject_area, required_hp, original_text)`; then for each target course, fetch existing rows and only insert rows that don't already exist. **No deletes** (unlike `replacePrerequisites` used by the static importer).

To diff "nya vs uppdateras", load existing `programs_catalog(name,id)`, `courses_catalog(course_code,id, …fields)`, `program_courses(program_id,course_id,…)`, and existing prerequisite composite keys once during preview.

## Files to add / change

```text
src/lib/admin/jsonImport.ts          NEW
  - parseCatalogJson(text)           → { data, errors }
  - planJsonImport(data, dbSnapshot) → { plan, warnings, errors, summary }
  - executeJsonImport(plan)          → { inserted, updated, skipped, warnings }
  - fetchDbSnapshot()                → existing programs/courses/links/prereqs maps

src/components/admin/JsonImportCard.tsx   NEW
  - file input + textarea
  - validate button → preview panel
  - import button + AlertDialog confirm
  - summary panel after run

src/components/admin/ImportTab.tsx        EDIT
  - render existing static-import card unchanged
  - render <JsonImportCard /> below it
```

No DB migration needed — existing tables, RLS, and unique constraints cover everything. Admin RLS already gates writes.

## Out of scope (per request)

- No CSV import (JSON only this round).
- No row deletion. No archive/deactivate from JSON.
- No user-data backfill, no migration tab interaction.
- No change to dashboard/calendar/risk/student app code paths.
- No edits to `src/components/ui/*` or generated Supabase files.

## Testing

- Unit test `parseCatalogJson` + `planJsonImport` with: valid file, missing fields, duplicate codes, unknown requirement_type, custom_text rows, prereq pointing to missing course.
- Manual: upload a small one-program file → verify preview counts, run import twice → second run shows 0 inserts, all updates/unchanged.
