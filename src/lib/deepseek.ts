import { ALCOA_PLUS_TERMS } from './crosswordTerms';
import { PERSONNEL_TERMS } from './personnelTerms';
import { STERILITY_TERMS } from './sterilityTerms';

// Read lazily (not as module-level consts) so tests can set process.env per-case
// without needing module-registry resets.
function getApiUrl(): string {
  return process.env.EXPO_PUBLIC_DEEPSEEK_API_URL ?? 'https://api.deepseek.com';
}
function getApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY;
}

export type DeepSeekErrorKind = 'network' | 'timeout' | 'invalid_response' | 'api_error';

export class DeepSeekError extends Error {
  kind: DeepSeekErrorKind;
  constructor(kind: DeepSeekErrorKind, message: string) {
    super(message);
    this.name = 'DeepSeekError';
    this.kind = kind;
  }
}

export interface ClueEntry {
  term: string;
  clue: string;
}

interface DeepSeekChatResponse {
  choices?: { message?: { content?: string } }[];
}

const DEFAULT_TIMEOUT_MS = 10000;

function buildCluesSystemPrompt(terms: string[]): string {
  // Ground each term in its authoritative ALCOA+ definition (sourced from
  // PIC/S PI 041-1 and WHO's draft data integrity guideline) so generated
  // wording stays anchored to real regulatory meaning rather than general
  // LLM knowledge of the acronym.
  const definitions = ALCOA_PLUS_TERMS.filter((t) => terms.includes(t.term))
    .map((t) => `- ${t.term}: ${t.fallbackClue}`)
    .join('\n');

  return [
    'You write crossword clues for a pharmaceutical Good Manufacturing Practice (GMP) education game.',
    'You will be given a fixed list of terms from the ALCOA+ data integrity principles, each with its authoritative regulatory definition.',
    'For each term, write exactly one short, plain-language clue (max 15 words) that conveys the meaning of its definition below, in your own words — do not copy the definition verbatim.',
    'Never use the term itself, or an obvious variant of it, inside the clue text.',
    'Do not invent, rename, add, or omit any term — return exactly the terms you were given, in the same casing.',
    `Terms and definitions:\n${definitions}`,
    'Respond with strict JSON only, in this exact shape: {"clues":[{"term":"TERM","clue":"..."}, ...]}',
  ].join('\n');
}

/** Pure validator: checks shape, exact term-set match, non-empty/length-bounded clues, and that no clue leaks its own answer. */
export function validateClueResponse(raw: unknown, expectedTerms: string[]): ClueEntry[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const clues = (raw as { clues?: unknown }).clues;
  if (!Array.isArray(clues)) return null;

  const expected = new Set(expectedTerms.map((t) => t.toUpperCase()));
  const seen = new Set<string>();
  const result: ClueEntry[] = [];

  for (const entry of clues) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { term, clue } = entry as { term?: unknown; clue?: unknown };
    if (typeof term !== 'string' || typeof clue !== 'string') return null;

    const normalizedTerm = term.trim().toUpperCase();
    const trimmedClue = clue.trim();
    if (!expected.has(normalizedTerm)) return null;
    if (seen.has(normalizedTerm)) return null;
    if (trimmedClue.length === 0 || trimmedClue.length > 200) return null;
    if (trimmedClue.toUpperCase().includes(normalizedTerm)) return null;

    seen.add(normalizedTerm);
    result.push({ term: normalizedTerm, clue: trimmedClue });
  }

  if (seen.size !== expected.size) return null;
  return result;
}

