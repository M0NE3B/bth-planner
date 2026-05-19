import { describe, expect, it } from 'vitest';
import { buildCourseIndex, parsePrerequisiteText } from './prereqParser';
import type { CatalogCourse } from '../catalog';

const C = (code: string, name: string, hp = 6): CatalogCourse => ({
  id: `id-${code}`,
  course_code: code,
  course_name: name,
  hp,
  subject_area: null,
  level: null,
  original_prerequisite_text: null,
  active: true,
});

const CATALOG: CatalogCourse[] = [
  C('MA1448', 'Linjär algebra'),
  C('DV1531', 'Programmering och problemlösning med Python'),
  C('MT1531', 'Datorstödd konstruktion, CAD'),
  C('MT1500', 'Produktutvecklingsmetodik'),
  C('MS1404', 'Matematisk statistik'),
];

const idx = buildCourseIndex(CATALOG);

describe('parsePrerequisiteText', () => {
  it('parses completed_total_hp', () => {
    const r = parsePrerequisiteText('150 avklarade högskolepoäng.', idx);
    expect(r.rules.find((x) => x.requirement_type === 'completed_total_hp')?.required_hp).toBe(150);
  });

  it('parses HP from program group', () => {
    const r = parsePrerequisiteText(
      '60 hp från ett civilingenjörsprogram i maskinteknik eller industriell ekonomi.',
      idx,
    );
    const rule = r.rules.find((x) => x.requirement_type === 'completed_hp_in_program_group');
    expect(rule?.required_hp).toBe(60);
    expect(rule?.allowed_program_groups?.length).toBeGreaterThanOrEqual(1);
  });

  it('parses attended_course by name', () => {
    const r = parsePrerequisiteText(
      'Dessutom krävs genomgången kurs om minst 6 hp i Produktutvecklingsmetodik.',
      idx,
    );
    const rule = r.rules.find((x) => x.requirement_type === 'completed_hp_in_course');
    expect(rule?.required_course_id).toBe('id-MT1500');
    expect(rule?.required_hp).toBe(6);
  });

  it('parses completed_course by code', () => {
    const r = parsePrerequisiteText('Avklarad kurs MA1448.', idx);
    expect(r.rules.some((x) => x.requirement_type === 'completed_course' && x.required_course_id === 'id-MA1448')).toBe(true);
  });

  it('parses HP at advanced level', () => {
    const r = parsePrerequisiteText('Minst 30 hp på avancerad nivå.', idx);
    expect(r.rules.find((x) => x.requirement_type === 'completed_hp_at_level')?.required_level).toBe('advanced');
  });

  it('splits a complex prerequisite into multiple structured rules', () => {
    const text =
      '150 avklarade högskolepoäng varav 60 hp ska vara från ett civilingenjörsprogram i maskinteknik eller industriell ekonomi. ' +
      'I de 60 hp ska kurs om minst 6 hp Datorstödd konstruktion, CAD ingå. ' +
      'Dessutom krävs genomgången kurs om minst 6 hp i Produktutvecklingsmetodik och Matematisk statistik 6 hp.';
    const r = parsePrerequisiteText(text, idx);
    const types = r.rules.map((x) => x.requirement_type);
    expect(types).toContain('completed_total_hp');
    expect(types).toContain('completed_hp_in_program_group');
  });

  it('preserves ambiguous text as custom_text', () => {
    const r = parsePrerequisiteText('Engelska 6 eller motsvarande.', idx);
    expect(r.rules.some((x) => x.requirement_type === 'custom_text' && x.manual_review)).toBe(true);
  });
});
