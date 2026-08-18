import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { Button } from '../../src/components/ui/Button';
import { colors, font, fontSize, radius, spacing } from '../../src/theme';
import { createChallenge } from '../../src/lib/challengeService';
import { ensurePlayer } from '../../src/lib/scoreSync';
import { LevelNumber, useGameStore } from '../../src/store/useGameStore';

const LEVEL_OPTIONS: { level: LevelNumber; label: string; topic: string }[] = [
  { level: 1, label: 'Level 1', topic: 'Crossword — Data Integrity' },
  { level: 2, label: 'Level 2', topic: 'Drag the Words — Personnel' },
  { level: 3, label: 'Level 3', topic: 'Word Search — Sterility' },
];

const WINDOW_OPTIONS = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

export default function CreateChallengeScreen() {
  const router = useRouter();
  const deviceId = useGameStore((s) => s.deviceId);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setPlayerId = useGameStore((s) => s.setPlayerId);

  const [level, setLevel] = useState<LevelNumber>(1);
  const [windowHours, setWindowHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  const handleCreate = async () => {
    if (!deviceId) return;
    setSubmitting(true);
    setSubmitError(null);

    let hostPlayerId = playerId;
    if (!hostPlayerId) {
      const playerResult = await ensurePlayer(deviceId, displayName ?? undefined);
      if (!playerResult.ok) {
        setSubmitting(false);
        setSubmitError("Couldn't reach the server — check your connection and try again.");
        return;
      }
      hostPlayerId = playerResult.playerId;
      setPlayerId(hostPlayerId);
    }

    const result = await createChallenge(hostPlayerId, level, windowHours);
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError("Couldn't create the challenge — check your connection and try again.");
      return;
    }
    setCreated({ id: result.challenge.id, code: result.challenge.code });
  };

  const handleShare = () => {
    if (!created) return;
    void Share.share({ message: `Join my Battle4GMP challenge! Code: ${created.code}` });
  };

  if (created) {
    return (
      <GradientScreen>
        <AppHeader />
        <View style={styles.centered}>
          <Feather name="check-circle" size={40} color={colors.success.base} />
          <Text style={styles.title}>Challenge created!</Text>
          <Text style={styles.subtitle}>Share this code with friends:</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{created.code}</Text>
          </View>
          <View style={styles.actions}>
            <Button label="SHARE" variant="secondary" onPress={handleShare} flex={1} />
            <Button
              label="VIEW CHALLENGE →"
              onPress={() => router.replace({ pathname: '/challenge/[id]', params: { id: created.id } })}
              flex={1.4}
            />
          </View>
        </View>
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Create a Challenge</Text>
        <Text style={styles.subtitle}>Pick a level and a time window — friends play it on their own time.</Text>

        <Text style={styles.sectionLabel}>LEVEL</Text>
        <View style={styles.optionRow}>
          {LEVEL_OPTIONS.map((opt) => (
            <Pressable
              key={opt.level}
              onPress={() => setLevel(opt.level)}
              style={[styles.chip, level === opt.level ? styles.chipActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: level === opt.level }}
            >
              <Text style={[styles.chipText, level === opt.level ? styles.chipTextActive : null]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.optionHint}>{LEVEL_OPTIONS.find((o) => o.level === level)?.topic}</Text>

        <Text style={styles.sectionLabel}>OPEN FOR</Text>
        <View style={styles.optionRow}>
          {WINDOW_OPTIONS.map((opt) => (
            <Pressable
              key={opt.hours}
              onPress={() => setWindowHours(opt.hours)}
              style={[styles.chip, windowHours === opt.hours ? styles.chipActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: windowHours === opt.hours }}
            >
              <Text style={[styles.chipText, windowHours === opt.hours ? styles.chipTextActive : null]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        {submitError ? (
          <View style={styles.submitNotice}>
            <Feather name="alert-circle" size={14} color={colors.error.text} />
            <Text style={styles.submitNoticeText}>{submitError}</Text>
          </View>
        ) : null}

        <Button
          label={submitting ? 'CREATING…' : 'CREATE CHALLENGE →'}
          onPress={() => void handleCreate()}
          loading={submitting}
          disabled={!deviceId}
          style={styles.createButton}
        />
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
    paddingTop: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
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
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.purple.primary,
    fontFamily: font('bodyExtraBold'),
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.neutral.white,
    borderWidth: 2,
    borderColor: colors.neutral.outlineBorder,
  },
  chipActive: {
    backgroundColor: colors.purple.primary,
    borderColor: colors.purple.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.purple.primary,
  },
  chipTextActive: {
    color: colors.neutral.white,
  },
  optionHint: {
    fontSize: fontSize.xs,
    color: colors.text.faint,
    marginTop: spacing.xs,
  },
  submitNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
    backgroundColor: colors.error.bg,
    borderRadius: 12,
    padding: spacing.sm + 2,
    marginTop: spacing.lg,
  },
  submitNoticeText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error.text,
    lineHeight: 16,
  },
  createButton: {
    marginTop: spacing.xl,
  },
  codeBox: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.neutral.outlineBorder,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    marginVertical: spacing.lg,
  },
  codeText: {
    fontFamily: font('headingExtraBold'),
    fontSize: fontSize.xxl + 6,
    color: colors.purple.primary,
    letterSpacing: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
});
