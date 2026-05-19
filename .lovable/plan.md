# Förenkla & rensa upp förkunskaps-/kursvyn

## Mål
Mindre brus, mer relevans. Studenten ska bara se det som faktiskt rör hens program och kurser. Admin gör förkunskaper manuellt istället för via parser.

## 1. Förkunskaper – ta bort gymnasie-/grundkrav
- I `prereqParser.ts` (och visning) filtrera bort regler som matchar gymnasiebehörighet: "grundläggande behörighet", "områdesbehörighet", "Matematik 3c/4", "Fysik 2", "Engelska 6", "svensk gymnasiekompetens", osv. → markeras som `gymnasium` och visas/sparas inte som krav.
- Endast krav som refererar till programkurser (kurskod, HP i ämne på högskolenivå, total HP, nivå G1/G2) behålls.
- `RiskOverview` och `CourseStatusPage` filtrerar bort allt som är gymnasium även om det ligger i `original_prerequisite_text`.

## 2. Ta bort Normalisera-verktyget
- Ta bort `NormalizePrereqsCard` från `PrerequisitesTab`.
- Lämna `prereqParser` kvar internt men oexponerat (admin redigerar manuellt via `CourseEditorSheet` + `PrerequisiteRow`).
- Lägg till tydligare manuell editor i Förkunskaper-tabben: lista kurser, klick → redigera regler en och en. (Återanvänd `PrerequisiteRow`.)

## 3. Filtrera "spärrar"/blockers mot studentens program
- I `useCatalogPrereqs` returnera `blocksByCode` som idag (full karta).
- I `RiskOverview` och `CourseStatusPage`: filtrera `blocksByCode[code]` så endast kurser som finns i studentens `user_courses` visas under "Låser upp" / "Spärrade kurser".
- "Fokusera på X" i Dashboard: samma filter – bara räkna blockers som ligger i studentens plan.

## 4. Snyggare visning av förkunskaper per kurs
- I `CourseStatusPage` ersätt nuvarande rådump med en kompakt lista:
  - En rad per regel: ikon (✓/✗/?) + kort text på svenska ("MA1444 Linjär algebra – avklarad", "60 HP på G1-nivå – du har 42 HP").
  - Dölj `custom_text` och `manual_review` bakom "Visa övriga krav" (default kollapsad).
- Ta bort råtextblocket från student-vyn (behåll i admin).

## 5. Klickbart kursnamn → kursinfo-popover
- Ny komponent `CourseInfoPopover` (använd `HoverCard` + klick på mobil via `Dialog`).
- Visar: kod, namn, HP, ämnesområde, nivå, original förkunskapstext, vilka av studentens kurser den låser upp, status.
- Används i: `RiskOverview`, `CourseStatusPage`, Dashboard "Fokusera härnäst", kalender-event.

## 6. Valbara kurser i Kurser-vyn
- I `CourseStatusPage` per år: ny sektion "Valbara kurser".
- Hämta kandidater från `program_courses` där `mandatory = false` för studentens program + år, som inte redan finns i `user_courses`.
- Knapp "Lägg till" → skapar `user_courses`-rad (kopplad via `catalog_course_id`).
- Knapp "Ta bort" på valbara kurser som studenten lagt till (status `not_started` och `mandatory=false`).

## 7. Riskbild – förenkla
- Behåll fyra grupperna men:
  - Slå ihop "Manuell kontroll" + custom_text till en liten "Övrigt"-fotnot.
  - "Spärrade kurser" filtreras mot studentens plan (punkt 3).
  - "Saknade förkunskaper" döljer gymnasium (punkt 1).
- Rekommendationer max 3 stycken, sorterade efter (antal blockers i planen × HP-vikt).

## Filer som ändras
- `src/lib/admin/prereqParser.ts` – lägg till gymnasium-filter
- `src/lib/useCatalogPrereqs.ts` – exportera helper `filterBlocksToPlan(codes, userCourseCodes)`
- `src/components/RiskOverview.tsx` – filter + förenklad grupp
- `src/components/CourseStatusPage.tsx` – ny prereq-rendering, valbara kurser, popover
- `src/components/Dashboard.tsx` – blocker-bonus räknar bara plan-kurser
- `src/components/admin/PrerequisitesTab.tsx` – ta bort Normalize-kortet, lägg till manuell lista
- **Ny:** `src/components/CourseInfoPopover.tsx`

## Vad jag INTE rör
- Auth/RLS, befintliga `user_courses`/`study_events`/`course_subtasks`
- Statiska program-fallbacks (`src/lib/programs/*`)
- Migrations / databasstruktur (ren frontend-förändring)
- Generated UI (`src/components/ui/*`)

## Inga tester körs i denna PR
Lägger till manuell verifiering: kontrollera att tester fortsatt går grönt efter ändringarna; uppdaterar `RiskOverview`/`CourseStatusPage`-relaterade snapshot-tester om de finns.
