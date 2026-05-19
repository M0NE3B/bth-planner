
# Catalog ↔ Admin ↔ Student Integration Pass

This is a final cleanup pass across ~7,300 lines spanning admin, catalog libs, prerequisite parsing, student app, risk, and focus. I'll do it in 5 phased commits so we can verify between phases — none of them touch user data, RLS, or auth.

## Phase 1 — Admin UI cleanup (low risk)

- `AdminPanel.tsx`: drop the **Migration** and **Import & verktyg → Statiska mallar** tabs/buttons from the visible navigation. Tabs become: Kurskatalog · Program · Förkunskaper · Datakvalitet · Import (JSON) · Administratörer.
- Keep `MigrationTab.tsx` and the static-import code in the repo (not deleted) but no longer routed.
- `ImportTab.tsx`: keep only the `JsonImportCard`, remove the "import from static templates" button block.
- `CourseCatalogTab.tsx`: add a stats strip (total / aktiva / arkiverade / saknar HP / saknar huvudområde / har förkunskaper) and richer filters (search, huvudområde dropdown, status, missing-HP, missing-subject, prereq-status: structured / only-manual / none). Editor sheet gets a "Ingår i program" read-only list and a huvudområde combobox (existing values + free text).

## Phase 2 — Prerequisite parser improvements

- New `src/lib/admin/prereqParser.ts` with `parsePrerequisiteText(text, catalog)` → `{ rules: PrerequisiteInput[]; remainingText: string; warnings: string[] }`.
- Strategy: split on `.` / `;` / "Dessutom" / "samt" / "och" (carefully); run a chain of regex+lookup matchers in this order:
  1. `completed_total_hp`: `/(\d+)\s*(?:avklarade\s+)?(?:hög­?skole­?poäng|hp)\s*(?:totalt|avklarade)?/i` when sentence has no course code or subject.
  2. `completed_hp_at_level`: `/minst\s+(\d+)\s*hp\s+på\s+(avancerad|grundläggande)\s+nivå/i`.
  3. `completed_hp_in_program_group`: `/(\d+)\s*hp\s+från\s+ett?\s+civilingenjörsprogram(?:[^.]*?)\b(maskinteknik|industriell ekonomi|datavetenskap|mjukvaru\w*|spel\w*|ai\w*|elektroteknik|marin\w*)\b(?:.*?\beller\b\s+([\wåäö ]+))?/i`.
  4. `completed_hp_in_course` (with HP threshold): `/minst\s+([\d,\.]+)\s*hp\s+(?:i|av)\s+([^,.;]+?)(?:\s+ska\s+vara\s+avklarade?)?/i` → lookup course by name in catalog; fall back to `completed_hp_in_course_group` with `course_group_name` = matched phrase if no unique match.
  5. `attended_course`: `/genom­?gång(?:en|na)\s+kurs(?:er)?\s+(?:om\s+minst\s+([\d,\.]+)\s*hp\s+i\s+)?([^,.;]+)/i` → catalog name lookup → `attended_course` (+ optional HP threshold as a second rule).
  6. `completed_course`: `/avklarad(?:e|a)?\s+kurs(?:er)?\s+([^,.;]+?)(?:\s+ska\s+vara\s+avklarade?)?/i` and `/kurs\s+([A-Z]{2}\d{4})\s+ska\s+vara\s+avklarad/i` → catalog lookup by code or name.
  7. `completed_hp_in_subject`: `/minst\s+(\d+)\s*hp\s+inom\s+huvudområdet?\s+([\wåäö ]+)/i`.
  8. `completed_hp_in_course_group`: fallback for "minst X hp [CAD|programmering|matematisk statistik|…]" when no safe course mapping.
  9. Anything containing "eller motsvarande", "gymnasie", "professional", unmatched alternative chains → `custom_text` with `manual_review: true` and the leftover fragment.
- Course-name lookup helper: normalize (lowercase, strip punctuation, swap åäö), unique-prefix match against `courses_catalog.course_name`, also try code regex `[A-Z]{2}\d{4}`. Ambiguous matches → fall back to `completed_hp_in_course_group` not `custom_text`.
- Parser exposes warnings per fragment so the admin preview can surface them.
- Unit-test the parser with fixtures from the BTH texts shown in the task (Maskin/produktinnovation, IE-mjukvaru, etc.) under `src/lib/admin/prereqParser.test.ts`.

## Phase 3 — Admin "Normalisera förkunskaper" action

