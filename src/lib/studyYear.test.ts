import { describe, it, expect } from 'vitest';
import { mapTermToAcademic, isOutsideProgramLength } from './studyYear';

describe('mapTermToAcademic (HT2023 start)', () => {
  const start = 2023;
  it('HT2023 → year 1, sem 1', () => {
    expect(mapTermToAcademic(start, 'HT', 2023)).toEqual({ academicYear: 1, semester: 1 });
  });
  it('VT2024 → year 1, sem 2', () => {
    expect(mapTermToAcademic(start, 'VT', 2024)).toEqual({ academicYear: 1, semester: 2 });
  });
  it('HT2024 → year 2, sem 3', () => {
    expect(mapTermToAcademic(start, 'HT', 2024)).toEqual({ academicYear: 2, semester: 3 });
  });
  it('VT2027 → year 4, sem 8', () => {
    expect(mapTermToAcademic(start, 'VT', 2027)).toEqual({ academicYear: 4, semester: 8 });
  });
  it('HT2027 → year 5, sem 9', () => {
    expect(mapTermToAcademic(start, 'HT', 2027)).toEqual({ academicYear: 5, semester: 9 });
  });
  it('VT2028 → year 5, sem 10', () => {
    expect(mapTermToAcademic(start, 'VT', 2028)).toEqual({ academicYear: 5, semester: 10 });
  });
});

describe('isOutsideProgramLength (5-year/300 HP)', () => {
  it('VT2028 is inside 5-year program from HT2023', () => {
    expect(isOutsideProgramLength(2023, 'VT', 2028, 5)).toBe(false);
  });
  it('HT2028 is outside 5-year program from HT2023', () => {
    expect(isOutsideProgramLength(2023, 'HT', 2028, 5)).toBe(true);
  });
});
