import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { Button } from '../../src/components/ui/Button';
import { colors, font, fontSize, radius, spacing } from '../../src/theme';
import { generateMcqQuestions } from '../../src/lib/mcqService';
import { createRoom } from '../../src/lib/roomService';
import { ensurePlayer } from '../../src/lib/scoreSync';
import { QuestionTopic } from '../../src/types/database';
import { useGameStore } from '../../src/store/useGameStore';

const TOPIC_OPTIONS: { topic: QuestionTopic; label: string; desc: string }[] = [
  { topic: 'data_integrity', label: 'Data Integrity', desc: 'ALCOA+ principles' },
  { topic: 'personnel', label: 'Personnel', desc: 'Cleanroom roles & responsibilities' },
  { topic: 'sterility', label: 'Sterility', desc: 'Sterile product manufacture' },
];

const QUESTION_COUNT = 8;

export default function CreateRoomScreen() {
  const router = useRouter();
  const deviceId = useGameStore((s) => s.deviceId);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setPlayerId = useGameStore((s) => s.setPlayerId);

  const [topic, setTopic] = useState<QuestionTopic>('data_integrity');
  const [submitting, setSubmitting] = useState(false);
  const [loadingText, setLoadingText] = useState('Generating questions…');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!deviceId) return;
    setSubmitting(true);
    setSubmitError(null);
    setLoadingText('Generating questions…');
    const slowTimer = setTimeout(() => setLoadingText('Almost ready…'), 5000);

    try {
      let hostPlayerId = playerId;
      if (!hostPlayerId) {
        const playerResult = await ensurePlayer(deviceId, displayName ?? undefined);
        if (!playerResult.ok) {
          setSubmitError("Couldn't reach the server — check your connection and try again.");
          return;
        }
        hostPlayerId = playerResult.playerId;
        setPlayerId(hostPlayerId);
      }

      let questions;
      try {
        questions = await generateMcqQuestions(topic, QUESTION_COUNT);
      } catch {
        setSubmitError("Couldn't build questions for this topic — check your connection and try again.");
        return;
      }

      const result = await createRoom(hostPlayerId, topic, questions);
      if (!result.ok) {
        setSubmitError("Couldn't create the room — check your connection and try again.");
        return;
      }
      router.replace({ pathname: '/room/[code]', params: { code: result.room.code } });
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
    }
  };

  return (
    <GradientScreen>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Host a Live Room</Text>
        <Text style={styles.subtitle}>
          Pick a topic — this device becomes the host and shared screen, players join with their phones.
        </Text>

        <Text style={styles.sectionLabel}>TOPIC</Text>
        <View style={styles.optionList}>
          {TOPIC_OPTIONS.map((opt) => (
            <Pressable
              key={opt.topic}
              onPress={() => setTopic(opt.topic)}
              style={[styles.optionCard, topic === opt.topic ? styles.optionCardActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: topic === opt.topic }}
            >
              <Text style={[styles.optionTitle, topic === opt.topic ? styles.optionTitleActive : null]}>{opt.label}</Text>
              <Text style={[styles.optionDesc, topic === opt.topic ? styles.optionDescActive : null]}>{opt.desc}</Text>
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
          label={submitting ? loadingText.toUpperCase() : 'CREATE ROOM →'}
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
  title: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xxl,
    color: colors.text.heading,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.purple.primary,
    fontFamily: font('bodyExtraBold'),
    marginBottom: spacing.sm,
  },
  optionList: {
    gap: spacing.sm,
  },
  optionCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.neutral.white,
    borderWidth: 2,
    borderColor: colors.neutral.outlineBorder,
  },
  optionCardActive: {
    borderColor: colors.purple.primary,
    backgroundColor: colors.neutral.inputBg,
  },
  optionTitle: {
    fontFamily: font('bodyExtraBold'),
    fontSize: fontSize.md,
    color: colors.text.heading,
  },
  optionTitleActive: {
    color: colors.purple.primary,
  },
  optionDesc: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    marginTop: 2,
  },
  optionDescActive: {
    color: colors.purple.primary,
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
});
