# BTH Studieplanerare

En webbaserad studieplanerare för studenter vid Blekinge Tekniska Högskola (BTH).

Appen samlar programstruktur, kurser, förkunskapskrav, HP-progress, delmoment och deadlines på ett ställe. Syftet är att hjälpa studenten förstå vad som är avklarat, vad som riskerar att spärra kommande kurser och vad som bör prioriteras härnäst.

**Live:** https://bthplanner.com

---

## Syfte

BTH Studieplanerare är byggd för utbildningsprogram där kurskedjor, högskolepoäng och förkunskapskrav påverkar studentens möjlighet att läsa kommande kurser.

Målet är att ge studenten en tydligare överblick över:

- vilka kurser som ingår i programmet
- vilka kurser och moment som är avklarade
- vilka förkunskapskrav som saknas
- vilka kurser som riskerar att spärras
- vilka deadlines och uppgifter som bör prioriteras

---

## Huvudfunktioner

- **Programbaserad studieplan**  
  Studenten väljer BTH-program och startår. Appen skapar en studieplan utifrån programmets kursstruktur.

- **Kursstatus och HP-progress**  
  Kurser kan markeras som ej påbörjade, påbörjade eller avklarade. HP räknas både från hela kurser och avklarade delmoment.

- **Förkunskapskrav och riskbild**  
  Appen visar om en kurs kräver exempelvis avklarad kurs, genomgången/påbörjad kurs eller ett visst antal HP.

- **Fokusera härnäst**  
  En prioriteringsvy som hjälper studenten se vad som bör göras först baserat på deadlines, HP, kursstatus och förkunskapsrisk.

- **Kalender och delmoment**  
  Tentor, uppgifter, labbar och andra studiehändelser kan läggas in i kalendern. Händelser med HP kan kopplas till kursens delmoment.

- **Admin och kurskatalog**  
  Admin kan hantera program, kurser, förkunskapskrav och importerad katalogdata.

- **Autentisering**  
  Inloggning via e-post och lösenord, inklusive flöde för glömt lösenord.

All UI är på svenska.

---

## Teknikstack

- **Frontend:** React 18, TypeScript, Vite
- **UI:** Tailwind CSS, shadcn/ui, Radix UI, lucide-react
- **Routing:** react-router-dom
- **State och data:** TanStack Query, React hooks
- **Formulär och validering:** react-hook-form, zod
- **Backend:** Lovable Cloud / Supabase
- **Databas:** PostgreSQL med Row-Level Security
- **Tester:** Vitest, Testing Library, jsdom
- **Kodkvalitet:** ESLint, TypeScript, SonarCloud

---

## Kom igång lokalt

Krav:

- Node.js 20+
- npm

```sh
# 1. Klona repot
git clone https://github.com/jacobzafar/bth-planner.git
cd bth-planner

# 2. Installera beroenden
npm install

# 3. Skapa en .env-fil
cp .env.example .env

# 4. Starta utvecklingsservern
npm run dev
```

Appen körs som standard på:

```text
http://localhost:8080
```

---

## Miljövariabler

| Variabel | Beskrivning |
| --- | --- |
| `VITE_SUPABASE_URL` | Publik Supabase-URL för klienten |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase-projektets ID |
| `SUPABASE_URL` | Supabase-URL för verktyg och scripts |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon-key för verktyg och scripts |


Klientkoden använder endast publika Supabase-nycklar. Service-role-nycklar ska aldrig läggas i frontendkod.

---

## NPM-skript

| Skript | Beskrivning |
| --- | --- |
| `npm run dev` | Startar Vite dev-server |
| `npm run build` | Skapar produktionsbygge |
| `npm run build:dev` | Skapar utvecklingsbygge |
| `npm run preview` | Förhandsgranskar produktionsbygget lokalt |
| `npm run lint` | Kör ESLint |
| `npm run test` | Kör Vitest en gång |
| `npm run test:watch` | Kör Vitest i watch-läge |

---

## Mappstruktur

```text
src/
├─ assets/                  Bilder och statiska resurser
├─ components/              App-komponenter och vyer
│  ├─ admin/                Adminvyer för katalog och datakvalitet
│  ├─ ui/                   shadcn/ui-komponenter
│  ├─ AuthPage.tsx          Inloggning och registrering
│  ├─ Dashboard.tsx         Översikt och Fokusera härnäst
│  ├─ CourseStatusPage.tsx  Kurser, status och delmoment
│  ├─ CalendarPage.tsx      Kalender
│  ├─ AddEventPage.tsx      Skapa studiehändelse
│  ├─ ProgramSetupPage.tsx  Programval och onboarding
│  └─ SettingsPage.tsx      Inställningar
├─ hooks/                   Återanvändbara React-hooks
├─ integrations/supabase/   Supabase-klient och typer
├─ lib/
│  ├─ admin/                Import, parser och adminlogik
│  ├─ programs/             Statiska fallback-mallar
│  ├─ prerequisites.ts      Förkunskapslogik
│  ├─ prioritization.ts     Prioriteringslogik
│  ├─ studyYear.ts          Läsårs- och terminslogik
│  ├─ types.ts              Domäntyper
│  └─ utils.ts              Hjälpfunktioner
├─ pages/                   Routade sidor
├─ test/                    Test-setup
├─ App.tsx
└─ main.tsx

supabase/
├─ migrations/              Databasmigrationer
└─ config.toml
```

---

## Datamodell och katalog

Appen använder en katalogbaserad struktur för program och kurser:

- `programs_catalog`
- `courses_catalog`
- `program_courses`
- `course_prerequisites`
- `user_courses`
- `course_subtasks`
- `study_events`

Katalogen används som primär källa för program, kurser och förkunskapskrav. Statiska programmallar finns kvar som fallback om katalogdata saknas.

Befintliga användares data ska bevaras när katalogen ändras. Kursstatusar, kalenderhändelser och delmoment är kopplade till användaren och ska inte nollställas vid kataloguppdateringar.

---

## Tester och kvalitet

Projektet använder:

- **Vitest** för enhetstester
- **Testing Library** för komponenttester
- **TypeScript** för typkontroll
- **ESLint** för statisk kodanalys
- **SonarCloud** för kodkvalitet och quality gate

Kör tester:

```sh
npm run test
```

Kör lint:

```sh
npm run lint
```

Bygg projektet:

```sh
npm run build
```

---

## Backend

Backend körs via Lovable Cloud / Supabase.

- **Auth:** e-post och lösenord
- **Databas:** PostgreSQL
- **RLS:** användare kan bara läsa och ändra sin egen studiedata
- **Admin:** administratörer kan hantera katalogdata och förkunskapskrav
- **Migrationer:** schemaändringar ligger i `supabase/migrations/`

Supabase-klienten och genererade typer ligger i:

```text
src/integrations/supabase/
```

---

## Status och begränsningar

Detta är ett studentprojekt/prototypverktyg. Kursdata och förkunskapskrav kan behöva administrativ granskning, särskilt när kraven innehåller äldre kurskoder, alternativa krav eller formuleringar som “eller motsvarande”.

Appen ska därför ses som ett planeringsstöd, inte som en officiell ersättning för BTH:s utbildningsplaner eller Ladok.

---

## Bidra

1. Skapa en branch.
2. Gör ändringen.
3. Kör tester och lint.
4. Öppna en pull request.

```sh
npm run lint
npm run test
npm run build
```
