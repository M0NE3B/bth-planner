import { describe, it, expect } from 'vitest';
import { computeHpUnlockMap, computeUnlockBonus } from './hpUnlock';
import type { CourseRequirement, EvalContext } from './prerequisites';

const ctx = (
  courses: { course_code: string; status: string; hp: number; subject?: string }[],
  subtasks: { course_code: string; completed: boolean; hp: number }[] = [],
): EvalContext => ({
  courses: courses.map((c) => ({ ...c, status: c.status })),
  subtasks,
});

describe('computeHpUnlockMap', () => {
  it('returns hp_in_course entry when requirement is unmet', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['MA1450', [{ type: 'completed_hp_in_course', courseCode: 'MA1448', hp: 6 }]],
    ]);
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      evalContext: ctx([
        { course_code: 'MA1448', status: 'partly', hp: 7.5, subject: 'Matematik' },
        { course_code: 'MA1450', status: 'not_started', hp: 6, subject: 'Matematik' },
      ]),
      planCodes: new Set(['MA1448', 'MA1450']),
      yearByCode: new Map([['MA1450', 2]]),
    });
    expect(map.get('MA1448')).toEqual([
      { target: 'MA1450', targetYear: 2, kind: 'hp_in_course' },
    ]);
  });

  it('skips hp_in_course when already fulfilled', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['MA1450', [{ type: 'completed_hp_in_course', courseCode: 'MA1448', hp: 6 }]],
    ]);
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      // MA1448 fully completed → 7.5 HP earned → 6 HP req is met
      evalContext: ctx([
        { course_code: 'MA1448', status: 'completed', hp: 7.5, subject: 'Matematik' },
        { course_code: 'MA1450', status: 'not_started', hp: 6, subject: 'Matematik' },
      ]),
      planCodes: new Set(['MA1448', 'MA1450']),
    });
    expect(map.size).toBe(0);
  });

  it('expands hp_in_subject to every plan course in that subject', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['MA9999', [{ type: 'completed_hp_in_subject', subject: 'Matematik', hp: 30 }]],
    ]);
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      evalContext: ctx([
        { course_code: 'MA1448', status: 'not_started', hp: 7.5, subject: 'Matematik' },
        { course_code: 'MA1450', status: 'not_started', hp: 6, subject: 'Matematik' },
        { course_code: 'DV1234', status: 'not_started', hp: 6, subject: 'Datavetenskap' },
        { course_code: 'MA9999', status: 'not_started', hp: 6, subject: 'Matematik' },
      ]),
      planCodes: new Set(['MA1448', 'MA1450', 'DV1234', 'MA9999']),
      subjectByCode: new Map([
        ['MA1448', 'Matematik'],
        ['MA1450', 'Matematik'],
        ['DV1234', 'Datavetenskap'],
        ['MA9999', 'Matematik'],
      ]),
    });
    // DV course must NOT be a source; target MA9999 doesn't self-unlock.
    expect(map.get('MA1448')?.[0]?.target).toBe('MA9999');
    expect(map.get('MA1450')?.[0]?.target).toBe('MA9999');
    expect(map.get('DV1234')).toBeUndefined();
    expect(map.get('MA9999')).toBeUndefined();
  });

  it('total_hp gives entries to non-completed plan courses only when unmet', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['XX2999', [{ type: 'completed_total_hp', hp: 150 }]],
    ]);
    // 30 HP completed (well under 150)
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      evalContext: ctx([
        { course_code: 'A1', status: 'completed', hp: 15, subject: 'X' },
        { course_code: 'A2', status: 'completed', hp: 15, subject: 'X' },
        { course_code: 'B1', status: 'partly', hp: 7.5, subject: 'X' },
        { course_code: 'XX2999', status: 'not_started', hp: 6, subject: 'X' },
      ]),
      planCodes: new Set(['A1', 'A2', 'B1', 'XX2999']),
    });
    // A1 / A2 already completed → not sources
    expect(map.get('A1')).toBeUndefined();
    expect(map.get('A2')).toBeUndefined();
    expect(map.get('B1')?.some((e) => e.kind === 'total_hp' && e.target === 'XX2999')).toBe(true);
    expect(map.get('XX2999')?.some((e) => e.target === 'XX2999')).not.toBe(true);
  });

  it('total_hp is empty once fulfilled', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['XX2999', [{ type: 'completed_total_hp', hp: 30 }]],
    ]);
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      evalContext: ctx([
        { course_code: 'A1', status: 'completed', hp: 15, subject: 'X' },
        { course_code: 'A2', status: 'completed', hp: 15, subject: 'X' },
        { course_code: 'XX2999', status: 'not_started', hp: 6, subject: 'X' },
      ]),
      planCodes: new Set(['A1', 'A2', 'XX2999']),
    });
    expect(map.size).toBe(0);
  });

  it('ignores targets not in plan', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['NOT_IN_PLAN', [{ type: 'completed_hp_in_course', courseCode: 'MA1448', hp: 6 }]],
    ]);
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      evalContext: ctx([
        { course_code: 'MA1448', status: 'not_started', hp: 7.5, subject: 'Matematik' },
      ]),
      planCodes: new Set(['MA1448']),
    });
    expect(map.size).toBe(0);
  });

  it('ignores manual_review, custom_text, program_group and at_level', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['T', [
        { type: 'custom_text', text: 'Speciellt', blocking: false },
        { type: 'completed_hp_in_program_group', hp: 30, allowedProgramGroups: ['X'] },
        { type: 'completed_hp_at_level', hp: 30, level: 'A1N' },
        { type: 'completed_hp_in_course', courseCode: 'SRC', hp: 6, manualReview: true },
      ]],
    ]);
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      evalContext: ctx([
        { course_code: 'SRC', status: 'not_started', hp: 7.5 },
        { course_code: 'T', status: 'not_started', hp: 6 },
      ]),
      planCodes: new Set(['SRC', 'T']),
    });
    expect(map.size).toBe(0);
  });

  it('skips classic course→course requirements (handled by blockingMap)', () => {
    const reqs = new Map<string, CourseRequirement[]>([
      ['T', [
        { type: 'completed_course', courseCode: 'SRC' },
        { type: 'attended_course', courseCode: 'SRC2' },
      ]],
    ]);
    const map = computeHpUnlockMap({
      requirementsByCode: reqs,
      evalContext: ctx([
        { course_code: 'SRC', status: 'not_started', hp: 6 },
        { course_code: 'SRC2', status: 'not_started', hp: 6 },
        { course_code: 'T', status: 'not_started', hp: 6 },
      ]),
      planCodes: new Set(['SRC', 'SRC2', 'T']),
    });
    expect(map.size).toBe(0);
  });
});

