export interface GridCellCoord {
  row: number;
  col: number;
}

/**
 * Given a drag from (startRow,startCol) to a raw, unsnapped (rawRow,rawCol) cell, picks
 * whichever of the 4 axes a word can be placed on — horizontal, vertical, or either
 * diagonal — best fits the raw delta, then returns the actual end cell snapped to that
 * axis. This is how a slightly wobbly finger still reads as a clean straight line: we
 * measure how far the raw delta deviates from each candidate axis and take the closest.
 */
export function snapDragEnd(startRow: number, startCol: number, rawRow: number, rawCol: number): GridCellCoord {
  const rowDelta = rawRow - startRow;
  const colDelta = rawCol - startCol;

  if (rowDelta === 0 && colDelta === 0) {
    return { row: startRow, col: startCol };
  }

  // Deviation from a perfect line on each axis: 0 means the raw delta already lies
  // exactly on that axis.
  const horizontalError = Math.abs(rowDelta); // horizontal means rowDelta should be 0
  const verticalError = Math.abs(colDelta); // vertical means colDelta should be 0
  const downRightError = Math.abs(rowDelta - colDelta); // ↘ means rowDelta === colDelta
  const downLeftError = Math.abs(rowDelta + colDelta); // ↙ means rowDelta === -colDelta

  const minError = Math.min(horizontalError, verticalError, downRightError, downLeftError);

  if (minError === horizontalError) {
    return { row: startRow, col: startCol + colDelta };
  }
  if (minError === verticalError) {
    return { row: startRow + rowDelta, col: startCol };
  }
  if (minError === downRightError) {
    const reach = Math.round((rowDelta + colDelta) / 2);
    return { row: startRow + reach, col: startCol + reach };
  }
  const reach = Math.round((rowDelta - colDelta) / 2);
  return { row: startRow + reach, col: startCol - reach };
}

/**
 * The straight inclusive run of cells from start to end. Works uniformly for
 * horizontal, vertical, and both diagonal axes — callers are expected to pass an
 * (end row, end col) that `snapDragEnd` produced, so the two always lie on exactly
 * one of those 4 axes.
 */
export function cellsBetween(startRow: number, startCol: number, endRow: number, endCol: number): GridCellCoord[] {
  const rowDelta = endRow - startRow;
  const colDelta = endCol - startCol;
  const steps = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
  const dRow = rowDelta > 0 ? 1 : rowDelta < 0 ? -1 : 0;
  const dCol = colDelta > 0 ? 1 : colDelta < 0 ? -1 : 0;

  const cells: GridCellCoord[] = [];
  for (let k = 0; k <= steps; k++) {
    cells.push({ row: startRow + k * dRow, col: startCol + k * dCol });
  }
  return cells;
}
