/**
 * Swedish BTH prerequisite text parser.
 *
 * Heuristic, aggressive parser that splits free-text Swedish prerequisite
 * descriptions into structured rules matching the catalog's RequirementType
 * model. Aggressive by design — the admin reviews proposals in the
 * "Normalisera förkunskaper"-verktyget before anything is written.
 *
 * Output is deterministic and idempotent given the same catalog snapshot.
 */
import type { RequirementType } from '../catalog';
import type { JsonPrerequisite } from './jsonImport';

export interface ParserCourse {
  id: string;
  course_code: string;
  course_name: string;
  subject_area: string | null;
}

export interface ParseRuleProposal extends Omit<JsonPrerequisite, 'target_course_code'> {
  /** Source fragment in the original text. */
  source_fragment: string;
  /** Why the parser produced this rule — used in the diff UI. */
  reason: string;
  /** Heuristic confidence 0-1 — drives manual_review when below ~0.6. */
  confidence: number;
}

export interface ParseResult {
  rules: ParseRuleProposal[];
  /** Fragments the parser could not classify with any confidence. */
  unmatched: string[];
}

// ---------- helpers ----------

const COURSE_CODE_RE = /\b([A-Z]{2,3}\d{3,4}[A-Z]?)\b/g;
const HP_RE = /(\d+(?:[.,]\d+)?)\s*(?:hp|h\u00f6gskolepo[äa]ng)/i;

const SUBJECT_HEADERS = [
  'matematik', 'datavetenskap', 'maskinteknik', 'industriell ekonomi',
  'fysik', 'elektroteknik', 'programvaruteknik', 'mjukvaruteknik',
  'kemi', 'h\u00e5llbar utveckling', 'h\u00e5llbar produktinnovation',
  'produktutveckling', 'teknisk fysik', 'matematisk statistik',
  'statistik', 'mekanik', 'h\u00e5llfasthetsl\u00e4ra',
  'datateknik', 'programmering',
];

const PROGRAM_GROUPS = [
  'civilingenj\u00f6rsprogram', 'civilingenj\u00f6r', 'h\u00f6gskoleingenj\u00f6r',
  'maskinteknik', 'industriell ekonomi', 'datateknik', 'mjukvaruteknik',
  'datavetenskap', 'spelteknik', 'spelutveckling',
];

const ADVANCED_LEVEL_PATTERNS = [
  /avancerad\s+niv[åa]/i, /a1n/i, /a1f/i, /a2e/i,
];

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function splitFragments(text: string): string[] {
  // Sentence-level + Swedish conjunctions used to chain requirements.
  const normalized = text
    .replace(/\u00a0/g, ' ')
    .replace(/\s*[\u2022\u00b7]\s*/g, '. ')
    .replace(/\bsamt\b/gi, '. samt ')
    .replace(/\bdessutom\b/gi, '. dessutom ')
    .replace(/\bvidare kr[äa]vs\b/gi, '. vidare ')
    .replace(/\bd[äa]rut[öo]ver\b/gi, '. d\u00e4rut\u00f6ver ');
  return normalized
    .split(/(?<=[.!?])\s+|;|\n+/)
    .map(clean)
    .filter((f) => f.length > 3);
}

/** Locate a course by code or fuzzy name substring. */
function findCourse(
  fragment: string,
  catalog: ParserCourse[],
): ParserCourse | null {
  // Code match first
  const codeMatch = fragment.match(COURSE_CODE_RE);
  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    const hit = catalog.find((c) => c.course_code.toUpperCase() === code);
    if (hit) return hit;
  }
  // Try name match — longest course name that occurs in the fragment wins.
  const lower = fragment.toLowerCase();
  let best: ParserCourse | null = null;
  let bestLen = 0;
  for (const c of catalog) {
    const name = c.course_name?.toLowerCase().trim();
    if (!name || name.length < 6) continue;
    if (lower.includes(name) && name.length > bestLen) {
      best = c;
      bestLen = name.length;
    }
  }
  return best;
}

function extractHp(s: string): number | null {
  const m = s.match(HP_RE);
  if (!m) return null;
  return Number(m[1].replace(',', '.'));
}

function matchSubject(s: string): string | null {
  const lower = s.toLowerCase();
  // Prefer explicit "huvudområde(t)? X" phrasing.
  const m = lower.match(/huvudomr[åa]det?\s+([a-z\u00e0-\u017f\s-]{3,40}?)(?:\b(?:och|samt|med|niv|hp|\.|,|;|$))/);
  if (m) return clean(m[1]);
  for (const sub of SUBJECT_HEADERS) {
    if (lower.includes(sub)) return sub;
  }
  return null;
}

