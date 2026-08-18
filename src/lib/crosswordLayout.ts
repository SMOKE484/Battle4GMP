export interface CrosswordWordInput {
  word: string;
  clue: string;
}

export type Direction = 'across' | 'down';

export interface PlacedWord {
  word: string;
  clue: string;
  row: number;
  col: number;
  direction: Direction;
  number: number;
}

export interface CrosswordCell {
  letter: string;
  number: number | null;
}

export interface CrosswordGrid {
  rows: number;
  cols: number;
  cells: (CrosswordCell | null)[][];
  words: PlacedWord[];
}

export interface LayoutCrosswordOptions {
  maxCols?: number;
  maxRows?: number;
  candidateOrderings?: number;
  rng?: () => number;
}

export class CrosswordLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrosswordLayoutError';
  }
}

const DEFAULT_MAX_COLS = 10;
const DEFAULT_MAX_ROWS = 24;
const DEFAULT_CANDIDATE_ORDERINGS = 3;

interface OccupiedCell {
  letter: string;
  directions: Set<Direction>;
}

interface RawPlacement {
  word: string;
  clue: string;
  row: number;
  col: number;
  direction: Direction;
}

interface OrderingResult {
  placements: RawPlacement[];
  intersections: number;
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

function normalizeAndValidate(words: CrosswordWordInput[]): CrosswordWordInput[] {
  const seen = new Set<string>();
  const result: CrosswordWordInput[] = [];
  for (const entry of words) {
    const word = entry.word.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(word)) {
      throw new CrosswordLayoutError(`Invalid word "${entry.word}": must be one or more letters A-Z.`);
    }
    if (seen.has(word)) continue;
    seen.add(word);
    result.push({ word, clue: entry.clue });
  }
  return result;
}

