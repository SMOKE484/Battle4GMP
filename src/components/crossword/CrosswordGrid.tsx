import { useRef } from 'react';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { colors, font, fontSize, spacing } from '../../theme';
import { CrosswordGrid as CrosswordGridData } from '../../lib/crosswordLayout';

export type CellState = 'default' | 'locked' | 'incorrect';

interface CrosswordGridProps {
  grid: CrosswordGridData;
  values: Record<string, string>;
  cellState: (row: number, col: number) => CellState;
  onChangeCell: (row: number, col: number, value: string) => void;
}

export function cellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

const MIN_CELL_SIZE = 22;
const MAX_CELL_SIZE = 34;
const CARD_HORIZONTAL_PADDING = spacing.lg * 2;
const SCREEN_HORIZONTAL_PADDING = spacing.xl * 2;

export function CrosswordGrid({ grid, values, cellState, onChangeCell }: CrosswordGridProps) {
  const { width } = useWindowDimensions();
  const available = width - SCREEN_HORIZONTAL_PADDING - CARD_HORIZONTAL_PADDING;
  const cellSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, Math.floor(available / Math.max(grid.cols, 1)) - 2));

  // Keyed by cellKey — lets us move focus programmatically when a letter locks in,
  // since disabling the currently-focused input (via `editable`) otherwise blurs it
  // and dismisses the keyboard on iOS/Android.
  const inputRefs = useRef(new Map<string, TextInput | null>());

  function focusNextCellInWord(rowIndex: number, colIndex: number) {
    const word = grid.words.find((w) =>
      w.direction === 'across'
        ? rowIndex === w.row && colIndex >= w.col && colIndex < w.col + w.word.length
        : colIndex === w.col && rowIndex >= w.row && rowIndex < w.row + w.word.length
    );
    if (!word) return;

    const nextRow = word.direction === 'down' ? rowIndex + 1 : rowIndex;
    const nextCol = word.direction === 'across' ? colIndex + 1 : colIndex;
    const withinWord =
      word.direction === 'across' ? nextCol < word.col + word.word.length : nextRow < word.row + word.word.length;
    if (!withinWord || cellState(nextRow, nextCol) === 'locked') return;

    inputRefs.current.get(cellKey(nextRow, nextCol))?.focus();
  }

  return (
    <View>
      {grid.cells.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((cell, colIndex) => {
            if (!cell) {
              return <View key={colIndex} style={[styles.spacer, { width: cellSize, height: cellSize }]} />;
            }

            const key = cellKey(rowIndex, colIndex);
            const state = cellState(rowIndex, colIndex);
            const value = values[key] ?? '';

            return (
              <View
                key={colIndex}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  state === 'locked' ? styles.cellLocked : null,
                  state === 'incorrect' ? styles.cellIncorrect : null,
                ]}
              >
                {cell.number ? <Text style={styles.cellNumber}>{cell.number}</Text> : null}
                <TextInput
                  ref={(ref) => {
                    inputRefs.current.set(key, ref);
                  }}
                  value={value}
                  editable={state !== 'locked'}
                  maxLength={1}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(text) => {
                    const letter = text.slice(-1).toUpperCase().replace(/[^A-Z]/g, '');
                    onChangeCell(rowIndex, colIndex, letter);
                    if (letter && letter === cell.letter) {
                      focusNextCellInWord(rowIndex, colIndex);
                    }
                  }}
                  style={[
                    styles.input,
                    {
                      color: state === 'locked' ? colors.success.dark : state === 'incorrect' ? colors.error.text : colors.purple.primary,
                      fontFamily: font('headingBold'),
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 2,
  },
  spacer: {
    backgroundColor: 'transparent',
  },
  cell: {
    backgroundColor: colors.neutral.inputBg,
    borderRadius: 4,
    position: 'relative',
  },
  cellLocked: {
    backgroundColor: colors.success.bg,
  },
  cellIncorrect: {
    backgroundColor: colors.error.bg,
  },
  cellNumber: {
    position: 'absolute',
    top: 0,
    left: 2,
    fontSize: fontSize.xs - 3,
    color: colors.purple.muted,
    zIndex: 1,
  },
  input: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '700',
    padding: 0,
  },
});
