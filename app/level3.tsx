import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../src/components/AppHeader';
import { BottomNav } from '../src/components/BottomNav';
import { GradientScreen } from '../src/components/ui/GradientScreen';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { GridCellCoord, WordSearchGrid } from '../src/components/wordsearch/WordSearchGrid';
import { ScenarioList } from '../src/components/wordsearch/ScenarioList';
import { InstructionStep, LevelInstructions } from '../src/components/LevelInstructions';
import { colors, font, fontSize, spacing } from '../src/theme';
import { WordSearchPuzzle, loadLevel3Puzzle } from '../src/lib/questionsService';
import { computeLevel3Score } from '../src/lib/levelScoring';
import { allFound, firstUnfoundTerm, matchTermFromSelection } from '../src/lib/wordSearchMatch';
import { submitChallengeScore } from '../src/lib/challengeService';
import { ensurePlayer } from '../src/lib/scoreSync';
import { useCorrectSound } from '../src/hooks/useCorrectSound';
import { STARTING_CLUE_TOKENS, useGameStore } from '../src/store/useGameStore';

type ScreenStatus = 'loading' | 'error' | 'ready';

const LEVEL3_INSTRUCTIONS: InstructionStep[] = [
  {
    title: 'Find the Sterility Terms',
    body: 'Each scenario below describes a sterility term hidden somewhere in the grid, running across or down. Spot one, then trace it.',
    image: { source: require('../assets/FindtheSterilityTerms.png'), width: 260, height: 154 },
  },
  {
    title: 'Slide From First Letter to Last',
    body: "Press the word's first letter and drag straight to its last letter, then release — either direction works. Get it right and it locks in green, plus its scenario checks off below. Get it wrong and the letters flash red — just try again.",
    image: { source: require("../assets/MatchDon'tJustReveal.png"), width: 260, height: 136 },
  },
  {
    title: 'Stuck? Use a Clue Token',
    body: 'Tap USE CLUE to reveal one hidden term for free. You start with 3 tokens, shared across all three levels, so spend them wisely.',
    image: { source: require('../assets/StuckUseClueTokenlvl3.png'), width: 260, height: 164 },
  },
  {
    title: "You're Ready",
    body: 'Find every term, then tap FINISH to lock in your score and see your results.',
    image: { source: require('../assets/YouReadylvl3.png'), width: 185, height: 200 },
  },
];

