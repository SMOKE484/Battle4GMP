import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, font, fontSize, spacing } from '../../theme';
import { PlacedWord } from '../../lib/crosswordLayout';

interface ClueListProps {
  words: PlacedWord[];
  isSolved: (word: string) => boolean;
}

export function ClueList({ words, isSolved }: ClueListProps) {
  return (
    <View>
      {words.map((word) => {
        const solved = isSolved(word.word);
        return (
          <View key={`${word.number}-${word.direction}`} style={styles.row}>
            <Text style={styles.number}>
              {word.number}
              {word.direction === 'across' ? 'A' : 'D'}
            </Text>
            <Text style={[styles.clue, solved ? styles.clueSolved : null]}>{word.clue}</Text>
            {solved ? <Feather name="check" size={13} color={colors.success.base} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.divider,
  },
  number: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.pink.accent,
    fontFamily: font('bodyExtraBold'),
    flexShrink: 0,
  },
  clue: {
    fontSize: fontSize.md,
    color: colors.text.body,
    flex: 1,
  },
  clueSolved: {
    color: colors.text.muted,
    textDecorationLine: 'line-through',
  },
});
