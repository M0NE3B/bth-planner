/**
 * Parser that converts Swedish BTH prerequisite texts into structured
 * `PrerequisiteInput` rules. The goal is to keep `custom_text`/`manual_review`
 * for *only* the fragments we truly cannot map — everything else should be
 * structured so the student app can evaluate risk automatically.
 *
 * The parser is intentionally conservative:
 *   - course-name lookups must be unique against the supplied catalog,
 *   - ambiguous text becomes a `completed_hp_in_course_group` (still useful as
 *     informational) rather than `custom_text`,
 *   - completely unparseable fragments become `custom_text` with
 *     `manual_review: true` and the original text preserved.
 */
import type { PrerequisiteInput } from '../admin';
import type { CatalogCourse } from '../catalog';

export interface ParseResult {
  rules: PrerequisiteInput[];
  /** Fragments we could not structure — joined back as a custom_text. */
  remainingText: string;
  /** Soft warnings for the admin preview. */
  warnings: string[];
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const COURSE_CODE_RE = /\b([A-Z]{2}\d{3,4})\b/g;

/** Build a lookup index over course catalog: normalized name → id, code → id. */
export function buildCourseIndex(catalog: CatalogCourse[]) {
  const byCode = new Map<string, CatalogCourse>();
  const byName = new Map<string, CatalogCourse>();
  const nameKeys: string[] = [];
  for (const c of catalog) {
    byCode.set(c.course_code.toUpperCase(), c);
    const key = norm(c.course_name);
    if (key) {
      // skip duplicate-name collisions (we only want unique matches)
      if (byName.has(key)) {
        byName.set(key, { ...byName.get(key)!, course_code: '__AMBIGUOUS__' });
      } else {
        byName.set(key, c);
        nameKeys.push(key);
      }
    }
  }
  return { byCode, byName, nameKeys };
}

export type CourseIndex = ReturnType<typeof buildCourseIndex>;

/** Try to resolve a free-text course phrase to a unique catalog course. */
function resolveCourseByName(phrase: string, idx: CourseIndex): CatalogCourse | null {
  const key = norm(phrase);
  if (!key) return null;
  const exact = idx.byName.get(key);
  if (exact && exact.course_code !== '__AMBIGUOUS__') return exact;
  // Try longest prefix/contains match — must be unique.
  const candidates = idx.nameKeys.filter((k) => k.startsWith(key) || k.includes(key));
  if (candidates.length === 1) {
    const c = idx.byName.get(candidates[0]);
    return c && c.course_code !== '__AMBIGUOUS__' ? c : null;
  }
  return null;
}

const PROGRAM_GROUP_WORDS = [
  'maskinteknik',
  'industriell ekonomi',
  'datavetenskap',
  'mjukvaruteknik',
  'spelteknik',
  'spelprogrammering',
  'ai',
  'artificiell intelligens',
  'elektroteknik',
  'marin teknik',
  'planeringsarkitektur',
  'datasäkerhet',
];

const SUBJECT_KEYWORDS = [
  'matematik',
  'datavetenskap',
  'maskinteknik',
  'fysik',
  'programvaruteknik',
  'industriell ekonomi och management',
  'industriell ekonomi',
  'elektroteknik',
  'hållbar utveckling',
];

/** Convert a comma/`/och`/`samt`-separated list of phrases to an array. */
function splitList(s: string): string[] {
  return s
    .split(/,| och | samt | eller | och\/eller |\/| & /i)
    .map((x) => x.trim())
    .filter(Boolean);
}

interface ParseFragmentOut {
  rules: PrerequisiteInput[];
  consumed: boolean;
}

function parseFragment(fragment: string, idx: CourseIndex): ParseFragmentOut {
  const rules: PrerequisiteInput[] = [];
  const original = fragment.trim();
  if (!original) return { rules, consumed: true };
  const lower = original.toLowerCase();

  // Skip noise fragments that are not actual requirements.
  if (/^(\s|för|och|samt|dessutom|kursen|krävs|krav|i de\s+\d+\s+hp)$/i.test(original)) {
    return { rules, consumed: true };
  }

  // ----- 1. Explicit course codes -----
  const codes = Array.from(original.matchAll(COURSE_CODE_RE)).map((m) => m[1].toUpperCase());

  // ----- 2. Completed HP at advanced/foundation level -----
  const lvl = lower.match(/minst\s+([\d,.]+)\s*hp\s+p[åa]\s+(avancerad|grundl[äa]ggande)\s+niv[åa]/);
  if (lvl) {
    rules.push({
      requirement_type: 'completed_hp_at_level',
      required_hp: parseFloat(lvl[1].replace(',', '.')),
      required_level: lvl[2].startsWith('avanc') ? 'advanced' : 'foundation',
      original_text: original,
    });
    return { rules, consumed: true };
  }

  // ----- 3. HP from a civil engineering program group -----
  const prog = lower.match(
    /(\d+)\s*hp\s+(?:ska\s+vara\s+)?fr[åa]n\s+ett\s+civilingenj[öo]rsprogram\s+i\s+([^.;]+)/,
  );
  if (prog) {
    const groups = splitList(prog[2])
      .map((g) => g.trim())
      .filter((g) => PROGRAM_GROUP_WORDS.some((w) => g.includes(w) || w.includes(g)) || g.length > 3);
    rules.push({
      requirement_type: 'completed_hp_in_program_group',
      required_hp: parseInt(prog[1], 10),
      allowed_program_groups: groups.length > 0 ? groups : null,
      manual_review: true,
      original_text: original,
    });
    return { rules, consumed: true };
  }

  // ----- 4. HP inom huvudområde X -----
  const subj = lower.match(/minst\s+(\d+)\s*hp\s+inom\s+(?:huvudomr[åa]det?\s+)?([\wåäö ]+)/);
  if (subj) {
    const wordList = subj[2].trim().split(/\s+/);
    // take the first 1-3 words as subject candidate
    const candidate = wordList.slice(0, 3).join(' ');
    const hit = SUBJECT_KEYWORDS.find((k) => candidate.startsWith(k.split(' ')[0]));
    if (hit) {
      rules.push({
        requirement_type: 'completed_hp_in_subject',
        required_hp: parseInt(subj[1], 10),
        required_subject_area: hit.charAt(0).toUpperCase() + hit.slice(1),
        original_text: original,
      });
      return { rules, consumed: true };
    }
  }

  // ----- 5. Genomgången/påbörjad kurs (optionally with HP threshold) -----
  const att = lower.match(
    /genomg[åa]ng(?:en|na)\s+kurs(?:er)?\s*(?:om\s+minst\s+([\d,.]+)\s*hp\s+i\s+)?([^,;.]+)/,
  );
  if (att) {
    const hp = att[1] ? parseFloat(att[1].replace(',', '.')) : null;
    // try each item in the list
    const phrases = splitList(att[2]);
    let matchedAny = false;
    for (const phrase of phrases) {
      const c =
        codes.find((code) => idx.byCode.has(code))
          ? idx.byCode.get(codes.find((code) => idx.byCode.has(code))!)!
          : resolveCourseByName(phrase, idx);
      if (c) {
        matchedAny = true;
        rules.push({
          requirement_type: hp ? 'completed_hp_in_course' : 'attended_course',
          required_course_id: c.id,
          required_hp: hp ?? null,
          original_text: original,
        });
      }
    }
    if (matchedAny) return { rules, consumed: true };
    // fallback to course group when name is unresolved
    if (hp) {
      rules.push({
        requirement_type: 'completed_hp_in_course_group',
        required_hp: hp,
        course_group_name: phrases.join(' / '),
        manual_review: true,
        original_text: original,
      });
      return { rules, consumed: true };
    }
  }

  // ----- 6. Avklarad kurs (explicit code or name) -----
  const compCode = original.match(/avklarad(?:e|a)?\s+kurs(?:er)?\s+([^.;]+?)(?:\s+ska\s+vara\s+avklarade?)?[.;]?$/i);
  if (compCode || codes.length > 0) {
    const phrases = compCode ? splitList(compCode[1]) : codes;
    let matchedAny = false;
    for (const phrase of phrases) {
      const codeMatch = phrase.toUpperCase().match(/[A-Z]{2}\d{3,4}/)?.[0];
      const c = codeMatch ? idx.byCode.get(codeMatch) : resolveCourseByName(phrase, idx);
      if (c) {
        matchedAny = true;
        rules.push({
          requirement_type: 'completed_course',
          required_course_id: c.id,
          original_text: original,
        });
      }
    }
    if (matchedAny) return { rules, consumed: true };
  }

  // ----- 7. Minst X HP i <course name>  (completed_hp_in_course / group) -----
  const hpIn = lower.match(/minst\s+([\d,.]+)\s*hp\s+(?:i|av)\s+([^,.;]+)/);
  if (hpIn) {
    const hp = parseFloat(hpIn[1].replace(',', '.'));
    const phrase = hpIn[2].trim();
    const c = resolveCourseByName(phrase, idx);
    if (c) {
      rules.push({
        requirement_type: 'completed_hp_in_course',
        required_course_id: c.id,
        required_hp: hp,
        original_text: original,
      });
      return { rules, consumed: true };
    }
    // fallback as course group
    rules.push({
      requirement_type: 'completed_hp_in_course_group',
      required_hp: hp,
      course_group_name: phrase,
      manual_review: true,
      original_text: original,
    });
    return { rules, consumed: true };
  }

  // ----- 8. Total HP avklarade (no course context) -----
  const total = lower.match(/(\d+)\s*(?:avklarade\s+)?(?:h[öo]gskolepo[äa]ng|hp)(?:\s+totalt|\s+avklarade)?/);
  if (total && !/\bi\b/.test(lower) && !/inom/.test(lower) && !codes.length) {
    rules.push({
      requirement_type: 'completed_total_hp',
      required_hp: parseInt(total[1], 10),
      original_text: original,
    });
    return { rules, consumed: true };
  }

  return { rules, consumed: false };
}

/** Split prerequisite text into fragments roughly corresponding to a single rule. */
function splitFragments(text: string): string[] {
  return text
    .replace(/\bDessutom\b/gi, '.')
    .replace(/\bsamt\b/gi, '.')
    .replace(/\bvarav\b/gi, '.')
    .split(/[.;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const AMBIGUOUS_MARKERS = [
  'eller motsvarande',
  'gymnasie',
  'engelska',
  'svenska',
  'professional',
  'yrkeserfarenhet',
  'arbetslivserfarenhet',
];

export function parsePrerequisiteText(
  text: string | null | undefined,
  idx: CourseIndex,
): ParseResult {
  const out: ParseResult = { rules: [], remainingText: '', warnings: [] };
  if (!text) return out;

  const fragments = splitFragments(text);
  const unconsumed: string[] = [];

  for (const frag of fragments) {
    const lower = frag.toLowerCase();
    const hasAmbiguous = AMBIGUOUS_MARKERS.some((m) => lower.includes(m));
    const { rules, consumed } = parseFragment(frag, idx);
    if (rules.length > 0) out.rules.push(...rules);
    if (!consumed || hasAmbiguous) {
      unconsumed.push(frag);
      if (hasAmbiguous) out.warnings.push(`Tvetydigt fragment: "${frag}"`);
    }
  }

  if (unconsumed.length > 0) {
    out.remainingText = unconsumed.join('. ');
    out.rules.push({
      requirement_type: 'custom_text',
      manual_review: true,
      original_text: out.remainingText,
    });
  }

  return out;
}

/** Signature used to dedupe rules so re-running the parser is idempotent. */
export function ruleSignature(r: PrerequisiteInput): string {
  return [
    r.requirement_type,
    r.required_course_id ?? '',
    r.required_hp ?? '',
    (r.required_subject_area ?? '').toLowerCase(),
    (r.required_level ?? '').toLowerCase(),
    (r.course_group_name ?? '').toLowerCase(),
    (r.allowed_program_groups ?? []).join('|').toLowerCase(),
    (r.allowed_course_codes ?? []).join('|').toUpperCase(),
    // Two custom_text rows with different original_text are still considered
    // distinct so admins can review/edit each separately.
    r.requirement_type === 'custom_text' ? (r.original_text ?? '').slice(0, 80) : '',
  ].join('§');
}
