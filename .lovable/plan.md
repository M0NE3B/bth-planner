## Mål

Utvidga spärr-bonusen i **Fokusera härnäst** så att även typade HP-krav (`completed_hp_in_course`, `completed_hp_in_subject`, `completed_total_hp`) påverkar prioriteringen — inte bara klassiska kurs→kurs-krav.

## Status idag

- `useCatalogPrereqs.blocksByCode` indexerar redan `completed_course`, `attended_course` **och** `completed_hp_in_course` → så "minst 6 HP från MA1448" ger faktiskt redan bonus på MA1448-händelser. Det vi behöver lägga till är `completed_hp_in_subject` och `completed_total_hp`, och säkerställa att vi bara ger bonus när kravet faktiskt är **ouppfyllt**.
- Dashboard.scoreEvent får idag spärr-bonus oavsett om kravet redan är uppfyllt — vilket är ett mindre fel som åtgärdas på vägen.

## Vad som byggs

### 1. Ny ren hjälpmodul: `src/lib/hpUnlock.ts`

Exporterar `computeHpUnlockMap(...)` som tar:
- `requirementsByCode: Map<string, CourseRequirement[]>` (från katalog)
- `evalContext` (courses + subtasks med subject)
- `planCodes: Set<string>` (studentens egna kurser)
- `courseSubject: Map<string, string>` (kod → primärt huvudområde)

Returnerar `Map<courseCode, UnlockEntry[]>` där varje entry är:
```
{ target: string, targetYear: number, kind: 'hp_in_course' | 'hp_in_subject' | 'total_hp' }
```

Regler:
- Endast targets som finns i `planCodes`.
- Endast krav som **utvärderas som ouppfyllda** via `evaluateRequirement`.
- `completed_hp_in_course` → en entry på den kurskoden (kind `hp_in_course`).
- `completed_hp_in_subject` → för varje plankurs vars primära huvudområde matchar → en entry (kind `hp_in_subject`).
- `completed_total_hp` → för varje plankurs som **inte** är avklarad → en entry (kind `total_hp`).
- `completed_hp_in_program_group` och `completed_hp_at_level` ignoreras (kan inte utvärderas säkert i Dashboard-kontexten).
- `custom_text` / `manualReview` ignoreras (matchar redan filtreringen i `useCatalogPrereqs`).
- Per `(sourceCode, target, kind)` dedupliceras så samma krav inte räknas två gånger.

### 2. Wire-in i `Dashboard.tsx`

- Bygg `unlockMap` med `useMemo` parallellt med `blockingMap`, med samma `planCodes`-filter.
- Bygg en `courseSubject`-map från `catalog.courseByCode` (primary subject via `resolveSubject`).
- Bygg en lättviktig `evalContext` (samma form som CourseStatusPage redan gör) — kurser med subject, subtasks med course_code via `courseIdToCode`.
- I `scoreEvent`, efter befintlig `blockingMap`-bonus, lägg till en HP-unlock-bonus baserad på `unlockMap.get(event.course_code)`:
  - Bonus per kind, kapad så ingen kategori dubbelräknas:
    - `hp_in_course`: 10 / 6 / 2 (current / upcoming / future år)
    - `hp_in_subject`: 6 / 4 / 1
    - `total_hp`: fast +3 om event har HP > 0, annars 0
  - Totalsumman för HP-unlock kapas till **+18** för att inte överrösta deadline/typ-vikten.
  - Ges **inte** om `blockingMap` redan gav bonus för samma target (undvik dubbelräkning).
- Filterregel oförändrad: föreläsning/seminarium/annat utan HP eller kurskoppling kommer fortfarande inte med i `focusEvents`.

### 3. Förklaringstexter

Utvidga `getBlockingLabel` (eller en parallell `getUnlockLabel`) så `getShortReason` / `getDetailedReasons` kan visa något i stil med:
- "Bidrar till HP-krav i {target}"
- "Bidrar till HP inom {huvudområde} (krävs för {target})"
- "Räknas mot totalt HP-krav för {target}"

Endast en kort rad visas i kortet; fler visas i modalens detaljerade lista. Inga blockerande/hårda flaggor — det är endast en prioritetssignal.

### 4. Tester

- Ny fil `src/lib/hpUnlock.test.ts`:
  - `completed_hp_in_course` ouppfyllt → producerar entry på källkursen.
  - `completed_hp_in_course` redan uppfyllt → ingen entry.
  - `completed_hp_in_subject` → entries för alla plankurser inom huvudområdet, ingen för andra subjects.
  - `completed_total_hp` ouppfyllt → entries för plankurser som **inte** är avklarade; uppfyllt → tom.
  - Target som inte finns i `planCodes` → ignoreras.
  - `manualReview` / `custom_text` / `program_group` / `at_level` → ignoreras.
- Befintliga `Dashboard.test.tsx` och `prioritization.test.ts` ska fortsatt passera oförändrade.
- Kör hela testsviten (`bunx vitest run`) på slutet.

## Vad som **inte** ändras

- Kursstatusar, händelser, delmoment eller annan användardata.
- Befintlig poänglogik (deadline, typvikt, HP-cap, kopplad subtask-bonus, klassisk blockingMap-bonus).
- Filtreringen i `focusEvents` som håller föreläsning/seminarium borta från toppen.
- Admin- eller CourseStatusPage-flödet.

## Tekniska detaljer

- `hpUnlock.ts` är en ren funktion utan React/Supabase — enkel att enhetstesta.
- Använder befintliga `evaluateRequirement`, `primarySubject`, `resolveSubject` från `prerequisites.ts`.
- HP-unlock-bonus kapas (max +18) så den kompletterar men aldrig dominerar deadline-signalen.
- Plan-filter (`planCodes`) appliceras både i unlock-byggandet och i Dashboard, vilket håller bonusen relevant för studentens egen studieplan.