function matchProgramGroups(s: string): string[] {
  const lower = s.toLowerCase();
  const out = new Set<string>();
  for (const g of PROGRAM_GROUPS) {
    if (lower.includes(g)) out.add(g);
  }
  return Array.from(out);
}

// ---------- main ----------

export function parsePrerequisiteText(
  originalText: string,
  catalog: ParserCourse[],
): ParseResult {
  const rules: ParseRuleProposal[] = [];
  const unmatched: string[] = [];
  const fragments = splitFragments(originalText);

  for (const frag of fragments) {
    const lower = frag.toLowerCase();
    const hp = extractHp(frag);

    // H: advanced level
    if (hp != null && ADVANCED_LEVEL_PATTERNS.some((r) => r.test(frag))) {
      rules.push(makeRule({
        requirement_type: 'completed_hp_at_level',
        required_hp: hp,
        required_level: 'avancerad',
        original_text: frag,
        source_fragment: frag,
        reason: `${hp} HP p\u00e5 avancerad niv\u00e5`,
        confidence: 0.85,
      }));
      continue;
    }

    // F: program group HP (e.g. "60 hp från ett civilingenjörsprogram i maskinteknik eller industriell ekonomi")
    if (hp != null && /\b(fr[åa]n\s+ett|inom)\s+(ett\s+)?civilingenj|civilingenj[öo]rsprogram/i.test(frag)) {
      const groups = matchProgramGroups(frag).filter((g) => g !== 'civilingenj\u00f6r' && g !== 'civilingenj\u00f6rsprogram');
      rules.push(makeRule({
        requirement_type: 'completed_hp_in_program_group',
        required_hp: hp,
        allowed_program_groups: groups.length ? groups : null,
        original_text: frag,
        source_fragment: frag,
        reason: `${hp} HP fr\u00e5n programgrupp: ${groups.join(', ') || 'civilingenj\u00f6rsprogram'}`,
        confidence: groups.length ? 0.7 : 0.45,
        manual_review: !groups.length,
      }));
      continue;
    }

    // C/G: "X hp i <course / area>" — try course match first, then group/subject
    if (hp != null && /\b(hp|h\u00f6gskolepo[äa]ng)\b.*\b(i|in[oa]m)\b/i.test(frag)) {
      const found = findCourse(frag, catalog);
      if (found) {
        rules.push(makeRule({
          requirement_type: 'completed_hp_in_course',
          required_course_code: found.course_code,
          required_hp: hp,
          original_text: frag,
          source_fragment: frag,
          reason: `${hp} HP avklarade i ${found.course_code} ${found.course_name}`,
          confidence: 0.8,
        }));
        continue;
      }
      const subject = matchSubject(frag);
      if (subject) {
        rules.push(makeRule({
          requirement_type: 'completed_hp_in_subject',
          required_subject_area: subject,
          required_hp: hp,
          original_text: frag,
          source_fragment: frag,
          reason: `${hp} HP inom huvudomr\u00e5de ${subject}`,
          confidence: 0.7,
        }));
        continue;
      }
      // Course group / area fallback
      const groupName = extractGroupName(frag);
      if (groupName) {
        rules.push(makeRule({
          requirement_type: 'completed_hp_in_course_group',
          required_hp: hp,
          course_group_name: groupName,
          original_text: frag,
          source_fragment: frag,
          reason: `${hp} HP inom kursgrupp "${groupName}"`,
          confidence: 0.5,
          manual_review: true,
        }));
        continue;
      }
    }

    // D: total HP — bare "N hp avklarade", "N avklarade högskolepoäng", "totalt N hp"
    if (hp != null && /\b(avklarade?|totalt|sammanlagt)\b/i.test(frag)
      && !/\b(i|in[oa]m|fr[åa]n)\b/i.test(stripHpClause(frag))) {
      rules.push(makeRule({
        requirement_type: 'completed_total_hp',
        required_hp: hp,
        original_text: frag,
        source_fragment: frag,
        reason: `${hp} HP totalt avklarade`,
        confidence: 0.9,
      }));
      continue;
    }

    // B: attended / genomgången / påbörjad course
    if (/\b(genomg[åa]ng(en|na)|p[åa]b[öo]rja(d|de|t))\b/i.test(frag)) {
      const found = findCourse(frag, catalog);
      if (found) {
        const ruleHp = hp;
        if (ruleHp != null && /minst\s+\d/i.test(frag)) {
          rules.push(makeRule({
            requirement_type: 'completed_hp_in_course',
            required_course_code: found.course_code,
            required_hp: ruleHp,
            original_text: frag,
            source_fragment: frag,
            reason: `Minst ${ruleHp} HP genomg\u00e5ngna i ${found.course_code}`,
            confidence: 0.65,
            manual_review: true,
          }));
        } else {
          rules.push(makeRule({
            requirement_type: 'attended_course',
            required_course_code: found.course_code,
            original_text: frag,
            source_fragment: frag,
            reason: `Genomg\u00e5ngen/p\u00e5b\u00f6rjad ${found.course_code} ${found.course_name}`,
            confidence: 0.85,
          }));
        }
        continue;
      }
      unmatched.push(frag);
      continue;
    }

    // A: completed course — "avklarad(e) kurs(er) X" or course code present
    if (/\bavklarad/i.test(frag) || COURSE_CODE_RE.test(frag)) {
      COURSE_CODE_RE.lastIndex = 0;
      const codes = Array.from(frag.matchAll(COURSE_CODE_RE)).map((m) => m[0].toUpperCase());
      if (codes.length > 0) {
        for (const code of codes) {
          const found = catalog.find((c) => c.course_code.toUpperCase() === code);
          if (!found) {
            unmatched.push(`${code} (saknas i katalog): ${frag}`);
            continue;
          }
          rules.push(makeRule({
            requirement_type: 'completed_course',
            required_course_code: found.course_code,
            original_text: frag,
            source_fragment: frag,
            reason: `Avklarad ${found.course_code} ${found.course_name}`,
            confidence: 0.85,
          }));
        }
        continue;
      }
      // No code — try fuzzy name
      const found = findCourse(frag, catalog);
      if (found) {
        rules.push(makeRule({
          requirement_type: 'completed_course',
          required_course_code: found.course_code,
          original_text: frag,
          source_fragment: frag,
          reason: `Avklarad ${found.course_code} ${found.course_name} (namnmatch)`,
          confidence: 0.55,
          manual_review: true,
        }));
        continue;
      }
    }

    // I: ambiguous "eller motsvarande", english, gymnasie → custom_text manual
    if (/(eller motsvarande|engelska|gymnasi|professionell|yrkeserfarenhet)/i.test(frag)) {
      rules.push(makeRule({
        requirement_type: 'custom_text',
        original_text: frag,
        source_fragment: frag,
        reason: 'Tvetydigt/alternativ formulering — kr\u00e4ver manuell granskning',
        confidence: 0.3,
        manual_review: true,
      }));
      continue;
    }

    unmatched.push(frag);
  }

  // Any unmatched fragment becomes a custom_text manual_review rule so the
  // student sees the original information even when we cannot parse it.
  for (const u of unmatched) {
    rules.push(makeRule({
      requirement_type: 'custom_text',
      original_text: u,
      source_fragment: u,
      reason: 'Otolkad text \u2014 sparas som informativ regel',
      confidence: 0.2,
      manual_review: true,
    }));
  }

  return { rules, unmatched };
}