- In `PrerequisitesTab.tsx`, add a new top-section card: **Normalisera förkunskaper**.
- Button "Förhandsgranska": loads all `courses_catalog` rows with `original_prerequisite_text`, runs the parser, joins against existing `course_prerequisites`, and computes a diff:
  - `toAdd` (new structured rules not already present — dedup by `(target,type,course_id|subject|hp|level|group)` signature),
  - `kept` (existing rules preserved verbatim — manual edits are never overwritten),
  - `manualRemaining` (custom_text fragments still needing review),
  - per-course summary + sample rules.
- Show counts + a scrollable preview table + "Tillämpa" button. Apply uses bulk insert into `course_prerequisites` (never delete or update existing rows → idempotent). Wrapped in confirmation `AlertDialog`.
- This is admin-only via RLS; uses the existing `admin` write policies on `course_prerequisites`.

## Phase 4 — Student-app: catalog-driven prerequisites + risk

- `src/lib/prerequisites.ts`: extend the evaluator so requirement labels render Swedish strings: "Kräver avklarad kurs X", "Kräver genomgången/påbörjad kurs X", "Kräver minst X hp i Y", "Kräver minst X hp totalt", "Kräver manuell kontroll".
- `attended_course` satisfied when `status ∈ {påbörjad, avklarad}`; `completed_course` only when `avklarad`.
- `completed_hp_in_course` counts completed `course_subtasks` HP + full course HP if Avklarad.
- `completed_total_hp`, `completed_hp_in_subject`: sum across user_courses (subject from `catalog_course_id → courses_catalog.subject_area`).
- `completed_hp_in_program_group`, `completed_hp_at_level`: auto-evaluate only if mapping/level exists; otherwise informational.
- `custom_text` / `manual_review`: NEVER a hard blocker — surfaced as an info note.
- `CourseStatusPage.tsx` course detail: new "Förkunskaper" section showing original text + structured list with per-rule met/not-met badge.
- `RiskOverview.tsx`: a course with status Påbörjad is never marked "spärrad". Categorize as: Ej avklarade · Saknade förkunskaper · Spärrade kurser · Manuell kontroll. Recommendations point at the prerequisite course/moment ("Fokusera på Y — den låser upp X"), not the blocked course itself. Show name before code.

## Phase 5 — Focus, program data, data quality, electives

- `prioritization.ts`: include blocker-impact term. If event/subtask belongs to course Y and Y unlocks current/upcoming course X, boost priority. Already-blocked current courses push their prereq moments highest. Lectures/seminars deprioritized unless flagged.
- Focus detail modal: show "Varför prioriterad" with deadline / type / HP / linked course / unlocks list / prereq snippet.
- `programs.ts` / `ProgramSetupPage.tsx`: prefer catalog `programs_catalog + program_courses` for new users; fall back to static templates when catalog empty for a program. Existing users untouched.
- Year/semester computation utility (`studyYear.ts`) reused — fix any spot showing year>5; clamp by program `total_hp / 60`.
- `DataQualityTab.tsx`: add checks for impossible year/semester, prereq with missing required course, courses with only manual prereqs (count + drill-down), and keep the elective-aware HP mismatch already added. Program_courses duplicate check uses full placement key.
- `ProgramsTab.tsx`: program stats already show mandatory/optional/needed/linked; add a "varning: year > program length" badge.

## Out of scope (will note in final summary, not change)
- Bulk re-parsing past JSON-imported prereqs that were committed as custom_text — covered by Phase 3 normalizer running on demand.
- Auto-mapping program_group → real programs (still needs admin curation).
- Changing the focus algorithm weights' user-tunable settings.

## Technical notes

- No DB schema changes needed; all existing columns on `course_prerequisites` already support the parser's output.
- No RLS or auth changes.
- No user-data writes: parser writes only to `course_prerequisites` (admin-only).
- New files: `src/lib/admin/prereqParser.ts`, `src/lib/admin/prereqParser.test.ts`, `src/components/admin/NormalizePrereqsCard.tsx`.
- Edited files (approx): `AdminPanel.tsx`, `ImportTab.tsx`, `CourseCatalogTab.tsx`, `CourseEditorSheet.tsx`, `PrerequisitesTab.tsx`, `DataQualityTab.tsx`, `ProgramsTab.tsx`, `prerequisites.ts`, `prioritization.ts`, `RiskOverview.tsx`, `CourseStatusPage.tsx`, `Dashboard.tsx`, `ProgramSetupPage.tsx`, `programs.ts`, `catalogCompat.ts`.
- Verification per phase: type-check via the harness build, plus `bunx vitest run` for the new parser tests and the existing `prerequisites.test.ts` / `prioritization.test.ts`.

Approve and I'll execute Phase 1 → 5 in sequence, posting a short status after each phase.
