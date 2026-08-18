import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { AnimatedRef, useAnimatedRef, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { AppHeader } from '../src/components/AppHeader';
import { BottomNav } from '../src/components/BottomNav';
import { GradientScreen } from '../src/components/ui/GradientScreen';
import { Button } from '../src/components/ui/Button';
import { CardRefEntry, RoleChip } from '../src/components/personnel/RoleChip';
import { DefinitionCard } from '../src/components/personnel/DefinitionCard';
import { InstructionStep, LevelInstructions } from '../src/components/LevelInstructions';
import { colors, font, fontSize, radius, spacing } from '../src/theme';
import { PersonnelPuzzle, loadLevel2Puzzle } from '../src/lib/questionsService';
import { computeLevel2Score } from '../src/lib/levelScoring';
import {
  MatchState,
  PersonnelPair,
  allCorrect,
  applyDrop,
  availableTermIds,
  firstUnsolvedDefId,
  isMatchCorrect,
} from '../src/lib/personnelMatch';
import { submitChallengeScore } from '../src/lib/challengeService';
import { ensurePlayer } from '../src/lib/scoreSync';
import { useCorrectSound } from '../src/hooks/useCorrectSound';
import { STARTING_CLUE_TOKENS, useGameStore } from '../src/store/useGameStore';

type ScreenStatus = 'loading' | 'error' | 'ready';

const LEVEL2_INSTRUCTIONS: InstructionStep[] = [
  {
    title: 'Match Roles to Responsibilities',
    body: 'Each role chip belongs with one responsibility card below it — drag it onto the card it describes.',
    image: { source: require('../assets/MatchRolestoResponsibilities.png'), width: 260, height: 150 },
  },
  {
    title: 'Drag to Place',
    body: 'Press and hold a role chip, drag it onto a responsibility card, and let go. Get it right and the card locks in green — get it wrong and it flashes red, so just drag it off and try again.',
    image: { source: require('../assets/DragtoPlace.png'), width: 260, height: 188 },
  },
  {
    title: 'Stuck? Use a Clue Token',
    body: 'Tap USE CLUE to reveal one correct match for free. You start with 3 tokens, shared across all three levels, so spend them wisely.',
    image: { source: require('../assets/StuckUseClueTokenlvl2.png'), width: 260, height: 207 },
  },
  {
    title: "You're Ready",
    body: 'Match every role correctly, then tap SUBMIT to lock in your score and move on to Level 3.',
    image: { source: require('../assets/YouReadylvl2.png'), width: 260, height: 177 },
  },
];

function shuffledOrder(ids: string[]): string[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export default function Level2Screen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const isChallenge = typeof challengeId === 'string' && challengeId.length > 0;

  const storeClueTokens = useGameStore((s) => s.clueTokens);
  const storeHadError = useGameStore((s) => s.hadErrorThisLevel[2]);
  const storeSpendClueToken = useGameStore((s) => s.spendClueToken);
  const storeMarkError = useGameStore((s) => s.markError);
  const completeLevel = useGameStore((s) => s.completeLevel);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const hasSeenInstructions = useGameStore((s) => s.hasSeenInstructions[2]);
  const markInstructionsSeen = useGameStore((s) => s.markInstructionsSeen);
  const deviceId = useGameStore((s) => s.deviceId);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setPlayerId = useGameStore((s) => s.setPlayerId);
  const playCorrect = useCorrectSound();

  const [showInstructions, setShowInstructions] = useState(false);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [loadingText, setLoadingText] = useState('Preparing your personnel matches…');
  const [puzzle, setPuzzle] = useState<PersonnelPuzzle | null>(null);
  const [pairs, setPairs] = useState<PersonnelPair[]>([]);
  const [chipOrder, setChipOrder] = useState<string[]>([]);
  const [matches, setMatches] = useState<MatchState>({});
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [draggingTermId, setDraggingTermId] = useState<string | null>(null);
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);

  // A challenge attempt is a parallel scored run — it must not drain the
  // player's persisted solo clue tokens or mark their solo hadError flag, so
  // it gets its own fresh, attempt-scoped counters instead of the store's.
  const [localClueTokens, setLocalClueTokens] = useState(STARTING_CLUE_TOKENS);
  const [localHadError, setLocalHadError] = useState(false);
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);
  const [challengeSubmitError, setChallengeSubmitError] = useState<string | null>(null);

  const clueTokens = isChallenge ? localClueTokens : storeClueTokens;
  const hadError = isChallenge ? localHadError : storeHadError;

  const spendClueToken = useCallback(() => {
    if (isChallenge) {
      if (localClueTokens <= 0) return false;
      setLocalClueTokens((t) => t - 1);
      return true;
    }
    return storeSpendClueToken();
  }, [isChallenge, localClueTokens, storeSpendClueToken]);

  const markError = useCallback(
    (level: 2) => {
      if (isChallenge) {
        setLocalHadError(true);
        return;
      }
      storeMarkError(level);
    },
    [isChallenge, storeMarkError]
  );

  const screenRef = useAnimatedRef<View>();
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const cardRefsMap = useRef(new Map<string, AnimatedRef<View>>()).current;
  const [cardRefsVersion, setCardRefsVersion] = useState(0);

  const registerCardRef = useCallback((id: string, ref: AnimatedRef<View>) => {
    cardRefsMap.set(id, ref);
    setCardRefsVersion((v) => v + 1);
  }, [cardRefsMap]);

  const cardEntries: CardRefEntry[] = useMemo(
    () => Array.from(cardRefsMap.entries()).map(([id, ref]) => ({ id, ref })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardRefsVersion]
  );

  const loadPuzzle = useCallback(async () => {
    setStatus('loading');
    setLoadingText('Preparing your personnel matches…');
    cardRefsMap.clear();
    setCardRefsVersion((v) => v + 1);
    try {
      const loaded = await loadLevel2Puzzle();
      const nextPairs: PersonnelPair[] = loaded.pairs.map((p, i) => ({
        defId: `def-${i}`,
        termId: `term-${i}`,
        term: p.term,
        definition: p.definition,
      }));
      setPuzzle(loaded);
      setPairs(nextPairs);
      setChipOrder(shuffledOrder(nextPairs.map((p) => p.termId)));
      setMatches(Object.fromEntries(nextPairs.map((p) => [p.defId, null])));
      setSubmitMessage(null);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setLoadingText('Almost ready…'), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    // The overlay shows on every visit, not just the first — a player can
    // always be reminded how the level works. Gated on hasHydrated purely so
    // hasSeenInstructions has already loaded from storage before the overlay
    // renders, so a returning player's Skip button is there from the first
    // frame instead of popping in a moment later. The puzzle loads in
    // parallel regardless, so dismissing the overlay (Skip or Finish) never
    // adds an extra wait on top of it.
    if (!hasHydrated) return;
    setShowInstructions(true);
    void loadPuzzle();
  }, [hasHydrated, loadPuzzle]);

  const handleFinishInstructions = () => {
    setShowInstructions(false);
    markInstructionsSeen(2);
  };

  const handleDragStart = useCallback((termId: string, label: string) => {
    setDraggingTermId(termId);
    setDraggingLabel(label);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingTermId(null);
    setDraggingLabel(null);
  }, []);

  const handleDrop = useCallback(
    (termId: string, cardId: string | null) => {
      setMatches((prev) => applyDrop(prev, termId, cardId));
      if (cardId) {
        const pair = pairs.find((p) => p.defId === cardId);
        if (!pair || pair.termId !== termId) {
          markError(2);
        } else {
          playCorrect();
        }
      }
    },
    [pairs, markError, playCorrect]
  );

  const handleUseClue = () => {
    const targetDefId = firstUnsolvedDefId(pairs, matches);
    if (!targetDefId) return;
    const pair = pairs.find((p) => p.defId === targetDefId);
    if (!pair) return;
    if (!spendClueToken()) return;
    setMatches((prev) => applyDrop(prev, pair.termId, targetDefId));
  };

  const hasUnsolvedCard = useMemo(() => firstUnsolvedDefId(pairs, matches) !== null, [pairs, matches]);
  const available = useMemo(() => new Set(availableTermIds(pairs, matches)), [pairs, matches]);

  const submitChallengeRun = useCallback(
    async (score: number) => {
      if (!challengeId) return;
      setChallengeSubmitting(true);
      setChallengeSubmitError(null);

      let submitterId = playerId;
      if (!submitterId) {
        if (!deviceId) {
          setChallengeSubmitting(false);
          setChallengeSubmitError("Couldn't identify this device — please retry.");
          return;
        }
        const playerResult = await ensurePlayer(deviceId, displayName ?? undefined);
        if (!playerResult.ok) {
          setChallengeSubmitting(false);
          setChallengeSubmitError("Couldn't reach the server — check your connection and try again.");
          return;
        }
        submitterId = playerResult.playerId;
        setPlayerId(submitterId);
      }

      const tokensUsed = STARTING_CLUE_TOKENS - localClueTokens;
      const result = await submitChallengeScore(submitterId, challengeId, 2, score, tokensUsed);
      setChallengeSubmitting(false);
      if (!result.ok) {
        setChallengeSubmitError(
          "Your score didn't save — we couldn't reach the server. Your matches are still saved, so it's safe to retry."
        );
        return;
      }
      router.replace({ pathname: '/challenge/[id]', params: { id: challengeId } });
    },
    [challengeId, playerId, deviceId, displayName, localClueTokens, router, setPlayerId]
  );

  const handleSubmit = () => {
    if (!allCorrect(pairs, matches)) {
      setSubmitMessage('A few matches still need fixing — check the cards highlighted in red, or fill in any left empty.');
      return;
    }
    setSubmitMessage(null);
    const score = computeLevel2Score(pairs.length, hadError);

    if (isChallenge) {
      void submitChallengeRun(score);
      return;
    }

    void completeLevel(2, score).then(() => {
      router.push('/level3');
    });
  };

  const ghostAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }],
  }));

  return (
    <GradientScreen>
      <AppHeader />

      <LevelInstructions
        visible={showInstructions}
        steps={LEVEL2_INSTRUCTIONS}
        onFinish={handleFinishInstructions}
        canSkip={hasSeenInstructions}
      />

      {status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.level2.fg} size="small" />
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Couldn't load this level</Text>
          <Text style={styles.errorBody}>
            Something went wrong building this level's matches. This isn't a connection issue — please try again, and let
            us know if it keeps happening.
          </Text>
          <Button label="Retry" onPress={() => void loadPuzzle()} style={styles.retryButton} />
        </View>
      ) : (
        puzzle && (
          <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={draggingTermId === null}>
            <View ref={screenRef} style={styles.anchor}>
              <View style={styles.headingRow}>
                <Text style={styles.levelBadge}>LEVEL 2 · 3</Text>
                <View style={styles.headingRight}>
                  <View style={styles.hint}>
                    <Feather name="key" size={11} color={colors.purple.muted} />
                    <Text style={styles.hintText}>reveals a match</Text>
                  </View>
                  <Pressable
                    onPress={() => setShowInstructions(true)}
                    style={styles.helpButton}
                    accessibilityRole="button"
                    accessibilityLabel="Show how to play"
                  >
                    <Feather name="help-circle" size={18} color={colors.purple.muted} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.title}>Personnel — Drag the Roles</Text>
              <Text style={styles.subtitle}>Drag each role onto its matching responsibility.</Text>

              {isChallenge ? (
                <View style={styles.challengeBadge}>
                  <Feather name="users" size={12} color={colors.purple.primary} />
                  <Text style={styles.challengeBadgeText}>Challenge attempt · {clueTokens} clue tokens</Text>
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>ROLES</Text>
              <View style={styles.pool}>
                {chipOrder
                  .filter((termId) => available.has(termId))
                  .map((termId) => {
                    const pair = pairs.find((p) => p.termId === termId);
                    if (!pair) return null;
                    return (
                      <RoleChip
                        key={termId}
                        termId={termId}
                        label={pair.term}
                        variant="pool"
                        isDragging={draggingTermId === termId}
                        cardEntries={cardEntries}
                        screenRef={screenRef}
                        dragX={dragX}
                        dragY={dragY}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDrop}
                      />
                    );
                  })}
                {available.size === 0 ? <Text style={styles.poolEmptyText}>All roles placed</Text> : null}
              </View>

              <Text style={styles.sectionLabel}>RESPONSIBILITIES</Text>
              {pairs.map((pair) => {
                const placedTermId = matches[pair.defId] ?? null;
                const placedPair = placedTermId ? pairs.find((p) => p.termId === placedTermId) : null;
                return (
                  <DefinitionCard
                    key={pair.defId}
                    id={pair.defId}
                    definitionText={pair.definition}
                    placedTermId={placedTermId}
                    placedLabel={placedPair?.term ?? null}
                    isCorrect={isMatchCorrect(pair.defId, matches, pairs)}
                    isDraggingPlacedChip={draggingTermId !== null && draggingTermId === placedTermId}
                    onRegisterRef={registerCardRef}
                    cardEntries={cardEntries}
                    screenRef={screenRef}
                    dragX={dragX}
                    dragY={dragY}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDrop={handleDrop}
                  />
                );
              })}

              {submitMessage ? (
                <View style={styles.submitNotice}>
                  <Feather name="alert-circle" size={14} color={colors.error.text} />
                  <Text style={styles.submitNoticeText}>{submitMessage}</Text>
                </View>
              ) : null}

              {challengeSubmitError ? (
                <View style={styles.submitNotice}>
                  <Feather name="alert-circle" size={14} color={colors.error.text} />
                  <Text style={styles.submitNoticeText}>{challengeSubmitError}</Text>
                  <Pressable onPress={() => void submitChallengeRun(computeLevel2Score(pairs.length, hadError))}>
                    <Text style={styles.retryLink}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Button
                  label="USE CLUE"
                  variant="secondary"
                  onPress={handleUseClue}
                  disabled={clueTokens <= 0 || !hasUnsolvedCard}
                  flex={1}
                />
                <Button
                  label={challengeSubmitting ? 'SUBMITTING…' : 'SUBMIT →'}
                  onPress={handleSubmit}
                  loading={challengeSubmitting}
                  flex={1.4}
                />
              </View>

              <Animated.View pointerEvents="none" style={[styles.ghost, ghostAnimatedStyle, { opacity: draggingTermId ? 1 : 0 }]}>
                <View style={styles.ghostChip}>
                  <Text style={styles.ghostLabel}>{draggingLabel ?? ''}</Text>
                </View>
              </Animated.View>
            </View>
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
  },
  anchor: {
    // Reference frame the drag ghost is measured against — see RoleChip's onEnd
    // hit-test, which composes coordinates relative to this view's measure().
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  levelBadge: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    backgroundColor: colors.level2.bg,
    color: colors.level2.fg,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    overflow: 'hidden',
  },
  headingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hintText: {
    fontSize: fontSize.sm,
    color: colors.purple.muted,
  },
  helpButton: {
    padding: 2,
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
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.level2.fg,
    fontFamily: font('bodyExtraBold'),
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  pool: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 40,
  },
  poolEmptyText: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    fontStyle: 'italic',
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
  retryLink: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.purple.primary,
  },
  challengeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: colors.neutral.inputBg,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  challengeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.purple.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1000,
    elevation: 20,
  },
  ghostChip: {
    backgroundColor: colors.neutral.white,
    borderWidth: 2,
    borderColor: colors.level2.fg,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.md + 2,
    shadowColor: colors.level2.fg,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  ghostLabel: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.level2.fg,
    fontFamily: font('bodyExtraBold'),
  },
});
