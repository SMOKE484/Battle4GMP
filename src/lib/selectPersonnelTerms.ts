import { PERSONNEL_TERMS, PersonnelTerm } from './personnelTerms';

export const DEFAULT_PERSONNEL_COUNT = 4;

export function selectPersonnelTerms(
  count: number = DEFAULT_PERSONNEL_COUNT,
  rng: () => number = Math.random
): PersonnelTerm[] {
  const pool = [...PERSONNEL_TERMS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
