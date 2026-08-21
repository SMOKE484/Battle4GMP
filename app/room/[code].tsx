import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { LeaderboardList, LeaderboardEntry } from '../../src/components/challenge/LeaderboardList';
import { colors, font, fontSize, radius, spacing } from '../../src/theme';
import {
  advancePhase,
  getQuestionAnswerTally,
  getRoomByCode,
  getRoomLeaderboard,
  subscribeToPresence,
  subscribeToRoom,
} from '../../src/lib/roomService';
import { sendInvite } from '../../src/lib/inviteService';
import { McqQuestion } from '../../src/lib/mcqService';
import { ChallengeRoomRow } from '../../src/types/database';
import { useGameStore } from '../../src/store/useGameStore';

type ScreenStatus = 'loading' | 'error' | 'not_found' | 'ready';

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export default function HostRoomScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const onlinePlayers = useGameStore((s) => s.onlinePlayers);

  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [room, setRoom] = useState<ChallengeRoomRow | null>(null);
  const [presenceNames, setPresenceNames] = useState<string[]>([]);
  const [tally, setTally] = useState<[number, number, number, number] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [invitedPlayerIds, setInvitedPlayerIds] = useState<Set<string>>(new Set());

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
    const unsubRoom = subscribeToRoom(roomId, (updated) => setRoom(updated));
    const unsubPresence = subscribeToPresence(roomId, playerId ?? 'host', displayName ?? 'Host', setPresenceNames);
    return () => {
      unsubRoom();
      unsubPresence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const isHost = !!playerId && !!room && playerId === room.host_player_id;
  const questions = useMemo(() => (room?.question_set as McqQuestion[] | undefined) ?? [], [room?.question_set]);
  const currentQuestion: McqQuestion | undefined = room ? questions[room.current_question_index] : undefined;
  const isLastQuestion = room ? room.current_question_index >= questions.length - 1 : false;

  const phaseDeadline = room ? new Date(room.phase_started_at).getTime() + room.question_duration_ms : 0;
  const secondsLeft = Math.max(0, Math.ceil((phaseDeadline - now) / 1000));

  useEffect(() => {
    if (!room || room.phase !== 'question') return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [room?.phase, room?.id]);

  // Host auto-advances to reveal once the countdown runs out — nobody has to
  // tap anything for the room to keep moving, though "Reveal now" still lets
  // the host cut a question short.
  useEffect(() => {
    if (!room || !isHost || room.phase !== 'question') return;
    if (now < phaseDeadline) return;
    void advancePhase(room.id, 'reveal');
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
    if (!room || (room.phase !== 'leaderboard' && room.phase !== 'ended')) return;
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

  const handleStart = () => room && void advancePhase(room.id, 'question', 0);
  const handleRevealNow = () => room && void advancePhase(room.id, 'reveal');
  const handleShowLeaderboard = () => room && void advancePhase(room.id, 'leaderboard');
  const handleNextQuestion = () =>
    room && void advancePhase(room.id, isLastQuestion ? 'ended' : 'question', isLastQuestion ? undefined : room.current_question_index + 1);

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

                {isHost ? <Button label="START →" onPress={handleStart} style={styles.actionButton} /> : null}
              </View>
            ) : room.phase === 'question' ? (
              <View style={styles.centered}>
                <Text style={styles.eyebrow}>
                  QUESTION {room.current_question_index + 1} OF {questions.length}
                </Text>
                <Text style={styles.countdown}>{secondsLeft}</Text>
                <Text style={styles.promptText}>{currentQuestion?.prompt}</Text>
                <Text style={styles.subtitle}>Answer on your phone now — options aren't shown here on purpose.</Text>
                {isHost ? <Button label="Reveal Now" variant="secondary" onPress={handleRevealNow} style={styles.actionButton} /> : null}
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
                {isHost ? <Button label="Show Leaderboard →" onPress={handleShowLeaderboard} style={styles.actionButton} /> : null}
              </View>
            ) : room.phase === 'leaderboard' ? (
              <View>
                <Text style={styles.sectionLabel}>LEADERBOARD</Text>
                {leaderboard.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No answers yet.</Text>
                  </Card>
                ) : (
                  <LeaderboardList rows={leaderboard} />
                )}
                {isHost ? (
                  <Button
                    label={isLastQuestion ? 'End Room →' : 'Next Question →'}
                    onPress={handleNextQuestion}
                    style={styles.actionButton}
                  />
                ) : null}
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
});
