import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';

import { colors, font, fontSize, radius, spacing } from '../theme';
import { Pill, PillText } from './ui/Pill';
import { selectTotalScore, useGameStore } from '../store/useGameStore';

export function AppHeader() {
  const router = useRouter();
  const clueTokens = useGameStore((s) => s.clueTokens);
  const totalScore = useGameStore(selectTotalScore);
  const hasPendingSync = useGameStore(
    (s) => s.pendingSync.length > 0 || (!!s.displayName && !s.displayNameSynced)
  );

  return (
    <View>
      <View style={styles.row}>
        <Pressable style={styles.brand} onPress={() => router.push('/')}>
          <LinearGradient colors={colors.brandGradient} style={styles.brandIcon}>
            <Ionicons name="shield-checkmark" size={14} color={colors.neutral.white} />
          </LinearGradient>
          <Text style={styles.wordmark}>
            BATTLE<Text style={{ color: colors.pink.accent }}>4</Text>GMP
          </Text>
        </Pressable>

        <View style={styles.pills}>
          <Pill>
            <Feather name="key" size={13} color={colors.purple.light} />
            <PillText>{clueTokens}</PillText>
          </Pill>
          <Pill gradient={colors.scoreGradient}>
            <PillText color={colors.neutral.white}>{totalScore} PTS</PillText>
          </Pill>
        </View>
      </View>

      {/* Non-blocking: a score or display name failed to reach Supabase but is safe
          on-device and will retry automatically (at the next level completion or app
          start) — per AGENTS.md, sync ambiguity must never be silent, but it also
          must never block gameplay. */}
      {hasPendingSync ? (
        <View style={styles.syncNotice}>
          <Feather name="cloud-off" size={11} color={colors.text.muted} />
          <Text style={styles.syncNoticeText}>Saved on device — will sync when back online.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: font('headingExtraBold'),
    fontSize: fontSize.xl - 3,
    color: colors.purple.primary,
    fontWeight: '800',
  },
  pills: {
    flexDirection: 'row',
    gap: 6,
  },
  syncNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  syncNoticeText: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    fontFamily: font('bodySemiBold'),
  },
});
