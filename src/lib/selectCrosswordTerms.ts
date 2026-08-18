import { ALCOA_PLUS_TERMS, AlcoaTerm } from './crosswordTerms';

export const DEFAULT_TERM_COUNT = 6;

export function selectCrosswordTerms(
  count: number = DEFAULT_TERM_COUNT,
  rng: () => number = Math.random
): AlcoaTerm[] {
  const pool = [...ALCOA_PLUS_TERMS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
