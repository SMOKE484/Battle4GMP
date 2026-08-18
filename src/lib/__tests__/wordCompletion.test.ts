import { newlyCompletedWords } from '../wordCompletion';
import { PlacedWord } from '../crosswordLayout';

// CAT (across, row 0, cols 0-2) intersects TOP (down, col 2, rows 0-2) at the
// shared 'T' cell (0,2).
const CAT: PlacedWord = { word: 'CAT', clue: 'c', row: 0, col: 0, direction: 'across', number: 1 };
const TOP: PlacedWord = { word: 'TOP', clue: 'c', row: 0, col: 2, direction: 'down', number: 1 };
const DOG: PlacedWord = { word: 'DOG', clue: 'c', row: 5, col: 0, direction: 'across', number: 2 };

describe('newlyCompletedWords', () => {
  it('returns nothing when no word is fully solved yet', () => {
    const before = new Set<string>();
    const after = new Set(['0-0']);
    expect(newlyCompletedWords([CAT, TOP], before, after)).toEqual([]);
  });

  it('returns a word the instant its last letter locks', () => {
    const before = new Set(['0-0', '0-1']); // C, A locked; T missing
    const after = new Set(['0-0', '0-1', '0-2']); // T just locked
    expect(newlyCompletedWords([CAT, TOP], before, after)).toEqual([CAT]);
  });

  it('returns both words when a shared intersection cell completes them simultaneously', () => {
    const before = new Set(['0-0', '0-1', '1-2', '2-2']); // C,A + O,P; shared T missing
    const after = new Set([...before, '0-2']); // T locks, completing CAT and TOP at once
    const result = newlyCompletedWords([CAT, TOP], before, after);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([CAT, TOP]));
  });

  it('does not re-report a word that was already fully solved before this change', () => {
    const before = new Set(['0-0', '0-1', '0-2']); // CAT already complete
    const after = new Set([...before, '5-0']); // unrelated cell locks elsewhere
    expect(newlyCompletedWords([CAT, TOP, DOG], before, after)).toEqual([]);
  });

  it('ignores words untouched by the change', () => {
    const before = new Set<string>();
    const after = new Set(['0-0']);
    expect(newlyCompletedWords([DOG], before, after)).toEqual([]);
  });
});