describe('computeUnlockBonus', () => {
  it('caps bonus at 18', () => {
    const entries = [
      { target: 'A', targetYear: 1, kind: 'hp_in_course' as const },   // 10
      { target: 'B', targetYear: 1, kind: 'hp_in_subject' as const },  // 6
      { target: 'C', targetYear: 1, kind: 'total_hp' as const },        // 3
    ];
    const { bonus } = computeUnlockBonus(entries, { currentYear: 1, eventHasHp: true });
    expect(bonus).toBe(18); // 10+6+3 = 19 capped to 18
  });

  it('total_hp bonus requires eventHasHp', () => {
    const entries = [{ target: 'A', targetYear: 1, kind: 'total_hp' as const }];
    expect(computeUnlockBonus(entries, { currentYear: 1, eventHasHp: false }).bonus).toBe(0);
    expect(computeUnlockBonus(entries, { currentYear: 1, eventHasHp: true }).bonus).toBe(3);
  });

  it('excludeTargets prevents double-count with blockingMap', () => {
    const entries = [{ target: 'A', targetYear: 1, kind: 'hp_in_course' as const }];
    const { bonus } = computeUnlockBonus(entries, {
      currentYear: 1,
      eventHasHp: false,
      excludeTargets: new Set(['A']),
    });
    expect(bonus).toBe(0);
  });

  it('weights upcoming year lower than current year', () => {
    const current = computeUnlockBonus(
      [{ target: 'A', targetYear: 2, kind: 'hp_in_course' }],
      { currentYear: 2, eventHasHp: false },
    ).bonus;
    const upcoming = computeUnlockBonus(
      [{ target: 'A', targetYear: 3, kind: 'hp_in_course' }],
      { currentYear: 2, eventHasHp: false },
    ).bonus;
    const far = computeUnlockBonus(
      [{ target: 'A', targetYear: 5, kind: 'hp_in_course' }],
      { currentYear: 2, eventHasHp: false },
    ).bonus;
    expect(current).toBeGreaterThan(upcoming);
    expect(upcoming).toBeGreaterThan(far);
  });
});
