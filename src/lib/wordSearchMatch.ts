/**
 * Free-form word search matching: the player drags across a straight run of grid
 * cells (in either direction — they may spot a word and trace it backwards), and we
 * check whether the resulting letter sequence spells any still-hidden term. No
 * pre-selected "target" term is required.
 */

function normalizedSequences(letters: string[]): [string, string] {
  const forward = letters.join('');
  const backward = letters.slice().reverse().join('');
  return [forward, backward];
}

/** True if the dragged letters spell `term`, read forwards or backwards. */
export function matchesTerm(letters: string[], term: string): boolean {
  const [forward, backward] = normalizedSequences(letters);
  return forward === term || backward === term;
}

/**
 * The still-unfound term (if any) that the dragged letters spell, forwards or
 * backwards. Returns null if the selection doesn't match anything hidden.
 */
export function matchTermFromSelection(letters: string[], terms: string[], found: Set<string>): string | null {
  if (letters.length === 0) return null;
  return terms.find((t) => !found.has(t) && matchesTerm(letters, t)) ?? null;
}

export function allFound(terms: string[], found: Set<string>): boolean {
  return terms.every((t) => found.has(t));
}

// Used by the USE CLUE action to deterministically pick a term to auto-solve.
export function firstUnfoundTerm(terms: string[], found: Set<string>): string | null {
  return terms.find((t) => !found.has(t)) ?? null;
}
