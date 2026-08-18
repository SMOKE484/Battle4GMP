import { PlacedWord } from './crosswordLayout';

function cellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

function isWordFullySolved(word: PlacedWord, locked: Set<string>): boolean {
  for (let k = 0; k < word.word.length; k++) {
    const r = word.direction === 'across' ? word.row : word.row + k;
    const c = word.direction === 'across' ? word.col + k : word.col;
    if (!locked.has(cellKey(r, c))) return false;
  }
  return true;
}

/**
 * Words that became fully solved going from `previouslyLocked` to `nowLocked`.
 * Used to fire a one-shot success cue exactly once per completed word, not
 * once per correct letter — a locked cell can belong to two words at an
 * intersection, so both are checked independently.
 */
export function newlyCompletedWords(
  words: PlacedWord[],
  previouslyLocked: Set<string>,
  nowLocked: Set<string>
): PlacedWord[] {
  return words.filter((w) => !isWordFullySolved(w, previouslyLocked) && isWordFullySolved(w, nowLocked));
}
