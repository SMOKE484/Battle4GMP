import { Feather } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../src/components/AppHeader';
import { BottomNav } from '../src/components/BottomNav';
import { GradientScreen } from '../src/components/ui/GradientScreen';
import { colors, font, fontSize, radius, spacing } from '../src/theme';
import { LevelNumber, LevelStatus, selectLevelStatus, useGameStore } from '../src/store/useGameStore';

interface LevelCardDef {
  level: LevelNumber;
  title: string;
  topic: string;
  desc: string;
  icon: keyof typeof Feather.glyphMap;
  bg: string;
  fg: string;
  href: '/level1' | '/level2' | '/level3';
}

const LEVEL_CARDS: LevelCardDef[] = [
  {
    level: 1,
    title: 'Crossword',
    topic: 'DATA INTEGRITY',
    desc: 'Fill in ALCOA+ terms to master data integrity principles.',
    icon: 'grid',
    bg: colors.level1.bg,
    fg: colors.level1.fg,
    href: '/level1',
  },
  {
    level: 2,
    title: 'Drag the Words',
    topic: 'PERSONNEL',
    desc: 'Match personnel roles to their GMP responsibilities.',
    icon: 'users',
    bg: colors.level2.bg,
    fg: colors.level2.fg,
    href: '/level2',
  },
  {
    level: 3,
    title: 'Word Search',
    topic: 'STERILITY',
    desc: 'Match scenarios to sterility terms hidden in the grid.',
    icon: 'search',
    bg: colors.level3.bg,
    fg: colors.level3.fg,
    href: '/level3',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const state = useGameStore((s) => s);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const displayName = useGameStore((s) => s.displayName);

  // Hydration from AsyncStorage is near-instant, so there's nothing to show while
  // waiting (per the loading-state rule: <1s wait means show nothing, not a flash
  // spinner) — this just avoids briefly bouncing a returning player to /welcome
  // before their saved name has loaded.
  if (!hasHydrated) return null;
  if (!displayName) return <Redirect href="/welcome" />;

  return (
    <GradientScreen>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Text style={styles.tagline}>PLAY · LEARN · PROTECT</Text>
          <Text style={styles.subtitle}>Good Manufacturing Practice</Text>
        </View>

        {LEVEL_CARDS.map((card) => {
          const status: LevelStatus = selectLevelStatus(state, card.level);
          const locked = status === 'locked';
          const completed = status === 'completed';

          return (
            <Pressable
              key={card.level}
              disabled={locked}
              onPress={() => router.push(card.href)}
              style={[styles.card, { borderColor: card.bg }, locked ? styles.cardLocked : null]}
              accessibilityRole="button"
              accessibilityState={{ disabled: locked }}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.badge, { backgroundColor: card.bg, color: card.fg }]}>LEVEL {card.level}</Text>
                <View style={[styles.cardIcon, { backgroundColor: card.bg }]}>
                  <Feather name={locked ? 'lock' : card.icon} size={18} color={card.fg} />
                </View>
              </View>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardTopic}>{card.topic}</Text>
              <Text style={styles.cardDesc}>{card.desc}</Text>
              <View style={styles.cardCta}>
                <Text style={[styles.cardCtaText, { color: card.fg }]}>
                  {locked ? 'Complete the previous level' : completed ? 'Completed · Replay' : 'Start level'}
                </Text>
                <Feather name={locked ? 'lock' : completed ? 'check' : 'chevron-right'} size={13} color={card.fg} />
              </View>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => router.push('/challenge')}
          style={styles.challengeCard}
          accessibilityRole="button"
        >
          <View style={styles.challengeIcon}>
            <Feather name="users" size={18} color={colors.purple.primary} />
          </View>
          <View style={styles.challengeText}>
            <Text style={styles.challengeTitle}>Challenge a Friend</Text>
            <Text style={styles.challengeDesc}>Create or join a code-based challenge on any level.</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.purple.muted} />
        </Pressable>
      </ScrollView>
      <BottomNav />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
  },
  intro: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  tagline: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.purple.muted,
  },
  subtitle: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.lg,
    color: colors.purple.primary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    shadowColor: colors.purple.primary,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardLocked: {
    opacity: 0.55,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm + 2,
  },
  badge: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    overflow: 'hidden',
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xxl,
    color: colors.text.heading,
  },
  cardTopic: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.pink.accent,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  cardDesc: {
    fontSize: fontSize.md - 0.5,
    color: colors.text.muted,
    lineHeight: 18,
  },
  cardCta: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardCtaText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  challengeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.neutral.outlineBorder,
    borderStyle: 'dashed',
  },
  challengeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeText: {
    flex: 1,
  },
  challengeTitle: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.md,
    color: colors.text.heading,
  },
  challengeDesc: {
    fontSize: fontSize.sm - 1,
    color: colors.text.muted,
    marginTop: 2,
  },
});
