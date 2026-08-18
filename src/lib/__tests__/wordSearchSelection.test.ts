import { cellsBetween, snapDragEnd } from '../wordSearchSelection';

describe('snapDragEnd', () => {
  it('returns the start cell unchanged for a zero-movement drag', () => {
    expect(snapDragEnd(5, 5, 5, 5)).toEqual({ row: 5, col: 5 });
  });

  it('snaps a perfectly horizontal drag to the horizontal axis', () => {
    expect(snapDragEnd(2, 2, 2, 7)).toEqual({ row: 2, col: 7 });
  });

  it('snaps a perfectly vertical drag to the vertical axis', () => {
    expect(snapDragEnd(2, 2, 8, 2)).toEqual({ row: 8, col: 2 });
  });

  it('snaps a perfect down-right diagonal drag', () => {
    expect(snapDragEnd(0, 0, 4, 4)).toEqual({ row: 4, col: 4 });
  });

  it('snaps a perfect down-left diagonal drag', () => {
    expect(snapDragEnd(0, 5, 4, 1)).toEqual({ row: 4, col: 1 });
  });

  it('snaps an up-left drag (reverse of down-right) to the same diagonal axis', () => {
    expect(snapDragEnd(5, 5, 1, 1)).toEqual({ row: 1, col: 1 });
  });

  it('snaps an up-right drag (reverse of down-left) to the same diagonal axis', () => {
    expect(snapDragEnd(5, 1, 1, 5)).toEqual({ row: 1, col: 5 });
  });

  it('snaps a mostly-horizontal wobbly drag to horizontal, not a diagonal', () => {
    // rowDelta=1, colDelta=6 — horizontal error (1) beats every other axis
    expect(snapDragEnd(0, 0, 1, 6)).toEqual({ row: 0, col: 6 });
  });

  it('snaps a genuinely diagonal wobbly drag to the closer diagonal axis', () => {
    // rowDelta=5, colDelta=6 — down-right error (1) beats horizontal (5) and vertical (6)
    expect(snapDragEnd(0, 0, 5, 6)).toEqual({ row: 6, col: 6 });
  });
});

describe('cellsBetween', () => {
  it('enumerates a horizontal run left to right', () => {
    expect(cellsBetween(0, 0, 0, 3)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ]);
  });

  it('enumerates a vertical run top to bottom', () => {
    expect(cellsBetween(0, 0, 3, 0)).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
    ]);
  });

  it('enumerates a down-right diagonal run', () => {
    expect(cellsBetween(0, 0, 3, 3)).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
    ]);
  });

  it('enumerates a down-left diagonal run', () => {
    expect(cellsBetween(0, 5, 3, 2)).toEqual([
      { row: 0, col: 5 },
      { row: 1, col: 4 },
      { row: 2, col: 3 },
      { row: 3, col: 2 },
    ]);
  });

  it('enumerates a reversed (end-to-start) run in that same reversed order', () => {
    expect(cellsBetween(3, 3, 0, 0)).toEqual([
      { row: 3, col: 3 },
      { row: 2, col: 2 },
      { row: 1, col: 1 },
      { row: 0, col: 0 },
    ]);
  });

  it('returns a single cell when start and end are the same', () => {
    expect(cellsBetween(4, 4, 4, 4)).toEqual([{ row: 4, col: 4 }]);
  });
});