function otherDirection(d: Direction): Direction {
  return d === 'across' ? 'down' : 'across';
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function tryPlaceOrdering(words: CrosswordWordInput[], maxCols: number, maxRows: number): OrderingResult {
  const occupied = new Map<string, OccupiedCell>();
  const placements: RawPlacement[] = [];
  let minRow = 0;
  let maxRow = 0;
  let minCol = 0;
  let maxCol = 0;
  let intersections = 0;

  const fitsBounds = (direction: Direction, len: number): boolean =>
    direction === 'across' ? len <= maxCols : len <= maxRows;

  const isValidPlacement = (word: string, direction: Direction, row: number, col: number): boolean => {
    for (let k = 0; k < word.length; k++) {
      const r = direction === 'across' ? row : row + k;
      const c = direction === 'across' ? col + k : col;
      const existing = occupied.get(cellKey(r, c));
      if (existing) {
        if (existing.letter !== word[k]) return false;
        if (existing.directions.has(direction)) return false;
      }
    }
    // cells immediately before/after the word on its own axis must stay empty,
    // so unrelated words never appear to run together into one longer word.
    const beforeR = direction === 'across' ? row : row - 1;
    const beforeC = direction === 'across' ? col - 1 : col;
    const afterR = direction === 'across' ? row : row + word.length;
    const afterC = direction === 'across' ? col + word.length : col;
    if (occupied.has(cellKey(beforeR, beforeC))) return false;
    if (occupied.has(cellKey(afterR, afterC))) return false;
    return true;
  };

  const place = (word: string, clue: string, direction: Direction, row: number, col: number) => {
    for (let k = 0; k < word.length; k++) {
      const r = direction === 'across' ? row : row + k;
      const c = direction === 'across' ? col + k : col;
      const key = cellKey(r, c);
      const existing = occupied.get(key);
      if (existing) {
        if (!existing.directions.has(direction)) intersections++;
        existing.directions.add(direction);
      } else {
        occupied.set(key, { letter: word[k], directions: new Set([direction]) });
      }
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    }
    placements.push({ word, clue, row, col, direction });
  };

  words.forEach((entry, idx) => {
    const { word, clue } = entry;

    if (idx === 0) {
      const direction: Direction = word.length <= maxCols ? 'across' : 'down';
      place(word, clue, direction, 0, 0);
      return;
    }

    let bestPlacement: { direction: Direction; row: number; col: number } | null = null;
    for (const [key, cell] of occupied) {
      if (cell.directions.size >= 2) continue; // both directions already used at this cell
      const requiredDirection = otherDirection([...cell.directions][0]);
      if (!fitsBounds(requiredDirection, word.length)) continue;
      const [rStr, cStr] = key.split(',');
      const cellRow = Number(rStr);
      const cellCol = Number(cStr);
      for (let k = 0; k < word.length; k++) {
        if (word[k] !== cell.letter) continue;
        const row = requiredDirection === 'across' ? cellRow : cellRow - k;
        const col = requiredDirection === 'across' ? cellCol - k : cellCol;
        if (isValidPlacement(word, requiredDirection, row, col)) {
          bestPlacement = { direction: requiredDirection, row, col };
          break;
        }
      }
      if (bestPlacement) break;
    }

    if (bestPlacement) {
      place(word, clue, bestPlacement.direction, bestPlacement.row, bestPlacement.col);
      return;
    }

    // no valid intersection anywhere — place disconnected on a fresh row, with a
    // one-row gap so it never reads as adjacent to the previous entry.
    const direction: Direction = word.length <= maxCols ? 'across' : 'down';
    place(word, clue, direction, maxRow + 2, minCol);
  });

  return { placements, intersections, minRow, maxRow, minCol, maxCol };
}

export function layoutCrossword(words: CrosswordWordInput[], opts: LayoutCrosswordOptions = {}): CrosswordGrid {
  const maxCols = opts.maxCols ?? DEFAULT_MAX_COLS;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const candidateCount = opts.candidateOrderings ?? DEFAULT_CANDIDATE_ORDERINGS;
  const rng = opts.rng ?? Math.random;

  const normalized = normalizeAndValidate(words);
  if (normalized.length === 0) {
    return { rows: 0, cols: 0, cells: [], words: [] };
  }

  const orderings: CrosswordWordInput[][] = [[...normalized].sort((a, b) => b.word.length - a.word.length)];
  for (let i = 1; i < candidateCount; i++) {
    orderings.push(seededShuffle(normalized, rng));
  }

  let best: OrderingResult | null = null;
  for (const ordering of orderings) {
    const result = tryPlaceOrdering(ordering, maxCols, maxRows);
    if (!best) {
      best = result;
      continue;
    }
    const area = (result.maxRow - result.minRow + 1) * (result.maxCol - result.minCol + 1);
    const bestArea = (best.maxRow - best.minRow + 1) * (best.maxCol - best.minCol + 1);
    if (result.intersections > best.intersections || (result.intersections === best.intersections && area < bestArea)) {
      best = result;
    }
  }

  const { placements, minRow, maxRow, minCol, maxCol } = best as OrderingResult;
  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;
  const cells: (CrosswordCell | null)[][] = Array.from({ length: rows }, () =>
    new Array<CrosswordCell | null>(cols).fill(null)
  );

  for (const p of placements) {
    for (let k = 0; k < p.word.length; k++) {
      const r = (p.direction === 'across' ? p.row : p.row + k) - minRow;
      const c = (p.direction === 'across' ? p.col + k : p.col) - minCol;
      if (!cells[r][c]) {
        cells[r][c] = { letter: p.word[k], number: null };
      }
    }
  }

  // Number cells in row-major order of each word's start position; a cell that
  // starts both an across and a down word shares one number between them.
  const starts = placements
    .map((p) => ({ row: p.row - minRow, col: p.col - minCol }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const numberByKey = new Map<string, number>();
  let nextNumber = 1;
  for (const s of starts) {
    const key = cellKey(s.row, s.col);
    if (!numberByKey.has(key)) {
      numberByKey.set(key, nextNumber++);
    }
  }
  for (const [key, number] of numberByKey) {
    const [rStr, cStr] = key.split(',');
    const cell = cells[Number(rStr)][Number(cStr)];
    if (cell) cell.number = number;
  }

  const resultWords: PlacedWord[] = placements.map((p) => {
    const row = p.row - minRow;
    const col = p.col - minCol;
    return {
      word: p.word,
      clue: p.clue,
      row,
      col,
      direction: p.direction,
      number: numberByKey.get(cellKey(row, col)) as number,
    };
  });

  return { rows, cols, cells, words: resultWords };
}
