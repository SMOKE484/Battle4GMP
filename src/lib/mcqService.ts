import { generateClues, generateDefinitions, generateScenarios, DeepSeekError } from './deepseek';
import { ALCOA_PLUS_TERMS } from './crosswordTerms';
import { PERSONNEL_TERMS } from './personnelTerms';
import { STERILITY_TERMS } from './sterilityTerms';
import { QuestionTopic } from '../types/database';

export interface McqQuestion {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

interface TermPromptEntry {
  term: string;
  prompt: string;
}

function shuffledCopy<T>(items: T[], rng: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

// Each topic's pool must have at least 4 terms (1 correct + 3 distractors) —
// true today for all three (22+/12/31+ terms), same implicit floor the level
// screens already rely on for their own term-selection counts.
function poolForTopic(topic: QuestionTopic): TermPromptEntry[] {
  switch (topic) {
    case 'data_integrity':
      return ALCOA_PLUS_TERMS.map((t) => ({ term: t.term, prompt: t.fallbackClue }));
    case 'personnel':
      return PERSONNEL_TERMS.map((t) => ({ term: t.term, prompt: t.fallbackDefinition }));
    case 'sterility':
      return STERILITY_TERMS.map((t) => ({ term: t.term, prompt: t.fallbackClue }));
  }
}

// Delegates to the same three grounded, validated DeepSeek generators the solo
// levels already use (generateClues/generateDefinitions/generateScenarios) rather
// than adding a fourth near-identical prompt-builder+validator — each already
// returns fresh wording grounded in its topic's term pool, keyed by term.
async function generateEntriesForTopic(topic: QuestionTopic, terms: string[]): Promise<TermPromptEntry[]> {
  if (topic === 'data_integrity') {
    const clues = await generateClues(terms);
    return clues.map((c) => ({ term: c.term, prompt: c.clue }));
  }
  if (topic === 'personnel') {
    const definitions = await generateDefinitions(terms);
    return definitions.map((d) => ({ term: d.term, prompt: d.definition }));
  }
  const scenarios = await generateScenarios(terms);
  return scenarios.map((s) => ({ term: s.term, prompt: s.clue }));
}

function buildQuestions(entries: TermPromptEntry[], pool: TermPromptEntry[], rng: () => number): McqQuestion[] {
  return entries.map((entry) => {
    const distractors = shuffledCopy(
      pool.filter((p) => p.term !== entry.term),
      rng
    ).slice(0, 3);
    const options = shuffledCopy([entry.term, ...distractors.map((d) => d.term)], rng) as [string, string, string, string];
    const correctIndex = options.indexOf(entry.term) as 0 | 1 | 2 | 3;
    return { prompt: entry.prompt, options, correctIndex };
  });
}

/**
 * DeepSeek (fresh wording, grounded in the topic's term pool) → static
 * notes-sourced fallback, same two-tier shape as the solo levels' fallback
 * chains minus the cache tiers — a live room's question set is generated once
 * and stored directly on `challenge_rooms.question_set`, so there's nothing
 * useful to cache separately.
 */
export async function generateMcqQuestions(
  topic: QuestionTopic,
  count: number,
  rng: () => number = Math.random
): Promise<McqQuestion[]> {
  const pool = poolForTopic(topic);
  const picked = shuffledCopy(pool, rng).slice(0, Math.min(count, pool.length));
  const pickedTermNames = picked.map((p) => p.term);

  try {
    const generated = await generateEntriesForTopic(topic, pickedTermNames);
    return buildQuestions(generated, pool, rng);
  } catch (err) {
    if (!(err instanceof DeepSeekError)) throw err; // an unexpected bug, not a fallback-worthy failure
  }

  return buildQuestions(picked, pool, rng);
}
