import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { LeaderboardList, LeaderboardEntry } from '../../src/components/challenge/LeaderboardList';
import { colors, font, fontSize, radius, spacing } from '../../src/theme';
import { advancePhase, getPhaseDurationMs, getQuestionAnswerTally, getRoomLeaderboard, subscribeToPresence } from '../../src/lib/roomService';
import { sendInvite } from '../../src/lib/inviteService';
import { useRoomSync } from '../../src/hooks/useRoomSync';
import { McqQuestion } from '../../src/lib/mcqService';
import { RoomPhase } from '../../src/types/database';
import { useGameStore } from '../../src/store/useGameStore';

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export default function HostRoomScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const onlinePlayers = useGameStore((s) => s.onlinePlayers);

  const { room, status, applyRoom, reload } = useRoomSync(code);
  const [presenceNames, setPresenceNames] = useState<string[]>([]);
  const [tally, setTally] = useState<[number, number, number, number] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [invitedPlayerIds, setInvitedPlayerIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const roomId = room?.id ?? null;

  useEffect(() => {
    if (!roomId) return;
    return subscribeToPresence(roomId, playerId ?? 'host', displayName ?? 'Host', setPresenceNames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const isHost = !!playerId && !!room && playerId === room.host_player_id;
  const questions = useMemo(() => (room?.question_set as McqQuestion[] | undefined) ?? [], [room?.question_set]);
  const currentQuestion: McqQuestion | undefined = room ? questions[room.current_question_index] : undefined;
  const isLastQuestion = room ? room.current_question_index >= questions.length - 1 : false;

  // Both 'question' (answer window) and 'reveal' (holds before moving on) are
  // timed phases — getPhaseDurationMs picks the right duration for whichever
  // one the room is currently in, so one countdown/auto-advance mechanism
  // serves both instead of two near-duplicate ones.
  const phaseDeadline = room ? new Date(room.phase_started_at).getTime() + getPhaseDurationMs(room) : 0;
  const secondsLeft = Math.max(0, Math.ceil((phaseDeadline - now) / 1000));

  useEffect(() => {
    if (!room || (room.phase !== 'question' && room.phase !== 'reveal')) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [room?.phase, room?.id]);

  // Host auto-advances the room once the current timed phase's countdown runs
  // out — nobody has to tap anything to keep the room moving: 'question' auto-
  // reveals (though "Reveal now" still lets the host cut it short), and
  // 'reveal' auto-advances straight to the next question (or 'ended' on the
  // last one) — there's no per-question leaderboard step to click through.
  // The ref guard matters: `now` ticks every 250ms while the phase is still
  // the old one until the write resolves, so without it the deadline would
  // fire several duplicate advances in a row.
  const autoAdvancedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!room || !isHost) return;
    if (room.phase !== 'question' && room.phase !== 'reveal') return;
    if (now < phaseDeadline) return;

    const key = `${room.id}:${room.phase}:${room.current_question_index}:${room.phase_started_at}`;
    if (autoAdvancedForRef.current === key) return;
    autoAdvancedForRef.current = key;

    const next: [RoomPhase, number | undefined] =
      room.phase === 'question' ? ['reveal', undefined] : [isLastQuestion ? 'ended' : 'question', isLastQuestion ? undefined : room.current_question_index + 1];

    void advancePhase(room.id, next[0], next[1]).then((result) => {
      if (result.ok) {
        applyRoom(result.room);
      } else {
        // Same silent-failure shape as a failed manual tap — an automatic
        // advance that quietly does nothing is just as confusing as a button
        // that does nothing, so it gets the same inline error treatment.
        setActionError("Couldn't move the room on automatically. Please try again.");
        autoAdvancedForRef.current = null; // let the next tick retry rather than being permanently stuck on this key
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, room?.phase, isHost]);

  useEffect(() => {
    if (!room || room.phase !== 'reveal') {
      setTally(null);
      return;
    }
    void getQuestionAnswerTally(room.id, room.current_question_index).then((result) => {
      if (result.ok) setTally(result.counts);
    });
  }, [room?.phase, room?.current_question_index, room?.id]);

  useEffect(() => {
    if (!room || room.phase !== 'ended') return;
    void getRoomLeaderboard(room.id).then((result) => {
      if (result.ok) {
        setLeaderboard(result.rows.map((r) => ({ playerId: r.player_id, name: r.display_name, score: r.total_points })));
      }
    });
  }, [room?.phase, room?.id]);

  // Global online roster (app-wide, from _layout.tsx) minus this player (the
  // host) and minus anyone whose display name already shows in this room's own
  // presence list above — an approximation (names aren't unique app-wide) that
  // matches this app's existing accepted limitation around anonymous names,
  // rather than adding a new query just to resolve it exactly by player id.
  const invitablePlayers = onlinePlayers.filter((p) => p.playerId !== playerId && !presenceNames.includes(p.displayName));

  const handleInvite = async (targetPlayerId: string) => {
    if (!room || !playerId) return;
    const result = await sendInvite(room.id, room.code, playerId, displayName ?? 'Anonymous Pharmacist', targetPlayerId);
    if (result.ok) setInvitedPlayerIds((prev) => new Set(prev).add(targetPlayerId));
  };

  // Applies the row advancePhase returns straight to local state, so the host's
  // own screen reacts to its own tap immediately instead of waiting on the
  // realtime echo — and reports a failure inline rather than looking inert.
  const runAdvance = async (phase: RoomPhase, questionIndex?: number) => {
    if (!room || advancing) return;
    setAdvancing(true);
    setActionError(null);

    const result = await advancePhase(room.id, phase, questionIndex);
    if (result.ok) {
      applyRoom(result.room);
    } else {
      setActionError(
        result.kind === 'network'
          ? "Couldn't reach the server — the room didn't move on. Check your connection and try again."
          : "Couldn't move the room on. Please try again."
      );
    }
    setAdvancing(false);
  };

  // Shown inline beside whichever host control was just tapped — per AGENTS.md,
  // a failed advance must never look like the button simply did nothing.
  const hostActionError = actionError ? (
    <View style={styles.actionNotice}>
      <Feather name="alert-circle" size={14} color={colors.error.text} />
      <Text style={styles.actionNoticeText}>{actionError}</Text>
    </View>
  ) : null;

  const handleStart = () => void runAdvance('question', 0);
  const handleRevealNow = () => void runAdvance('reveal');

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
          <Button label="Retry" onPress={() => void reload()} style={styles.retryButton} />
        </View>
      ) : status === 'not_found' ? (
        <View style={styles.centered}>
          <Feather name="help-circle" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Room not found</Text>
          <Text style={styles.errorBody}>This room may have ended, or the link is incorrect.</Text>
          <Button label="Host a New Room" onPress={() => router.replace('/room/create')} style={styles.retryButton} />
        </View>
      ) : (
        room && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {room.phase === 'lobby' ? (
              <View style={styles.centered}>
                <Text style={styles.eyebrow}>ROOM CODE</Text>
                <Text style={styles.codeText}>{room.code}</Text>
                <Text style={styles.subtitle}>Players: open "Join a Live Room" and enter this code.</Text>

                <Card style={styles.playersCard}>
                  <Text style={styles.sectionLabel}>CONNECTED ({presenceNames.length})</Text>
                  {presenceNames.length === 0 ? (
                    <Text style={styles.emptyText}>Waiting for players to join…</Text>
                  ) : (
                    <Text style={styles.playersText}>{presenceNames.join(', ')}</Text>
                  )}
                </Card>

                {isHost ? (
                  <Card style={styles.playersCard}>
                    <Text style={styles.sectionLabel}>INVITE ONLINE PLAYERS</Text>
                    {invitablePlayers.length === 0 ? (
                      <Text style={styles.emptyText}>No one else is online right now — share the code instead.</Text>
                    ) : (
                      <View style={styles.inviteList}>
                        {invitablePlayers.map((p) => {
                          const invited = invitedPlayerIds.has(p.playerId);
                          return (
                            <View key={p.playerId} style={styles.inviteRow}>
                              <Text style={styles.inviteName}>{p.displayName}</Text>
                              <Button
                                label={invited ? 'INVITED ✓' : 'INVITE'}
                                variant="secondary"
                                disabled={invited}
                                onPress={() => void handleInvite(p.playerId)}
                                style={styles.inviteButton}
                              />
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </Card>
                ) : null}

                {isHost ? hostActionError : null}
                {isHost ? <Button label="START →" onPress={handleStart} loading={advancing} style={styles.actionButton} /> : null}
              </View>
            ) : room.phase === 'question' ? (
              <View style={styles.centered}>
                <Text style={styles.eyebrow}>
                  QUESTION {room.current_question_index + 1} OF {questions.length}
                </Text>
                <Text style={styles.countdown}>{secondsLeft}</Text>
                <Text style={styles.promptText}>{currentQuestion?.prompt}</Text>
                <Text style={styles.subtitle}>Answer on your phone now — options aren't shown here on purpose.</Text>
                {isHost ? hostActionError : null}
                {isHost ? (
                  <Button label="Reveal Now" variant="secondary" onPress={handleRevealNow} loading={advancing} style={styles.actionButton} />
                ) : null}
              </View>
            ) : room.phase === 'reveal' ? (
              <View style={styles.centered}>
                <Text style={styles.eyebrow}>ANSWER</Text>
                <Text style={styles.promptText}>{currentQuestion?.prompt}</Text>
                <View style={styles.tallyList}>
                  {currentQuestion?.options.map((option, i) => {
                    const isCorrect = i === currentQuestion.correctIndex;
                    const count = tally ? tally[i] : 0;
                    return (
                      <View key={option} style={[styles.tallyRow, isCorrect ? styles.tallyRowCorrect : null]}>
                        <Text style={[styles.tallyLabel, isCorrect ? styles.tallyLabelCorrect : null]}>
                          {OPTION_LABELS[i]}. {option}
                        </Text>
                        <Text style={[styles.tallyCount, isCorrect ? styles.tallyLabelCorrect : null]}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
                {isHost ? hostActionError : null}
                <Text style={styles.nextUpText}>
                  {isLastQuestion ? 'Final results' : 'Next question'} in {secondsLeft}…
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.eyebrow}>FINAL RESULTS</Text>
                {leaderboard.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No answers were submitted this round.</Text>
                  </Card>
                ) : (
                  <LeaderboardList rows={leaderboard} />
                )}
                <Button label="Close Room" onPress={() => router.replace('/')} style={styles.actionButton} />
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
  eyebrow: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.purple.muted,
    marginBottom: spacing.sm,
  },
  codeText: {
    fontFamily: font('headingExtraBold'),
    fontSize: fontSize.xxl + 14,
    color: colors.purple.primary,
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  playersCard: {
    width: '100%',
    marginTop: spacing.xl,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.purple.primary,
    fontFamily: font('bodyExtraBold'),
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  playersText: {
    fontSize: fontSize.md,
    color: colors.text.heading,
    lineHeight: 20,
  },
  inviteList: {
    gap: spacing.sm,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inviteName: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: font('bodySemiBold'),
    color: colors.text.heading,
  },
  inviteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  actionNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
    backgroundColor: colors.error.bg,
    borderRadius: 12,
    padding: spacing.sm + 2,
    marginTop: spacing.lg,
    width: '100%',
  },
  actionNoticeText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error.text,
    lineHeight: 16,
  },
  actionButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  countdown: {
    fontFamily: font('headingExtraBold'),
    fontSize: fontSize.xxl + 24,
    color: colors.pink.accent,
  },
  promptText: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xl,
    color: colors.text.heading,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 28,
  },
  tallyList: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  tallyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: colors.neutral.outlineBorder,
  },
  tallyRowCorrect: {
    borderColor: colors.success.base,
    backgroundColor: colors.success.bg,
  },
  tallyLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text.heading,
    fontFamily: font('bodySemiBold'),
  },
  tallyLabelCorrect: {
    color: colors.success.dark,
  },
  tallyCount: {
    fontSize: fontSize.md,
    fontFamily: font('bodyExtraBold'),
    color: colors.text.heading,
  },
  nextUpText: {
    fontSize: fontSize.sm,
    color: colors.text.faint,
    marginTop: spacing.xl,
  },
});