export default function Level3Screen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const isChallenge = typeof challengeId === 'string' && challengeId.length > 0;

  const storeClueTokens = useGameStore((s) => s.clueTokens);
  const storeHadError = useGameStore((s) => s.hadErrorThisLevel[3]);
  const storeSpendClueToken = useGameStore((s) => s.spendClueToken);
  const storeMarkError = useGameStore((s) => s.markError);
  const completeLevel = useGameStore((s) => s.completeLevel);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const hasSeenInstructions = useGameStore((s) => s.hasSeenInstructions[3]);
  const markInstructionsSeen = useGameStore((s) => s.markInstructionsSeen);
  const deviceId = useGameStore((s) => s.deviceId);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setPlayerId = useGameStore((s) => s.setPlayerId);
  const playCorrect = useCorrectSound();

  const [showInstructions, setShowInstructions] = useState(false);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [loadingText, setLoadingText] = useState('Building your word search…');
  const [puzzle, setPuzzle] = useState<WordSearchPuzzle | null>(null);
  const [foundTerms, setFoundTerms] = useState<Set<string>>(new Set());
  const [incorrectCells, setIncorrectCells] = useState<GridCellCoord[]>([]);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSelectingGrid, setIsSelectingGrid] = useState(false);

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
    (level: 3) => {
      if (isChallenge) {
        setLocalHadError(true);
        return;
      }
      storeMarkError(level);
    },
    [isChallenge, storeMarkError]
  );

  const incorrectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPuzzle = useCallback(async () => {
    setStatus('loading');
    setLoadingText('Building your word search…');
    try {
      const loaded = await loadLevel3Puzzle();
      setPuzzle(loaded);
      setFoundTerms(new Set());
      setIncorrectCells([]);
      setSubmitMessage(null);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
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

  useEffect(() => {
    return () => {
      if (incorrectTimer.current) clearTimeout(incorrectTimer.current);
    };
  }, []);

  const handleFinishInstructions = () => {
    setShowInstructions(false);
    markInstructionsSeen(3);
  };

  const terms = useMemo(() => (puzzle ? puzzle.pairs.map((p) => p.term) : []), [puzzle]);

  const handleSelectionEnd = (cells: GridCellCoord[]) => {
    if (!puzzle) return;
    const letters = cells.map(({ row, col }) => puzzle.grid.cells[row][col]);
    const matched = matchTermFromSelection(letters, terms, foundTerms);

    if (matched) {
      playCorrect();
      setFoundTerms((prev) => new Set(prev).add(matched));
    } else {
      markError(3);
      if (incorrectTimer.current) clearTimeout(incorrectTimer.current);
      setIncorrectCells(cells);
      incorrectTimer.current = setTimeout(() => setIncorrectCells([]), 600);
    }
  };

  const handleUseClue = () => {
    const target = firstUnfoundTerm(terms, foundTerms);
    if (!target) return;
    if (!spendClueToken()) return;
    setFoundTerms((prev) => new Set(prev).add(target));
  };

  const hasUnsolvedTerm = firstUnfoundTerm(terms, foundTerms) !== null;

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
      const result = await submitChallengeScore(submitterId, challengeId, 3, score, tokensUsed);
      setChallengeSubmitting(false);
      if (!result.ok) {
        setChallengeSubmitError(
          "Your score didn't save — we couldn't reach the server. Your found terms are still saved, so it's safe to retry."
        );
        return;
      }
      router.replace({ pathname: '/challenge/[id]', params: { id: challengeId } });
    },
    [challengeId, playerId, deviceId, displayName, localClueTokens, router, setPlayerId]
  );

  const handleSubmit = () => {
    if (!allFound(terms, foundTerms)) {
      setSubmitMessage('A few scenarios still need matching — check the ones without a checkmark below.');
      return;
    }
    setSubmitMessage(null);
    const score = computeLevel3Score(terms.length, hadError);

    if (isChallenge) {
      void submitChallengeRun(score);
      return;
    }

    void completeLevel(3, score).then(() => {
      router.push('/grand-reward');
    });
  };

  return (
    <GradientScreen>
      <AppHeader />

      <LevelInstructions
        visible={showInstructions}
        steps={LEVEL3_INSTRUCTIONS}
        onFinish={handleFinishInstructions}
        canSkip={hasSeenInstructions}
      />

      {status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.level3.fg} size="small" />
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Couldn't load this level</Text>
          <Text style={styles.errorBody}>
            Something went wrong building this level's word search. This isn't a connection issue — please try again,
            and let us know if it keeps happening.
          </Text>
          <Button label="Retry" onPress={() => void loadPuzzle()} style={styles.retryButton} />
        </View>
      ) : (
        puzzle && (
          <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={!isSelectingGrid}>
            <View style={styles.headingRow}>
              <Text style={styles.levelBadge}>LEVEL 3 · 3</Text>
              <View style={styles.headingRight}>
                <View style={styles.hint}>
                  <Feather name="key" size={11} color={colors.purple.muted} />
                  <Text style={styles.hintText}>reveals a term</Text>
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
            <Text style={styles.title}>Sterility — Word Search</Text>
            <Text style={styles.subtitle}>Slide from a word's first letter to its last to find it.</Text>

            {isChallenge ? (
              <View style={styles.challengeBadge}>
                <Feather name="users" size={12} color={colors.purple.primary} />
                <Text style={styles.challengeBadgeText}>Challenge attempt · {clueTokens} clue tokens</Text>
              </View>
            ) : null}

            <Card style={styles.gridCard}>
              <WordSearchGrid
                grid={puzzle.grid}
                foundTerms={foundTerms}
                incorrectCells={incorrectCells}
                onSelectionEnd={handleSelectionEnd}
                onDragActiveChange={setIsSelectingGrid}
              />
            </Card>

            <Text style={styles.sectionLabel}>SCENARIOS</Text>
            <ScenarioList pairs={puzzle.pairs} foundTerms={foundTerms} />

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
                <Pressable onPress={() => void submitChallengeRun(computeLevel3Score(terms.length, hadError))}>
                  <Text style={styles.retryLink}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button
                label="USE CLUE"
                variant="secondary"
                onPress={handleUseClue}
                disabled={clueTokens <= 0 || !hasUnsolvedTerm}
                flex={1}
              />
              <Button
                label={challengeSubmitting ? 'SUBMITTING…' : 'FINISH →'}
                onPress={handleSubmit}
                loading={challengeSubmitting}
                flex={1.4}
              />
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
    backgroundColor: colors.level3.bg,
    color: colors.level3.fg,
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
  gridCard: {
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.level3.fg,
    fontFamily: font('bodyExtraBold'),
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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
});
