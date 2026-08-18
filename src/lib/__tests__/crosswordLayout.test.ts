import { layoutCrossword, CrosswordLayoutError, CrosswordWordInput } from '../crosswordLayout';
import { mulberry32 } from '../../testHelpers/mulberry32';

function nonNullCellCount(cells: (unknown | null)[][]): number {
  return cells.reduce((sum, row) => sum + row.filter((c) => c !== null).length, 0);
}

describe('layoutCrossword', () => {
  it('returns an empty grid for empty input without throwing', () => {
    const grid = layoutCrossword([]);
    expect(grid).toEqual({ rows: 0, cols: 0, cells: [], words: [] });
  });

  it('places a single word starting at (0,0), numbered 1', () => {
    const grid = layoutCrossword([{ word: 'accurate', clue: 'c1' }]);
    expect(grid.words).toHaveLength(1);
    expect(grid.words[0]).toMatchObject({
      word: 'ACCURATE',
      row: 0,
      col: 0,
      direction: 'across',
      number: 1,
    });
    expect(grid.rows).toBe(1);
    expect(grid.cols).toBe('ACCURATE'.length);
  });

  it('dedupes duplicate words case-insensitively', () => {
    const grid = layoutCrossword([
      { word: 'legible', clue: 'first' },
      { word: 'LEGIBLE', clue: 'duplicate' },
    ]);
    expect(grid.words).toHaveLength(1);
    expect(grid.words[0].clue).toBe('first');
  });

  it('places a non-intersecting word disconnected, without crashing or overlapping', () => {
    const words: CrosswordWordInput[] = [
      { word: 'ACCURATE', clue: 'c1' },
      { word: 'ZZZ', clue: 'c2' }, // shares no letters with ACCURATE
    ];
    const grid = layoutCrossword(words);
    expect(grid.words).toHaveLength(2);
    expect(nonNullCellCount(grid.cells)).toBe('ACCURATE'.length + 'ZZZ'.length);
    const [first, second] = grid.words;
    expect(first.row).not.toBe(second.row);
  });

  it('intersects two words perpendicular at the matching letter', () => {
    const grid = layoutCrossword([
      { word: 'CAT', clue: 'c1' },
      { word: 'ARM', clue: 'c2' },
    ]);
    expect(grid.words).toHaveLength(2);
    // fewer cells than the sum of lengths proves a real intersection happened
    expect(nonNullCellCount(grid.cells)).toBe('CAT'.length + 'ARM'.length - 1);
    const cat = grid.words.find((w) => w.word === 'CAT')!;
    const arm = grid.words.find((w) => w.word === 'ARM')!;
    expect(cat.direction).not.toBe(arm.direction);
  });

  it('gives two words that start at the same cell a shared clue number', () => {
    const grid = layoutCrossword([
      { word: 'ACE', clue: 'c1' },
      { word: 'AXE', clue: 'c2' },
    ]);
    const ace = grid.words.find((w) => w.word === 'ACE')!;
    const axe = grid.words.find((w) => w.word === 'AXE')!;
    expect(ace.row).toBe(axe.row);
    expect(ace.col).toBe(axe.col);
    expect(ace.number).toBe(axe.number);
    expect(ace.direction).not.toBe(axe.direction);
  });

  it('places a word longer than maxCols vertically instead of overflowing the row', () => {
    const grid = layoutCrossword([{ word: 'ABCDEFGHIJKL', clue: 'c1' }], { maxCols: 10 });
    expect(grid.words[0].direction).toBe('down');
    expect(grid.rows).toBe(12);
    expect(grid.cols).toBe(1);
  });

  it('handles an all-disconnected pathological case without overlaps or crashes', () => {
    const grid = layoutCrossword([
      { word: 'ABC', clue: 'c1' },
      { word: 'DEF', clue: 'c2' },
      { word: 'GHI', clue: 'c3' },
    ]);
    expect(grid.words).toHaveLength(3);
    expect(nonNullCellCount(grid.cells)).toBe(9);
    const rows = new Set(grid.words.map((w) => w.row));
    expect(rows.size).toBe(3); // each on its own row, no accidental adjacency
  });

  it('is deterministic for the same input and the same rng seed', () => {
    const words: CrosswordWordInput[] = [
      { word: 'ACCURATE', clue: 'c1' },
      { word: 'ORIGINAL', clue: 'c2' },
      { word: 'COMPLETE', clue: 'c3' },
      { word: 'LEGIBLE', clue: 'c4' },
    ];
    const gridA = layoutCrossword(words, { rng: mulberry32(42) });
    const gridB = layoutCrossword(words, { rng: mulberry32(42) });
    expect(gridA).toEqual(gridB);
  });

  it('throws CrosswordLayoutError on an empty word', () => {
    expect(() => layoutCrossword([{ word: '', clue: 'c1' }])).toThrow(CrosswordLayoutError);
  });

  it('throws CrosswordLayoutError on a word containing non-letters', () => {
    expect(() => layoutCrossword([{ word: 'AB3', clue: 'c1' }])).toThrow(CrosswordLayoutError);
  });
});