function extractGroupName(s: string): string | null {
  // "minst 6 hp CAD" / "minst 2,5 hp strategisk hållbar utveckling"
  const m = s.match(/\d+(?:[.,]\d+)?\s*hp\s+(?:i\s+)?([a-z\u00e0-\u017f][a-z\u00e0-\u017f\s\-,]{2,40}?)(?:\.|,|;|$|\s+ska\b|\s+ing[åa]r\b)/i);
  if (!m) return null;
  const name = clean(m[1]);
  if (name.length < 3) return null;
  return name;
}

function stripHpClause(s: string): string {
  return s.replace(HP_RE, '');
}

function makeRule(p: Partial<ParseRuleProposal> & {
  requirement_type: RequirementType;
  source_fragment: string;
  reason: string;
  confidence: number;
}): ParseRuleProposal {
  return {
    requirement_type: p.requirement_type,
    required_course_code: p.required_course_code ?? null,
    required_hp: p.required_hp ?? null,
    required_subject_area: p.required_subject_area ?? null,
    original_text: p.original_text ?? null,
    logic_group: p.logic_group ?? null,
    required_level: p.required_level ?? null,
    course_group_name: p.course_group_name ?? null,
    allowed_program_groups: p.allowed_program_groups ?? null,
    allowed_course_codes: p.allowed_course_codes ?? null,
    manual_review: p.manual_review ?? (p.confidence < 0.6),
    group_operator: p.group_operator ?? null,
    source_fragment: p.source_fragment,
    reason: p.reason,
    confidence: p.confidence,
  };
}

/** Stable key matching jsonImport's prereqKey shape, used for dedupe. */
export function proposalKey(
  targetCourseId: string,
  p: ParseRuleProposal,
  codeToId: Map<string, string>,
): string {
  const requiredId = p.required_course_code ? (codeToId.get(p.required_course_code.toUpperCase()) ?? '') : '';
  return [
    targetCourseId,
    p.requirement_type,
    requiredId,
    (p.required_subject_area ?? '').toLowerCase(),
    p.required_hp ?? '',
    (p.original_text ?? '').toLowerCase(),
  ].join('|');
}
