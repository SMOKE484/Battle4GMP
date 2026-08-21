import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { BottomNav } from '../../src/components/BottomNav';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { InstructionStep, LevelInstructions } from '../../src/components/LevelInstructions';
import { colors, font, fontSize, radius, spacing } from '../../src/theme';
import { useGameStore } from '../../src/store/useGameStore';

const MULTIPLAYER_INSTRUCTIONS: InstructionStep[] = [
  {
    title: 'Rapid Round',
    body: 'A fast-paced live room pulling 10 mixed questions from all 3 levels — 20 seconds to answer each one.',
    image: { source: require('../../assets/StopwatchRapidRound.png'), width: 220, height: 184 },
  },
  {
    title: 'Speed + Accuracy Win',
    body: "The faster and more accurate your answers, the more points you score. Standings are ranked best to least best at the end.",
    image: { source: require('../../assets/TrophyLeaderboard.png'), width: 190, height: 220 },
  },
  {
    title: 'Everyone Answers at Once',
    body: 'One player hosts and controls the pace — everyone else joins on their phone and answers the same question at the same time.',
    image: { source: require('../../assets/BuzzerbuttonLiveRoom.png'), width: 220, height: 135 },
  },
  {
    title: 'Invite Friends Directly',
    body: "See who's online right now and invite them straight into your room — no code needed if they're already in the app.",
    image: { source: require('../../assets/TwotoneCapsuleInviteFriends.png'), width: 220, height: 148 },
  },
];

export default function ChallengeHubScreen() {
  const router = useRouter();
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const hasSeenMultiplayerInstructions = useGameStore((s) => s.hasSeenMultiplayerInstructions);
  const markMultiplayerInstructionsSeen = useGameStore((s) => s.markMultiplayerInstructionsSeen);
  const [showInstructions, setShowInstructions] = useState(false);

  // Shows on every visit, not just the first — same reasoning as each level's
  // own instructions overlay — gated on hasHydrated purely so
  // hasSeenMultiplayerInstructions has already loaded from storage before the
  // overlay renders, so a returning player's Skip button is there immediately.
  useEffect(() => {
    if (!hasHydrated) return;
    setShowInstructions(true);
  }, [hasHydrated]);

  const handleFinishInstructions = () => {
    setShowInstructions(false);
    markMultiplayerInstructionsSeen();
  };

  return (
    <GradientScreen>
      <AppHeader />

      <LevelInstructions
        visible={showInstructions}
        steps={MULTIPLAYER_INSTRUCTIONS}
        onFinish={handleFinishInstructions}
        canSkip={hasSeenMultiplayerInstructions}
      />

      <View style={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingText}>
            <Text style={styles.title}>Play with Friends</Text>
            <Text style={styles.subtitle}>Host a live quiz for your class, or join one with a code.</Text>
          </View>
          <Pressable
            onPress={() => setShowInstructions(true)}
            style={styles.helpButton}
            accessibilityRole="button"
            accessibilityLabel="How multiplayer works"
          >
            <Feather name="help-circle" size={18} color={colors.purple.muted} />
          </Pressable>
        </View>

        <Pressable
          style={styles.card}
          onPress={() => router.push('/room/create')}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Feather name="tv" size={22} color={colors.purple.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Host a Live Room</Text>
            <Text style={styles.cardDesc}>Open on a laptop as the shared screen — players join on their phones.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.purple.muted} />
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => router.push('/room/join')}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Feather name="smartphone" size={22} color={colors.purple.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Join a Live Room</Text>
            <Text style={styles.cardDesc}>Enter a host's room code and answer from your phone.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.purple.muted} />
        </Pressable>
      </View>
      <BottomNav />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headingText: {
    flex: 1,
  },
  helpButton: {
    padding: 4,
    marginTop: 2,
  },
  title: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xxl,
    color: colors.text.heading,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    marginBottom: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    shadowColor: colors.purple.primary,
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.neutral.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.lg,
    color: colors.text.heading,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    marginTop: 2,
  },
});
