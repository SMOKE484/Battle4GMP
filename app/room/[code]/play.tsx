import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../../src/components/AppHeader';
import { GradientScreen } from '../../../src/components/ui/GradientScreen';
import { Card } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { LeaderboardList, LeaderboardEntry } from '../../../src/components/challenge/LeaderboardList';
import { colors, font, fontSize, radius, spacing } from '../../../src/theme';
import { getRoomByCode, getRoomLeaderboard, submitAnswer, subscribeToRoom } from '../../../src/lib/roomService';
import { computeRoomAnswerScore } from '../../../src/lib/levelScoring';
import { McqQuestion } from '../../../src/lib/mcqService';
import { ChallengeRoomRow } from '../../../src/types/database';
import { ensurePlayer } from '../../../src/lib/scoreSync';
import { useGameStore } from '../../../src/store/useGameStore';

type ScreenStatus = 'loading' | 'error' | 'not_found' | 'ready';

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export default function PlayRoomScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const deviceId = useGameStore((s) => s.deviceId);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setPlayerId = useGameStore((s) => s.setPlayerId);

  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [room, setRoom] = useState<ChallengeRoomRow | null>(null);
  const [selectedOption, setSelectedOption] = useState<0 | 1 | 2 | 3 | null>(null);
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; points: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const load = useCallback(async () => {
    if (!code) return;
    setStatus('loading');
    const result = await getRoomByCode(code);
    if (!result.ok) {
      setStatus('error');
      return;
    }
    if (!result.room) {
      setStatus('not_found');
      return;
    }
    setRoom(result.room);
    setStatus('ready');
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const roomId = room?.id ?? null;

  useEffect(() => {
    if (!roomId) return;
    return subscribeToRoom(roomId, (updated) => setRoom(updated));
  }, [roomId]);

  // A fresh question means a fresh answer slate, regardless of what happened
  // on the previous one.
  useEffect(() => {
    setSelectedOption(null);
    setLastResult(null);
    setSubmitError(null);
  }, [room?.current_question_index]);

  useEffect(() => {
    if (!room || (room.phase !== 'leaderboard' && room.phase !== 'ended')) return;
    void getRoomLeaderboard(room.id).then((result) => {
      if (result.ok) {
        setLeaderboard(result.rows.map((r) => ({ playerId: r.player_id, name: r.display_name, score: r.total_points })));
      }
    });
  }, [room?.phase, room?.id]);

  const questions = useMemo(() => (room?.question_set as McqQuestion[] | undefined) ?? [], [room?.question_set]);
  const currentQuestion: McqQuestion | undefined = room ? questions[room.current_question_index] : undefined;

  const handleAnswer = async (optionIndex: 0 | 1 | 2 | 3) => {
    if (!room || !currentQuestion || selectedOption !== null) return;
    setSelectedOption(optionIndex);
    setSubmitError(null);

    let submitterId = playerId;
    if (!submitterId) {
      if (!deviceId) {
        setSubmitError("Couldn't identify this device.");
        return;
      }
      const playerResult = await ensurePlayer(deviceId, displayName ?? undefined);
      if (!playerResult.ok) {
        setSubmitError("Couldn't reach the server — your answer wasn't recorded.");
        return;
      }
      submitterId = playerResult.playerId;
      setPlayerId(submitterId);
    }

    const isCorrect = optionIndex === currentQuestion.correctIndex;
    const answerMs = Math.max(0, Date.now() - new Date(room.phase_started_at).getTime());
    const points = computeRoomAnswerScore(isCorrect, answerMs, room.question_duration_ms);
    setLastResult({ isCorrect, points });

    const result = await submitAnswer(room.id, submitterId, room.current_question_index, optionIndex, isCorrect, answerMs, points);
    if (!result.ok) {
      setSubmitError("Your answer might not have saved — check your connection.");
    }
  };

  return (
    <GradientScreen>
      <AppHeader />

      {status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.purple.primary} size="small" />
          <Text style={styles.loadingText}>Loading room…</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Couldn't load this room</Text>
          <Text style={styles.errorBody}>Something went wrong reaching the server. Please try again.</Text>
          <Button label="Retry" onPress={() => void load()} style={styles.retryButton} />
        </View>
      ) : status === 'not_found' ? (
        <View style={styles.centered}>
          <Feather name="help-circle" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Room not found</Text>
          <Text style={styles.errorBody}>This room may have ended, or the code is incorrect.</Text>
          <Button label="Join a Different Room" onPress={() => router.replace('/room/join')} style={styles.retryButton} />
        </View>
      ) : (
        room && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {room.phase === 'lobby' ? (
              <View style={styles.centered}>
                <Feather name="tv" size={32} color={colors.purple.muted} />
                <Text style={styles.title}>Waiting for the host to start…</Text>
                <Text style={styles.subtitle}>Look up at the shared screen — questions will appear there.</Text>
              </View>
            ) : room.phase === 'question' ? (
              <View style={styles.centered}>
                <Text style={styles.eyebrow}>QUESTION {room.current_question_index + 1}</Text>
                <Text style={styles.subtitle}>Read the question on the shared screen, then pick your answer:</Text>

                <View style={styles.optionsGrid}>
                  {currentQuestion?.options.map((option, i) => {
                    const idx = i as 0 | 1 | 2 | 3;
                    const isSelected = selectedOption === idx;
                    const isDisabled = selectedOption !== null && !isSelected;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => void handleAnswer(idx)}
                        disabled={selectedOption !== null}
                        style={[styles.optionButton, isSelected ? styles.optionButtonSelected : null, isDisabled ? styles.optionButtonDisabled : null]}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: selectedOption !== null, selected: isSelected }}
                      >
                        <Text style={[styles.optionLetter, isSelected ? styles.optionTextSelected : null]}>{OPTION_LABELS[i]}</Text>
                        <Text style={[styles.optionText, isSelected ? styles.optionTextSelected : null]}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {selectedOption !== null ? (
                  <View style={styles.lockedInNotice}>
                    <Feather name="check-circle" size={14} color={colors.success.dark} />
                    <Text style={styles.lockedInText}>Locked in — waiting for the round to end…</Text>
                  </View>
                ) : null}

                {submitError ? (
                  <View style={styles.submitNotice}>
                    <Feather name="alert-circle" size={14} color={colors.error.text} />
                    <Text style={styles.submitNoticeText}>{submitError}</Text>
                  </View>
                ) : null}
              </View>
            ) : room.phase === 'reveal' ? (
              <View style={styles.centered}>
                {selectedOption === null ? (
                  <>
                    <Feather name="clock" size={28} color={colors.purple.muted} />
                    <Text style={styles.title}>Time's up!</Text>
                    <Text style={styles.subtitle}>You didn't answer this one — 0 points.</Text>
                  </>
                ) : lastResult?.isCorrect ? (
                  <>
                    <Feather name="check-circle" size={28} color={colors.success.base} />
                    <Text style={styles.title}>Correct!</Text>
                    <Text style={styles.subtitle}>+{lastResult.points} points</Text>
                  </>
                ) : (
                  <>
                    <Feather name="x-circle" size={28} color={colors.error.text} />
                    <Text style={styles.title}>Not quite</Text>
                    <Text style={styles.subtitle}>
                      Correct answer: {currentQuestion?.options[currentQuestion.correctIndex]}
                    </Text>
                  </>
                )}
              </View>
            ) : room.phase === 'leaderboard' ? (
              <View>
                <Text style={styles.sectionLabel}>LEADERBOARD</Text>
                {leaderboard.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No answers yet.</Text>
                  </Card>
                ) : (
                  <LeaderboardList rows={leaderboard} highlightPlayerId={playerId} />
                )}
                <Text style={styles.waitingText}>Waiting for the host to continue…</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.eyebrow}>FINAL RESULTS</Text>
                {leaderboard.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No answers were submitted this round.</Text>
                  </Card>
                ) : (
                  <LeaderboardList rows={leaderboard} highlightPlayerId={playerId} />
                )}
                <Button label="Back to Home" onPress={() => router.replace('/')} style={styles.actionButton} />
              </View>
            )}
          </ScrollView>
        )
      )}
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
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  title: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xl,
    color: colors.text.heading,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    textAlign: 'center',
  },
  eyebrow: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.purple.muted,
    marginBottom: spacing.sm,
  },
  optionsGrid: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: colors.neutral.outlineBorder,
  },
  optionButtonSelected: {
    borderColor: colors.purple.primary,
    backgroundColor: colors.neutral.inputBg,
  },
  optionButtonDisabled: {
    opacity: 0.4,
  },
  optionLetter: {
    fontFamily: font('headingExtraBold'),
    fontSize: fontSize.lg,
    color: colors.purple.muted,
    width: 24,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text.heading,
    fontFamily: font('bodySemiBold'),
  },
  optionTextSelected: {
    color: colors.purple.primary,
  },
  lockedInNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  lockedInText: {
    fontSize: fontSize.sm,
    color: colors.success.dark,
    fontFamily: font('bodySemiBold'),
  },
  submitNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
    backgroundColor: colors.error.bg,
    borderRadius: 12,
    padding: spacing.sm + 2,
    marginTop: spacing.md,
  },
  submitNoticeText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error.text,
    lineHeight: 16,
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
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  waitingText: {
    fontSize: fontSize.sm,
    color: colors.text.faint,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  actionButton: {
    marginTop: spacing.xl,
  },
});
