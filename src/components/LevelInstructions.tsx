import { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { colors, font, fontSize, radius, spacing } from '../theme';

export interface InstructionStep {
  title: string;
  body: string;
  // width/height are explicit (not aspectRatio) deliberately — see the
  // Image+aspectRatio bug logged in ISSUES_AND_SOLUTIONS.md. Optional so a level
  // can ship instructions before its mascot art exists.
  image?: { source: ImageSourcePropType; width: number; height: number };
}

interface LevelInstructionsProps {
  visible: boolean;
  steps: InstructionStep[];
  onFinish: () => void;
  // True once the player has already completed this level's instructions
  // before (any visit after the first) — lets them skip straight past a
  // walkthrough they already know instead of stepping through it again.
  canSkip?: boolean;
}

export function LevelInstructions({ visible, steps, onFinish, canSkip = false }: LevelInstructionsProps) {
  const [stepIndex, setStepIndex] = useState(0);

  // Reset to the first step whenever the overlay is (re)opened — e.g. the
  // in-level help bulb reopening it after a player already reached the end
  // once shouldn't resume mid-way through.
  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  // Without this, Image just swaps `source` on the same element and both web
  // and native keep rendering the previous bitmap on screen until the new one
  // finishes decoding — a visible flash of the wrong mascot on every Next tap.
  // Prefetching every step's image as soon as the overlay opens means they're
  // all already decoded/cached by the time a player clicks through to them.
  //
  // Native-only: Image.resolveAssetSource is a native-platform static utility
  // that turns a require()'d numeric asset id into a real {uri}. react-native-web
  // doesn't implement it at all (it's undefined there), so calling it on web
  // threw a TypeError that crashed the whole screen (no error boundary exists in
  // this app) — see ISSUES_AND_SOLUTIONS.md. Skipping this on web just means web
  // reverts to the pre-existing (documented, non-crashing) flash-of-stale-image
  // behavior instead of prefetching — an acceptable trade for not crashing.
  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    steps.forEach((s) => {
      if (!s.image) return;
      const uri = Image.resolveAssetSource(s.image.source)?.uri;
      if (uri) Image.prefetch(uri).catch(() => {});
    });
  }, [visible, steps]);

  const step = steps[stepIndex];
  if (!step) return null;
  const isLastStep = stepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onFinish();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFinish}>
      <View style={styles.scrim}>
        <Card style={styles.card}>
          {canSkip ? (
            <Pressable
              onPress={onFinish}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip instructions"
            >
              <Text style={styles.skipButtonText}>SKIP</Text>
            </Pressable>
          ) : null}

          {step.image ? (
            <Image
              source={step.image.source}
              style={{ width: step.image.width, height: step.image.height, alignSelf: 'center', marginBottom: spacing.md }}
              resizeMode="contain"
            />
          ) : null}

          <View style={styles.dots}>
            {steps.map((_, i) => (
              <View key={i} style={[styles.dot, i === stepIndex ? styles.dotActive : null]} />
            ))}
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.actions}>
            {stepIndex > 0 ? (
              <Pressable
                onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
                style={styles.backButton}
                accessibilityRole="button"
              >
                <Text style={styles.backButtonText}>BACK</Text>
              </Pressable>
            ) : null}
            <Button label={isLastStep ? 'FINISH →' : 'NEXT →'} onPress={handleNext} flex={1} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(28, 23, 48, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: spacing.sm,
  },
  skipButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.purple.muted,
    letterSpacing: 0.5,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.neutral.outlineBorder,
  },
  dotActive: {
    backgroundColor: colors.pink.accent,
    width: 18,
  },
  title: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xl,
    color: colors.text.heading,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  backButtonText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.purple.muted,
  },
});
