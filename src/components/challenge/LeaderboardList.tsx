import { StyleSheet, Text, View } from 'react-native';

import { colors, font, fontSize, radius, spacing } from '../../theme';

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  score: number;
}

interface LeaderboardListProps {
  rows: LeaderboardEntry[];
  highlightPlayerId?: string | null;
}

// Presentation-only — assumes a non-empty `rows`. Callers own their own
// loading/error/empty states (see app/challenge/[id].tsx) so this stays a
// plain, reusable "golf scorecard" list for both Stage 1 challenges and,
// later, Stage 2 live rooms.
export function LeaderboardList({ rows, highlightPlayerId }: LeaderboardListProps) {
  return (
    <View style={styles.list}>
      {rows.map((row, index) => {
        const isMe = row.playerId === highlightPlayerId;
        return (
          <View key={row.playerId} style={[styles.row, isMe ? styles.rowHighlight : null]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {row.name}
              {isMe ? ' (you)' : ''}
            </Text>
            <Text style={styles.score}>{row.score}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  rowHighlight: {
    borderWidth: 2,
    borderColor: colors.pink.accent,
  },
  rank: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.md,
    color: colors.purple.muted,
    width: 22,
  },
  name: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font('bodySemiBold'),
    color: colors.text.heading,
  },
  score: {
    fontSize: fontSize.md,
    fontFamily: font('bodyExtraBold'),
    color: colors.purple.primary,
  },
});
