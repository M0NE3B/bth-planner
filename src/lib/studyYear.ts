/**
 * Helpers for estimating where a student is in their studies based on
 * their selected start year. Swedish academic year starts roughly in
 * late August (HT). We treat July as the cutoff for a new academic year.
 */

export interface StudyYearEstimate {
  /** Estimated study year (1-based). May exceed program length. */
  year: number;
  /** Estimated semester within the year: 1 = HT (autumn), 2 = VT (spring). */
  semester: 1 | 2;
  /** True when the estimation is rough (e.g. before program start or after end). */
  uncertain: boolean;
  /** Human-readable Swedish label, e.g. "År 2, termin 1 (HT)". */
  label: string;
}

export function estimateStudyYear(startYear: number, now: Date = new Date()): StudyYearEstimate {
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();

  const academicYearStart = month >= 8 ? year : year - 1;
  const rawStudyYear = academicYearStart - startYear + 1;
  const semester: 1 | 2 = month >= 8 ? 1 : 2;

  const studyYear = Math.max(1, rawStudyYear);
  const uncertain = rawStudyYear < 1 || rawStudyYear > 5;

  const termLabel = semester === 1 ? 'HT' : 'VT';
  const label = uncertain
    ? `Baserat på ditt startår ${startYear}`
    : `År ${studyYear}, termin ${semester} (${termLabel})`;

  return { year: studyYear, semester, uncertain, label };
}

export type Term = 'HT' | 'VT';

export interface AcademicMapping {
  academicYear: number;
  semester: number; // 1..N (overall semester index in program)
}

/**
 * Map a calendar (term, year) to academic year/semester relative to a program
 * start year. Assumes the program starts in HT of `startYear`.
 *
 * Rules:
 * - HT year Y: academicYear = Y - startYear + 1, semester = (Y - startYear) * 2 + 1
 * - VT year Y: academicYear = Y - startYear,     semester = (Y - startYear) * 2
 */
export function mapTermToAcademic(
  startYear: number,
  term: Term,
  year: number,
): AcademicMapping {
  if (term === 'HT') {
    const academicYear = year - startYear + 1;
    const semester = (year - startYear) * 2 + 1;
    return { academicYear, semester };
  }
  const academicYear = year - startYear;
  const semester = (year - startYear) * 2;
  return { academicYear, semester };
}

/**
 * Returns true if (term, year) is outside the normal length (in years) of a program.
 * For a 300 HP / 5-year program: max academic year is 5, max semester is 10.
 */
export function isOutsideProgramLength(
  startYear: number,
  term: Term,
  year: number,
  programLengthYears: number,
): boolean {
  const m = mapTermToAcademic(startYear, term, year);
  return m.academicYear > programLengthYears || m.semester > programLengthYears * 2 || m.academicYear < 1;
}
