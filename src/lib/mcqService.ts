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

const ALL_TOPICS: QuestionTopic[] = ['data_integrity', 'personnel', 'sterility'];

/**
 * Splits `count` as evenly as possible across ALL_TOPICS. Which topic(s) get the
 * extra +1 (when count doesn't divide evenly) is randomized via rng rather than
 * always landing on the same topic, so a Rapid Round's mix isn't subtly biased
 * run after run.
 */
function splitCountAcrossTopics(count: number, rng: () => number): Map<QuestionTopic, number> {
  const base = Math.floor(count / ALL_TOPICS.length);
  const remainder = count % ALL_TOPICS.length;
  const extraTopics = new Set(shuffledCopy(ALL_TOPICS, rng).slice(0, remainder));

  const counts = new Map<QuestionTopic, number>();
  for (const topic of ALL_TOPICS) {
    counts.set(topic, base + (extraTopics.has(topic) ? 1 : 0));
  }
  return counts;
}

/**
 * Rapid Round: pulls questions from all 3 topics in one set instead of one.
 * Each topic is generated (DeepSeek → static fallback) fully independently, so
 * one topic's DeepSeek hiccup doesn't wipe out the other two's fresh wording —
 * same reasoning as generateMcqQuestions' own per-call fallback, just applied
 * 3 times instead of once. Distractors for a given question are always drawn
 * from that question's own topic pool (matching generateMcqQuestions), so
 * cross-topic answer options never make a question trivially guessable by
 * category. Final question order is shuffled so topics aren't grouped together.
 */
export async function generateMixedMcqQuestions(count: number, rng: () => number = Math.random): Promise<McqQuestion[]> {
  const perTopicCount = splitCountAcrossTopics(count, rng);

  const perTopicQuestions = await Promise.all(
    ALL_TOPICS.map(async (topic) => {
      const topicCount = perTopicCount.get(topic) ?? 0;
      if (topicCount === 0) return [];

      const pool = poolForTopic(topic);
      const picked = shuffledCopy(pool, rng).slice(0, Math.min(topicCount, pool.length));
      const pickedTermNames = picked.map((p) => p.term);

      try {
        const generated = await generateEntriesForTopic(topic, pickedTermNames);
        return buildQuestions(generated, pool, rng);
      } catch (err) {
        if (!(err instanceof DeepSeekError)) throw err;
      }

      return buildQuestions(picked, pool, rng);
    })
  );

  return shuffledCopy(perTopicQuestions.flat(), rng);
}
