import { STERILITY_TERMS, SterilityTerm } from './sterilityTerms';

export const DEFAULT_STERILITY_COUNT = 6;

export function selectSterilityTerms(
  count: number = DEFAULT_STERILITY_COUNT,
  rng: () => number = Math.random
): SterilityTerm[] {
  const pool = [...STERILITY_TERMS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
