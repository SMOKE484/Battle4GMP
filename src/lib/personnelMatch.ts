export interface PersonnelPair {
  defId: string;
  termId: string;
  term: string;
  definition: string;
}

export type MatchState = Record<string, string | null>;

export function isMatchCorrect(defId: string, matches: MatchState, pairs: PersonnelPair[]): boolean {
  const placed = matches[defId];
  if (!placed) return false;
  const pair = pairs.find((p) => p.defId === defId);
  return !!pair && pair.termId === placed;
}

// A chip's location is never stored directly — it's always derived from `matches`,
// so a chip is "available" (still in the pool) iff it isn't placed on any card.
export function availableTermIds(pairs: PersonnelPair[], matches: MatchState): string[] {
  const placed = new Set(Object.values(matches).filter((v): v is string => v !== null));
  return pairs.map((p) => p.termId).filter((id) => !placed.has(id));
}

export function allMatched(pairs: PersonnelPair[], matches: MatchState): boolean {
  return pairs.every((p) => matches[p.defId] != null);
}

export function allCorrect(pairs: PersonnelPair[], matches: MatchState): boolean {
  return pairs.every((p) => isMatchCorrect(p.defId, matches, pairs));
}

/**
 * Reducer for a chip landing on a card (or back in the pool, cardId === null).
 * Clears any prior placement of the same chip first, so bump/replace/move-between-
 * cards/return-to-pool all fall out of this one function with no special cases.
 */
export function applyDrop(matches: MatchState, termId: string, cardId: string | null): MatchState {
  const next: MatchState = { ...matches };
  for (const key of Object.keys(next)) {
    if (next[key] === termId) next[key] = null;
  }
  if (cardId) next[cardId] = termId;
  return next;
}

// Used by the USE CLUE action to deterministically pick a card to auto-solve.
export function firstUnsolvedDefId(pairs: PersonnelPair[], matches: MatchState): string | null {
  const pair = pairs.find((p) => !isMatchCorrect(p.defId, matches, pairs));
  return pair?.defId ?? null;
}