async function callDeepSeek(messages: { role: string; content: string }[], timeoutMs: number): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new DeepSeekError('api_error', 'Missing EXPO_PUBLIC_DEEPSEEK_API_KEY.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new DeepSeekError('timeout', 'DeepSeek request timed out.');
    }
    throw new DeepSeekError(
      'network',
      `DeepSeek request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new DeepSeekError('api_error', `DeepSeek API returned ${response.status}: ${body.slice(0, 200)}`);
  }

  let json: DeepSeekChatResponse;
  try {
    json = (await response.json()) as DeepSeekChatResponse;
  } catch {
    throw new DeepSeekError('invalid_response', 'DeepSeek response was not valid JSON.');
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new DeepSeekError('invalid_response', 'DeepSeek response was missing message content.');
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new DeepSeekError('invalid_response', 'DeepSeek message content was not valid JSON.');
  }
}

export async function generateClues(terms: string[], opts: { timeoutMs?: number } = {}): Promise<ClueEntry[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const raw = await callDeepSeek(
    [
      { role: 'system', content: buildCluesSystemPrompt(terms) },
      { role: 'user', content: 'Generate the clues now.' },
    ],
    timeoutMs
  );
  const validated = validateClueResponse(raw, terms);
  if (!validated) {
    throw new DeepSeekError('invalid_response', 'DeepSeek clue response failed validation.');
  }
  return validated;
}

export interface DefinitionEntry {
  term: string;
  definition: string;
}

function buildDefinitionsSystemPrompt(terms: string[]): string {
  // Same grounding approach as buildCluesSystemPrompt: anchor generated wording to
  // the authoritative PIC/S Annex 1 §7 (Personnel) paraphrase already on file for
  // each term, rather than general LLM knowledge of GMP.
  const definitions = PERSONNEL_TERMS.filter((t) => terms.includes(t.term))
    .map((t) => `- ${t.term}: ${t.fallbackDefinition}`)
    .join('\n');

  return [
    'You write short responsibility/requirement descriptions for a pharmaceutical Good Manufacturing Practice (GMP) education game about cleanroom personnel (PIC/S Annex 1, Section 7).',
    'You will be given a fixed list of personnel-related terms, each with its authoritative regulatory definition.',
    'For each term, write exactly one short, plain-language definition (max 25 words) that conveys the meaning of its definition below, in your own words — do not copy the definition verbatim.',
    'Never use the term itself, or an obvious variant of it, inside the definition text.',
    'Do not invent, rename, add, or omit any term — return exactly the terms you were given, in the same casing.',
    `Terms and definitions:\n${definitions}`,
    'Respond with strict JSON only, in this exact shape: {"definitions":[{"term":"TERM","definition":"..."}, ...]}',
  ].join('\n');
}

/** Pure validator: checks shape, exact term-set match, non-empty/length-bounded definitions, and that no definition leaks its own answer. */
export function validateDefinitionResponse(raw: unknown, expectedTerms: string[]): DefinitionEntry[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const definitions = (raw as { definitions?: unknown }).definitions;
  if (!Array.isArray(definitions)) return null;

  const expected = new Set(expectedTerms.map((t) => t.toUpperCase()));
  const seen = new Set<string>();
  const result: DefinitionEntry[] = [];

  for (const entry of definitions) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { term, definition } = entry as { term?: unknown; definition?: unknown };
    if (typeof term !== 'string' || typeof definition !== 'string') return null;

    const normalizedTerm = term.trim().toUpperCase();
    const trimmedDefinition = definition.trim();
    if (!expected.has(normalizedTerm)) return null;
    if (seen.has(normalizedTerm)) return null;
    if (trimmedDefinition.length === 0 || trimmedDefinition.length > 300) return null;
    if (trimmedDefinition.toUpperCase().includes(normalizedTerm)) return null;

    seen.add(normalizedTerm);
    result.push({ term: normalizedTerm, definition: trimmedDefinition });
  }

  if (seen.size !== expected.size) return null;
  return result;
}

export async function generateDefinitions(terms: string[], opts: { timeoutMs?: number } = {}): Promise<DefinitionEntry[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const raw = await callDeepSeek(
    [
      { role: 'system', content: buildDefinitionsSystemPrompt(terms) },
      { role: 'user', content: 'Generate the definitions now.' },
    ],
    timeoutMs
  );
  const validated = validateDefinitionResponse(raw, terms);
  if (!validated) {
    throw new DeepSeekError('invalid_response', 'DeepSeek definition response failed validation.');
  }
  return validated;
}

function buildScenariosSystemPrompt(terms: string[]): string {
  // Same grounding approach as buildCluesSystemPrompt/buildDefinitionsSystemPrompt:
  // anchor generated wording to the authoritative sterility fallbackClue already on
  // file for each term, rather than general LLM knowledge of GMP.
  const definitions = STERILITY_TERMS.filter((t) => terms.includes(t.term))
    .map((t) => `- ${t.term}: ${t.fallbackClue}`)
    .join('\n');

  return [
    'You write word-search scenario clues for a pharmaceutical Good Manufacturing Practice (GMP) education game about sterile product manufacture (EU/PIC/S Annex 1).',
    'You will be given a fixed list of sterility-related terms, each with its authoritative regulatory definition.',
    'For each term, write exactly one short, plain-language scenario clue (max 20 words) that conveys the meaning of its definition below, in your own words — do not copy the definition verbatim.',
    'Never use the term itself, or an obvious variant of it, inside the clue text.',
    'Do not invent, rename, add, or omit any term — return exactly the terms you were given, in the same casing.',
    `Terms and definitions:\n${definitions}`,
    'Respond with strict JSON only, in this exact shape: {"scenarios":[{"term":"TERM","clue":"..."}, ...]}',
  ].join('\n');
}

/** Pure validator: checks shape, exact term-set match, non-empty/length-bounded clues, and that no clue leaks its own answer. */
export function validateScenarioResponse(raw: unknown, expectedTerms: string[]): ClueEntry[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const scenarios = (raw as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(scenarios)) return null;

  const expected = new Set(expectedTerms.map((t) => t.toUpperCase()));
  const seen = new Set<string>();
  const result: ClueEntry[] = [];

  for (const entry of scenarios) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { term, clue } = entry as { term?: unknown; clue?: unknown };
    if (typeof term !== 'string' || typeof clue !== 'string') return null;

    const normalizedTerm = term.trim().toUpperCase();
    const trimmedClue = clue.trim();
    if (!expected.has(normalizedTerm)) return null;
    if (seen.has(normalizedTerm)) return null;
    if (trimmedClue.length === 0 || trimmedClue.length > 250) return null;
    if (trimmedClue.toUpperCase().includes(normalizedTerm)) return null;

    seen.add(normalizedTerm);
    result.push({ term: normalizedTerm, clue: trimmedClue });
  }

  if (seen.size !== expected.size) return null;
  return result;
}

export async function generateScenarios(terms: string[], opts: { timeoutMs?: number } = {}): Promise<ClueEntry[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const raw = await callDeepSeek(
    [
      { role: 'system', content: buildScenariosSystemPrompt(terms) },
      { role: 'user', content: 'Generate the scenarios now.' },
    ],
    timeoutMs
  );
  const validated = validateScenarioResponse(raw, terms);
  if (!validated) {
    throw new DeepSeekError('invalid_response', 'DeepSeek scenario response failed validation.');
  }
  return validated;
}

/**
 * On-demand plain-language hint explaining why `term` answers `clue`.
 * Not wired to Level 1's UI (its clue-token action is a deterministic local
 * letter-reveal) — kept as a service capability for later levels/affordances,
 * per the original spec listing hints as part of the DeepSeek service.
 */
export async function getHint(term: string, clue: string, opts: { timeoutMs?: number } = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const raw = await callDeepSeek(
    [
      {
        role: 'system',
        content: [
          'You explain GMP (Good Manufacturing Practice) data-integrity concepts to pharmacy students in plain, encouraging language.',
          'You will be given a crossword answer term and its clue. Explain in 1-2 short sentences why that term is the correct answer, without being condescending.',
          'Respond with strict JSON only, in this exact shape: {"hint":"..."}',
        ].join('\n'),
      },
      { role: 'user', content: `Term: ${term}\nClue: ${clue}` },
    ],
    timeoutMs
  );

  if (typeof raw !== 'object' || raw === null || typeof (raw as { hint?: unknown }).hint !== 'string') {
    throw new DeepSeekError('invalid_response', 'DeepSeek hint response failed validation.');
  }
  const hint = (raw as { hint: string }).hint.trim();
  if (hint.length === 0) {
    throw new DeepSeekError('invalid_response', 'DeepSeek returned an empty hint.');
  }
  return hint;
}
