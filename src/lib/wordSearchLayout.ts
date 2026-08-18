export interface WordSearchWordInput {
  word: string;
  clue: string;
}

// Only 4 axis types, not 8 compass directions — a straight run of cells reads the
// same letters whichever end you start from, and selection matching already checks
// both directions (see wordSearchMatch.ts), so e.g. "right" and "left" are really
// the same underlying axis. 'diagonalDownRight' covers the ↘/↖ axis, 'diagonalDownLeft'
// covers the ↙/↗ axis.
export type WordSearchDirection = 'horizontal' | 'vertical' | 'diagonalDownRight' | 'diagonalDownLeft';

const ALL_DIRECTIONS: WordSearchDirection[] = ['horizontal', 'vertical', 'diagonalDownRight', 'diagonalDownLeft'];

/** The per-step (row, col) delta for a direction — always the "reading forward" sense
 * (e.g. horizontal always steps col+1, never col-1); the reverse reading is handled by
 * matching, not by a separate direction. */
export function directionDelta(direction: WordSearchDirection): { dRow: number; dCol: number } {
  switch (direction) {
    case 'horizontal':
      return { dRow: 0, dCol: 1 };
    case 'vertical':
      return { dRow: 1, dCol: 0 };
    case 'diagonalDownRight':
      return { dRow: 1, dCol: 1 };
    case 'diagonalDownLeft':
      return { dRow: 1, dCol: -1 };
  }
}

export interface PlacedWordSearchTerm {
  term: string;
  row: number;
  col: number;
  direction: WordSearchDirection;
}

export interface WordSearchGrid {
  rows: number;
  cols: number;
  cells: string[][];
  placements: PlacedWordSearchTerm[];
}

export class WordSearchLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordSearchLayoutError';
  }
}

function normalizeAndValidate(words: WordSearchWordInput[]): WordSearchWordInput[] {
  const seen = new Set<string>();
  const result: WordSearchWordInput[] = [];
  for (const entry of words) {
    const word = entry.word.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(word)) {
      throw new WordSearchLayoutError(`Invalid word "${entry.word}": must be one or more letters A-Z.`);
    }
    if (seen.has(word)) continue;
    seen.add(word);
    result.push({ word, clue: entry.clue });
  }
  return result;
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomLetter(rng: () => number): string {
  return String.fromCharCode(65 + Math.floor(rng() * 26));
}

const MAX_PLACEMENT_ATTEMPTS = 200;
const MAX_GRID_GROWTH_ATTEMPTS = 6;

interface LayoutAttempt {
  cells: (string | null)[][];
  placements: PlacedWordSearchTerm[];
}

/** Valid [min,max] start-coordinate range along one axis for a step of `delta`
 * (-1, 0, or 1), a word of `length`, and a grid of `size` — or null if the word
 * can't fit in this dimension at all (too long for this grid size). */
function boundsFor(delta: number, length: number, size: number): { min: number; max: number } | null {
  if (delta === 0) return { min: 0, max: size - 1 };
  if (delta === 1) {
    const max = size - length;
    return max >= 0 ? { min: 0, max } : null;
  }
  const min = length - 1;
  return min <= size - 1 ? { min, max: size - 1 } : null;
}

/** Tries to place every word (in the given order) into a `size`x`size` grid, picking a
 * random direction (of the 4 axis types) and in-bounds start position each attempt. A
 * word may cross an already-placed word only where the letters agree. Returns null if
 * any word can't be fit after MAX_PLACEMENT_ATTEMPTS. */
function attemptLayout(words: string[], size: number, rng: () => number): LayoutAttempt | null {
  const cells: (string | null)[][] = Array.from({ length: size }, () => new Array<string | null>(size).fill(null));
  const placements: PlacedWordSearchTerm[] = [];

  for (const word of words) {
    let placed = false;

    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      const direction = ALL_DIRECTIONS[Math.floor(rng() * ALL_DIRECTIONS.length)];
      const { dRow, dCol } = directionDelta(direction);

      const rowBounds = boundsFor(dRow, word.length, size);
      const colBounds = boundsFor(dCol, word.length, size);
      if (!rowBounds || !colBounds) continue;

      const row = rowBounds.min + Math.floor(rng() * (rowBounds.max - rowBounds.min + 1));
      const col = colBounds.min + Math.floor(rng() * (colBounds.max - colBounds.min + 1));

      let fits = true;
      for (let k = 0; k < word.length; k++) {
        const r = row + k * dRow;
        const c = col + k * dCol;
        const existing = cells[r][c];
        if (existing !== null && existing !== word[k]) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;

      for (let k = 0; k < word.length; k++) {
        const r = row + k * dRow;
        const c = col + k * dCol;
        cells[r][c] = word[k];
      }
      placements.push({ term: word, row, col, direction });
      placed = true;
      break;
    }

    if (!placed) return null;
  }

  return { cells, placements };
}

/**
 * Builds a real 2D word search: every term is placed once, along one of 4 axes
 * (horizontal, vertical, or either diagonal), and may cross another placed term only
 * where the letters agree. Remaining empty cells are filled with random letters. Grid
 * size is picked from the longest term and total letter count, then grown (up to
 * MAX_GRID_GROWTH_ATTEMPTS times) if a layout attempt can't fit everything.
 */
export function layoutWordSearch(words: WordSearchWordInput[], rng: () => number = Math.random): WordSearchGrid {
  const normalized = normalizeAndValidate(words);
  if (normalized.length === 0) {
    return { rows: 0, cols: 0, cells: [], placements: [] };
  }

  const terms = normalized.map((w) => w.word);
  const longest = Math.max(...terms.map((t) => t.length));
  const totalLetters = terms.reduce((sum, t) => sum + t.length, 0);

  let size = Math.max(longest + 2, Math.ceil(Math.sqrt(totalLetters * 2.2)));
  let result: LayoutAttempt | null = null;

  for (let growth = 0; growth < MAX_GRID_GROWTH_ATTEMPTS; growth++) {
    result = attemptLayout(seededShuffle(terms, rng), size, rng);
    if (result) break;
    size += 2;
  }

  if (!result) {
    throw new WordSearchLayoutError('Could not place all terms in the word search grid.');
  }

  const cells: string[][] = result.cells.map((row) => row.map((cell) => cell ?? randomLetter(rng)));

  return { rows: size, cols: size, cells, placements: result.placements };
}
