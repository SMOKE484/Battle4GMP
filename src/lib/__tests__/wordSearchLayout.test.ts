import {
  directionDelta,
  layoutWordSearch,
  PlacedWordSearchTerm,
  WordSearchLayoutError,
  WordSearchWordInput,
} from '../wordSearchLayout';
import { mulberry32 } from '../../testHelpers/mulberry32';

/** Reads a placement's cells off the grid and joins them into a string, so we can
 * confirm the grid actually spells the term at the position/direction it claims to. */
function readPlacement(grid: { cells: string[][] }, placement: PlacedWordSearchTerm, length: number): string {
  const { dRow, dCol } = directionDelta(placement.direction);
  let out = '';
  for (let k = 0; k < length; k++) {
    out += grid.cells[placement.row + k * dRow][placement.col + k * dCol];
  }
  return out;
}

describe('layoutWordSearch', () => {
  it('returns an empty grid for empty input without throwing', () => {
    const grid = layoutWordSearch([]);
    expect(grid).toEqual({ rows: 0, cols: 0, cells: [], placements: [] });
  });

  it('places every word so the grid actually spells it at its claimed position/direction', () => {
    const words: WordSearchWordInput[] = [
      { word: 'CAT', clue: 'c1' },
      { word: 'AIRLOCK', clue: 'c2' },
      { word: 'DOG', clue: 'c3' },
    ];
    const grid = layoutWordSearch(words, mulberry32(1));
    expect(grid.placements).toHaveLength(3);
    for (const p of grid.placements) {
      expect(readPlacement(grid, p, p.term.length)).toBe(p.term);
    }
  });

  it('is a square grid sized at least the longest word plus a small margin', () => {
    const words: WordSearchWordInput[] = [
      { word: 'DECONTAMINATION', clue: 'c1' },
      { word: 'CAT', clue: 'c2' },
    ];
    const grid = layoutWordSearch(words, mulberry32(2));
    expect(grid.rows).toBe(grid.cols);
    expect(grid.rows).toBeGreaterThanOrEqual('DECONTAMINATION'.length + 2);
  });

  it('every cell is a single uppercase letter (placed or filler)', () => {
    const words: WordSearchWordInput[] = [
      { word: 'CLEANROOM', clue: 'c1' },
      { word: 'BIOFILM', clue: 'c2' },
      { word: 'AIRLOCK', clue: 'c3' },
    ];
    const grid = layoutWordSearch(words, mulberry32(7));
    for (const row of grid.cells) {
      for (const cell of row) {
        expect(cell).toMatch(/^[A-Z]$/);
      }
    }
  });

  it('lets a word cross another only where the letters agree, never overwriting a mismatch', () => {
    // Placement is randomized, so we can't assert a specific crossing happened —
    // but re-reading every placement's cells (including any it crosses) must
    // always still spell that placement's own term, proving no placement silently
    // clobbered another's letters.
    const words: WordSearchWordInput[] = [
      { word: 'ENDOTOXIN', clue: 'c1' },
      { word: 'BIOBURDEN', clue: 'c2' },
      { word: 'ISOLATOR', clue: 'c3' },
      { word: 'ASEPTIC', clue: 'c4' },
      { word: 'GOWNING', clue: 'c5' },
      { word: 'AIRLOCK', clue: 'c6' },
    ];
    for (const seed of [1, 2, 3, 4, 5]) {
      const grid = layoutWordSearch(words, mulberry32(seed));
      for (const p of grid.placements) {
        expect(readPlacement(grid, p, p.term.length)).toBe(p.term);
      }
    }
  });

  it('dedupes duplicate words case-insensitively', () => {
    const grid = layoutWordSearch([
      { word: 'aseptic', clue: 'first' },
      { word: 'ASEPTIC', clue: 'duplicate' },
    ]);
    expect(grid.placements).toHaveLength(1);
  });

  it('is deterministic for the same input and the same rng seed', () => {
    const words: WordSearchWordInput[] = [
      { word: 'CLEANROOM', clue: 'c1' },
      { word: 'AIRLOCK', clue: 'c2' },
      { word: 'BIOBURDEN', clue: 'c3' },
    ];
    const gridA = layoutWordSearch(words, mulberry32(42));
    const gridB = layoutWordSearch(words, mulberry32(42));
    expect(gridA).toEqual(gridB);
  });

  it('handles a single-word input, placed horizontally or vertically starting in-bounds', () => {
    const grid = layoutWordSearch([{ word: 'GOWNING', clue: 'c1' }], mulberry32(1));
    expect(grid.placements).toHaveLength(1);
    const [p] = grid.placements;
    expect(readPlacement(grid, p, 'GOWNING'.length)).toBe('GOWNING');
  });

  it('throws WordSearchLayoutError on an empty word', () => {
    expect(() => layoutWordSearch([{ word: '', clue: 'c1' }])).toThrow(WordSearchLayoutError);
  });

  it('throws WordSearchLayoutError on a word containing non-letters', () => {
    expect(() => layoutWordSearch([{ word: 'AB3', clue: 'c1' }])).toThrow(WordSearchLayoutError);
  });

  it('uses all 4 directions (not just horizontal/vertical) across many rounds', () => {
    const words: WordSearchWordInput[] = [
      { word: 'ENDOTOXIN', clue: 'c1' },
      { word: 'BIOBURDEN', clue: 'c2' },
      { word: 'ISOLATOR', clue: 'c3' },
      { word: 'ASEPTIC', clue: 'c4' },
      { word: 'GOWNING', clue: 'c5' },
      { word: 'AIRLOCK', clue: 'c6' },
    ];
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const grid = layoutWordSearch(words, mulberry32(seed));
      for (const p of grid.placements) {
        seen.add(p.direction);
        // Every placement, on every axis, must still read back correctly.
        expect(readPlacement(grid, p, p.term.length)).toBe(p.term);
      }
    }
    expect(seen).toEqual(new Set(['horizontal', 'vertical', 'diagonalDownRight', 'diagonalDownLeft']));
  });
});
