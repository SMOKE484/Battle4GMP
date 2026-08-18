import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { BottomNav } from '../../src/components/BottomNav';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { LeaderboardList } from '../../src/components/challenge/LeaderboardList';
import { colors, font, fontSize, spacing } from '../../src/theme';
import { getChallengeById, getChallengeLeaderboard } from '../../src/lib/challengeService';
import { ChallengeLeaderboardRow, ChallengeRow } from '../../src/types/database';
import { useGameStore } from '../../src/store/useGameStore';

type ScreenStatus = 'loading' | 'error' | 'not_found' | 'ready';

const LEVEL_HREF = {
  1: '/level1',
  2: '/level2',
  3: '/level3',
} as const;

export default function ChallengeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playerId = useGameStore((s) => s.playerId);

  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<ChallengeLeaderboardRow[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setStatus('loading');

    const challengeResult = await getChallengeById(id);
    if (!challengeResult.ok) {
      setStatus('error');
      return;
    }
    if (!challengeResult.challenge) {
      setStatus('not_found');
      return;
    }
    setChallenge(challengeResult.challenge);

    const leaderboardResult = await getChallengeLeaderboard(challengeResult.challenge.id);
    setLeaderboard(leaderboardResult.ok ? leaderboardResult.rows : []);
    setStatus('ready');
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isExpired = challenge ? new Date(challenge.expires_at).getTime() < Date.now() : false;

  return (
    <GradientScreen>
      <AppHeader />

      {status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.purple.primary} size="small" />
          <Text style={styles.loadingText}>Loading challenge…</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Couldn't load this challenge</Text>
          <Text style={styles.errorBody}>Something went wrong reaching the server. Please try again.</Text>
          <Button label="Retry" onPress={() => void load()} style={styles.retryButton} />
        </View>
      ) : status === 'not_found' ? (
        <View style={styles.centered}>
          <Feather name="help-circle" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Challenge not found</Text>
          <Text style={styles.errorBody}>This challenge may have been removed, or the link is incorrect.</Text>
          <Button label="Join a Different Challenge" onPress={() => router.replace('/challenge/join')} style={styles.retryButton} />
        </View>
      ) : (
        challenge && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.levelBadge}>LEVEL {challenge.level}</Text>
            <Text style={styles.title}>Challenge {challenge.code}</Text>
            <Text style={styles.subtitle}>
              {isExpired ? 'This challenge has closed.' : `Open until ${new Date(challenge.expires_at).toLocaleString()}`}
            </Text>

            <Button
              label="PLAY →"
              onPress={() =>
                router.push({ pathname: LEVEL_HREF[challenge.level], params: { challengeId: challenge.id } })
              }
              disabled={isExpired}
              style={styles.playButton}
            />

            <Text style={styles.sectionLabel}>LEADERBOARD</Text>
            {leaderboard.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Feather name="award" size={24} color={colors.purple.muted} />
                <Text style={styles.emptyTitle}>No scores yet</Text>
                <Text style={styles.emptyBody}>No one's played this challenge yet — be the first!</Text>
              </Card>
            ) : (
              <LeaderboardList
                rows={leaderboard.map((row) => ({
                  playerId: row.player_id,
                  name: row.display_name,
                  score: row.total_score,
                }))}
                highlightPlayerId={playerId}
              />
            )}
          </ScrollView>
        )
      )}

      <BottomNav />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    marginTop: spacing.sm,
  },
  errorTitle: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xl,
    color: colors.text.heading,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
    paddingTop: spacing.sm,
  },
  levelBadge: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    backgroundColor: colors.purple.light,
    color: colors.neutral.white,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  title: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xxl,
    color: colors.text.heading,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    marginBottom: spacing.lg,
  },
  playButton: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.purple.primary,
    fontFamily: font('bodyExtraBold'),
    marginBottom: spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.lg,
    color: colors.text.heading,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    textAlign: 'center',
  },
});
