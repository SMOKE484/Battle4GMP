import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, font, fontSize, radius, spacing } from '../../theme';

interface ScenarioListProps {
  pairs: { term: string; clue: string }[];
  foundTerms: Set<string>;
}

/**
 * Pure display list — this is a free-form word search, so there's no "select a
 * scenario first" step. A card just checks itself off the instant its term is
 * found anywhere in the grid.
 */
export function ScenarioList({ pairs, foundTerms }: ScenarioListProps) {
  return (
    <View>
      {pairs.map((pair) => {
        const found = foundTerms.has(pair.term);

        return (
          <View
            key={pair.term}
            style={[styles.card, found ? styles.cardFound : null]}
            accessibilityRole="text"
            accessibilityState={{ selected: found }}
          >
            <Text style={[styles.clue, found ? styles.clueFound : null]}>{pair.clue}</Text>
            {found ? <Feather name="check" size={16} color={colors.success.base} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.neutral.divider,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardFound: {
    backgroundColor: colors.success.bg,
    borderColor: colors.success.border,
  },
  clue: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text.body,
    fontFamily: font('bodyRegular'),
  },
  clueFound: {
    color: colors.text.muted,
    textDecorationLine: 'line-through',
  },
});
