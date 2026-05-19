import { describe, it, expect } from 'vitest';
import { buildIndex } from './useCatalogPrereqs';
import { evaluateRequirement } from './prerequisites';
import type { CatalogCourse, CatalogPrerequisite } from './catalog';

const courses: CatalogCourse[] = [
  { id: 'c1', course_code: 'MA1444', course_name: 'Analys 1', hp: 6, subject_area: 'Matematik', level: 'G1N', original_prerequisite_text: null, active: true },
  { id: 'c2', course_code: 'MA1445', course_name: 'Analys 2', hp: 6, subject_area: 'Matematik', level: 'G1F', original_prerequisite_text: 'Genomgången MA1444', active: true },
  { id: 'c3', course_code: 'IY1422', course_name: 'Finansiell ekonomi', hp: 7.5, subject_area: 'Industriell ekonomi och management', level: 'G1F', original_prerequisite_text: null, active: true },
];

const prereqs: CatalogPrerequisite[] = [
  // Analys 2 requires attended MA1444
  { id: 'p1', target_course_id: 'c2', requirement_type: 'attended_course', required_course_id: 'c1', required_hp: null, required_subject_area: null, original_text: 'Genomgången MA1444', logic_group: null },
  // IY1422 requires completed MA1444
  { id: 'p2', target_course_id: 'c3', requirement_type: 'completed_course', required_course_id: 'c1', required_hp: null, required_subject_area: null, original_text: 'Avklarad MA1444', logic_group: null },
];

describe('useCatalogPrereqs buildIndex', () => {
  const idx = buildIndex(courses, prereqs);

  it('builds requirementsByCode keyed by course_code', () => {
    expect(idx.requirementsByCode.get('MA1445')?.[0]?.type).toBe('attended_course');
    expect(idx.requirementsByCode.get('IY1422')?.[0]?.type).toBe('completed_course');
  });

  it('builds blocksByCode (MA1444 unlocks MA1445 + IY1422)', () => {
    const blocks = idx.blocksByCode.get('MA1444') ?? [];
    expect(blocks).toContain('MA1445');
    expect(blocks).toContain('IY1422');
  });

  it('captures original prerequisite text', () => {
    expect(idx.originalTextByCode.get('MA1445')).toContain('MA1444');
  });
});

describe('catalog prereq evaluation', () => {
  const idx = buildIndex(courses, prereqs);

  it('attended_course is fulfilled by Påbörjad', () => {
    const ctx = { courses: [{ course_code: 'MA1444', status: 'partly', hp: 6 }] };
    const req = idx.requirementsByCode.get('MA1445')![0];
    const r = evaluateRequirement(req, ctx);
    expect(r.fulfilled).toBe(true);
  });

  it('attended_course is fulfilled by Avklarad', () => {
    const ctx = { courses: [{ course_code: 'MA1444', status: 'completed', hp: 6 }] };
    const r = evaluateRequirement(idx.requirementsByCode.get('MA1445')![0], ctx);
    expect(r.fulfilled).toBe(true);
  });

  it('completed_course requires Avklarad (Påbörjad is not enough)', () => {
    const ctx = { courses: [{ course_code: 'MA1444', status: 'partly', hp: 6 }] };
    const r = evaluateRequirement(idx.requirementsByCode.get('IY1422')![0], ctx);
    expect(r.fulfilled).toBe(false);
  });

  it('completed_course is fulfilled by Avklarad', () => {
    const ctx = { courses: [{ course_code: 'MA1444', status: 'completed', hp: 6 }] };
    const r = evaluateRequirement(idx.requirementsByCode.get('IY1422')![0], ctx);
    expect(r.fulfilled).toBe(true);
  });
});
