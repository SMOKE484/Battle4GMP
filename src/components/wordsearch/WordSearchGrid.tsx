import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { colors, font, fontSize, spacing } from '../../theme';
import { WordSearchGrid as WordSearchGridData, directionDelta } from '../../lib/wordSearchLayout';
import { GridCellCoord, cellsBetween, snapDragEnd } from '../../lib/wordSearchSelection';

export type { GridCellCoord };

interface WordSearchGridProps {
  grid: WordSearchGridData;
  foundTerms: Set<string>;
  incorrectCells: GridCellCoord[];
  onSelectionEnd: (cells: GridCellCoord[]) => void;
  // Fires true the instant a drag starts on the grid and false once it ends —
  // the screen uses this to disable its outer ScrollView for the duration, since
  // a drag here would otherwise fight the ScrollView for the same touch.
  onDragActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}

const MIN_CELL_SIZE = 18;
const MAX_CELL_SIZE = 30;
const CARD_HORIZONTAL_PADDING = spacing.lg * 2;
const SCREEN_HORIZONTAL_PADDING = spacing.xl * 2;
const CELL_GAP = 2;

function cellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

/**
 * A real word search grid: press the first letter of a word you spot, drag straight
 * to its last letter — horizontally, vertically, or diagonally, in any of those 4
 * axes' 2 reading directions — release. `onSelectionEnd` reports the dragged cells;
 * the caller (app/level3) decides whether they spell a hidden term.
 *
 * The gesture worklet itself only tracks raw finger position and throttles how often
 * it crosses to JS (once per cell moved into, not once per touch-move frame); the
 * actual axis-snapping and cell enumeration (`snapDragEnd`/`cellsBetween`) run as
 * plain JS on every reported update, not inside the worklet — keeps the worklet
 * itself trivial, and keeps that geometry logic independently unit-testable.
 */
export function WordSearchGrid({
  grid,
  foundTerms,
  incorrectCells,
  onSelectionEnd,
  onDragActiveChange,
  disabled,
}: WordSearchGridProps) {
  const { width } = useWindowDimensions();
  const available = width - SCREEN_HORIZONTAL_PADDING - CARD_HORIZONTAL_PADDING;
  const cellSize = Math.max(
    MIN_CELL_SIZE,
    Math.min(MAX_CELL_SIZE, Math.floor(available / Math.max(grid.cols, 1)) - CELL_GAP)
  );
  const step = cellSize + CELL_GAP;

  const startRow = useSharedValue(0);
  const startCol = useSharedValue(0);
  const lastRawRow = useSharedValue(-1);
  const lastRawCol = useSharedValue(-1);

  const [selection, setSelection] = useState<GridCellCoord[]>([]);

  const foundCellKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of grid.placements) {
      if (!foundTerms.has(p.term)) continue;
      const { dRow, dCol } = directionDelta(p.direction);
      for (let k = 0; k < p.term.length; k++) {
        keys.add(cellKey(p.row + k * dRow, p.col + k * dCol));
      }
    }
    return keys;
  }, [grid.placements, foundTerms]);

  const selectionKeys = useMemo(() => new Set(selection.map((c) => cellKey(c.row, c.col))), [selection]);
  const incorrectKeys = useMemo(() => new Set(incorrectCells.map((c) => cellKey(c.row, c.col))), [incorrectCells]);

  useEffect(() => {
    onDragActiveChange?.(selection.length > 0);
  }, [selection.length, onDragActiveChange]);

  const handleDragUpdate = useCallback((sRow: number, sCol: number, rawRow: number, rawCol: number) => {
    const end = snapDragEnd(sRow, sCol, rawRow, rawCol);
    setSelection(cellsBetween(sRow, sCol, end.row, end.col));
  }, []);

  const handleDragEnd = useCallback(
    (sRow: number, sCol: number, rawRow: number, rawCol: number) => {
      const end = snapDragEnd(sRow, sCol, rawRow, rawCol);
      const cells = cellsBetween(sRow, sCol, end.row, end.col);
      setSelection([]);
      if (cells.length < 2) return; // a stray tap, not a drag — no attempt to score
      onSelectionEnd(cells);
    },
    [onSelectionEnd]
  );

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onStart((e) => {
      const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(e.y / step)));
      const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(e.x / step)));
      startRow.value = row;
      startCol.value = col;
      lastRawRow.value = row;
      lastRawCol.value = col;
      runOnJS(handleDragUpdate)(row, col, row, col);
    })
    .onUpdate((e) => {
      const rawRow = Math.max(0, Math.min(grid.rows - 1, Math.floor(e.y / step)));
      const rawCol = Math.max(0, Math.min(grid.cols - 1, Math.floor(e.x / step)));
      if (rawRow === lastRawRow.value && rawCol === lastRawCol.value) return;
      lastRawRow.value = rawRow;
      lastRawCol.value = rawCol;
      runOnJS(handleDragUpdate)(startRow.value, startCol.value, rawRow, rawCol);
    })
    .onEnd(() => {
      runOnJS(handleDragEnd)(startRow.value, startCol.value, lastRawRow.value, lastRawCol.value);
    });

  return (
    <GestureDetector gesture={pan}>
      <View>
        {grid.cells.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((letter, colIndex) => {
              const key = cellKey(rowIndex, colIndex);
              const found = foundCellKeys.has(key);
              const selected = selectionKeys.has(key);
              const incorrect = incorrectKeys.has(key);

              return (
                <View
                  key={colIndex}
                  style={[
                    styles.cell,
                    { width: cellSize, height: cellSize },
                    selected ? styles.cellSelected : null,
                    found ? styles.cellFound : null,
                    incorrect ? styles.cellIncorrect : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.letter,
                      { fontFamily: font('headingBold') },
                      selected ? styles.letterSelected : null,
                      found ? styles.letterFound : null,
                      incorrect ? styles.letterIncorrect : null,
                    ]}
                  >
                    {letter}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  cell: {
    backgroundColor: colors.neutral.inputBg,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: colors.level3.bg,
  },
  cellFound: {
    backgroundColor: colors.success.bg,
  },
  cellIncorrect: {
    backgroundColor: colors.error.bg,
  },
  letter: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.purple.primary,
  },
  letterSelected: {
    color: colors.level3.fg,
  },
  letterFound: {
    color: colors.success.dark,
  },
  letterIncorrect: {
    color: colors.error.text,
  },
});
