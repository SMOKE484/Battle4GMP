import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../src/components/AppHeader';
import { BottomNav } from '../src/components/BottomNav';
import { GradientScreen } from '../src/components/ui/GradientScreen';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { CrosswordGrid, CellState, cellKey } from '../src/components/crossword/CrosswordGrid';
import { ClueList } from '../src/components/crossword/ClueList';
import { InstructionStep, LevelInstructions } from '../src/components/LevelInstructions';
import { colors, font, fontSize, spacing } from '../src/theme';
import { CrosswordPuzzle, loadLevel1Puzzle } from '../src/lib/questionsService';
import { computeLevel1Score } from '../src/lib/levelScoring';
import { newlyCompletedWords } from '../src/lib/wordCompletion';
import { submitChallengeScore } from '../src/lib/challengeService';
import { ensurePlayer } from '../src/lib/scoreSync';
import { useCorrectSound } from '../src/hooks/useCorrectSound';
import { STARTING_CLUE_TOKENS, useGameStore } from '../src/store/useGameStore';

type ScreenStatus = 'loading' | 'error' | 'ready';

const LEVEL1_INSTRUCTIONS: InstructionStep[] = [
  {
    title: 'Fill the ALCOA+ Crossword',
    body: 'Solve the grid using the data-integrity clues listed below it — each answer is a term from the ALCOA+ principles.',
    image: { source: require('../assets/instructions-goal.png'), width: 235, height: 190 },
  },
  {
    title: 'Type to Fill In Letters',
    body: "Tap any cell and type a letter. Get it right and the cell locks in green immediately. Get it wrong and it flashes red — just try again.",
    image: { source: require('../assets/instructions-typing.png'), width: 166, height: 190 },
  },
  {
    title: 'Stuck? Use a Clue Token',
    body: 'Tap USE CLUE to reveal one letter for free. You start with 3 tokens, shared across all three levels, so spend them wisely.',
    image: { source: require('../assets/instructions-clue.png'), width: 156, height: 190 },
  },
  {
    title: "You're Ready",
    body: 'Fill in every word correctly, then tap SUBMIT to lock in your score and move on to Level 2.',
    image: { source: require('../assets/instructions-ready.png'), width: 240, height: 130 },
  },
];

export default function Level1Screen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const isChallenge = typeof challengeId === 'string' && challengeId.length > 0;

  const storeClueTokens = useGameStore((s) => s.clueTokens);
  const storeHadError = useGameStore((s) => s.hadErrorThisLevel[1]);
  const storeSpendClueToken = useGameStore((s) => s.spendClueToken);
  const storeMarkError = useGameStore((s) => s.markError);
  const completeLevel = useGameStore((s) => s.completeLevel);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const hasSeenInstructions = useGameStore((s) => s.hasSeenInstructions[1]);
  const markInstructionsSeen = useGameStore((s) => s.markInstructionsSeen);
  const deviceId = useGameStore((s) => s.deviceId);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setPlayerId = useGameStore((s) => s.setPlayerId);
  const playCorrect = useCorrectSound();

  const [showInstructions, setShowInstructions] = useState(false);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [loadingText, setLoadingText] = useState('Generating your crossword…');
  const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [lockedCells, setLockedCells] = useState<Set<string>>(new Set());
  const [incorrectCells, setIncorrectCells] = useState<Set<string>>(new Set());
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

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
    (level: 1) => {
      if (isChallenge) {
        setLocalHadError(true);
        return;
      }
      storeMarkError(level);
    },
    [isChallenge, storeMarkError]
  );

  const loadPuzzle = useCallback(async () => {
    setStatus('loading');
    setLoadingText('Generating your crossword…');
    try {
      const loaded = await loadLevel1Puzzle();
      setPuzzle(loaded);
      setValues({});
      setLockedCells(new Set());
      setIncorrectCells(new Set());
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

  const handleFinishInstructions = () => {
    setShowInstructions(false);
    markInstructionsSeen(1);
  };

  const handleChangeCell = useCallback(
    (row: number, col: number, letter: string) => {
      if (!puzzle) return;
      const key = cellKey(row, col);

      if (!letter) {
        setValues((v) => ({ ...v, [key]: '' }));
        setIncorrectCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }

      const expected = puzzle.grid.cells[row][col]?.letter;
      setValues((v) => ({ ...v, [key]: letter }));

      if (letter === expected) {
        const nowLocked = new Set(lockedCells).add(key);
        if (newlyCompletedWords(puzzle.grid.words, lockedCells, nowLocked).length > 0) {
          playCorrect();
        }
        setLockedCells(nowLocked);
        setIncorrectCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        setIncorrectCells((prev) => new Set(prev).add(key));
        markError(1);
      }
    },
    [puzzle, markError, lockedCells, playCorrect]
  );

  const cellState = useCallback(
    (row: number, col: number): CellState => {
      const key = cellKey(row, col);
      if (lockedCells.has(key)) return 'locked';
      if (incorrectCells.has(key)) return 'incorrect';
      return 'default';
    },
    [lockedCells, incorrectCells]
  );

  const isWordSolved = useCallback(
    (wordStr: string): boolean => {
      if (!puzzle) return false;
      const word = puzzle.grid.words.find((w) => w.word === wordStr);
      if (!word) return false;
      for (let k = 0; k < word.word.length; k++) {
        const r = word.direction === 'across' ? word.row : word.row + k;
        const c = word.direction === 'across' ? word.col + k : word.col;
        if (!lockedCells.has(cellKey(r, c))) return false;
      }
      return true;
    },
    [puzzle, lockedCells]
  );

  const hasRevealableCell = useMemo(() => {
    if (!puzzle) return false;
    for (let r = 0; r < puzzle.grid.rows; r++) {
      for (let c = 0; c < puzzle.grid.cols; c++) {
        const cell = puzzle.grid.cells[r][c];
        if (cell && !lockedCells.has(cellKey(r, c))) return true;
      }
    }
    return false;
  }, [puzzle, lockedCells]);

  const handleUseClue = () => {
    if (!puzzle) return;
    for (let r = 0; r < puzzle.grid.rows; r++) {
      for (let c = 0; c < puzzle.grid.cols; c++) {
        const cell = puzzle.grid.cells[r][c];
        if (!cell) continue;
        const key = cellKey(r, c);
        if (lockedCells.has(key)) continue;

        if (!spendClueToken()) return;
        setValues((v) => ({ ...v, [key]: cell.letter }));
        setLockedCells((prev) => new Set(prev).add(key));
        setIncorrectCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }
    }
  };

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
      const result = await submitChallengeScore(submitterId, challengeId, 1, score, tokensUsed);
      setChallengeSubmitting(false);
      if (!result.ok) {
        setChallengeSubmitError(
          "Your score didn't save — we couldn't reach the server. Your puzzle is still solved, so it's safe to retry."
        );
        return;
      }
      router.replace({ pathname: '/challenge/[id]', params: { id: challengeId } });
    },
    [challengeId, playerId, deviceId, displayName, localClueTokens, router, setPlayerId]
  );

  const handleSubmit = () => {
    if (!puzzle) return;
    const allCorrect = puzzle.grid.words.every((w) => isWordSolved(w.word));
    if (!allCorrect) {
      setSubmitMessage('A few letters still need fixing — check the cells highlighted in red, or fill in any that are blank.');
      return;
    }
    setSubmitMessage(null);
    const score = computeLevel1Score(puzzle.grid.words.length, hadError);

    if (isChallenge) {
      void submitChallengeRun(score);
      return;
    }

    void completeLevel(1, score).then(() => {
      router.push('/level2');
    });
  };

  return (
    <GradientScreen>
      <AppHeader />

      <LevelInstructions
        visible={showInstructions}
        steps={LEVEL1_INSTRUCTIONS}
        onFinish={handleFinishInstructions}
        canSkip={hasSeenInstructions}
      />

      {status === 'loading' ? (
        <View style={styles.centered}>
          <Image
            source={require('../assets/crossword.png')}
            style={styles.loadingImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <ActivityIndicator color={colors.purple.primary} size="small" style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={32} color={colors.purple.muted} />
          <Text style={styles.errorTitle}>Couldn't load this level</Text>
          <Text style={styles.errorBody}>
            Something went wrong building this level's puzzle. This isn't a connection issue — please try again, and let
            us know if it keeps happening.
          </Text>
          <Button label="Retry" onPress={() => void loadPuzzle()} style={styles.retryButton} />
        </View>
      ) : (
        puzzle && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.headingRow}>
              <Text style={styles.levelBadge}>LEVEL 1 · 3</Text>
              <View style={styles.headingRight}>
                <View style={styles.hint}>
                  <Feather name="key" size={11} color={colors.purple.muted} />
                  <Text style={styles.hintText}>reveals a letter</Text>
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
            <Text style={styles.title}>Data Integrity — ALCOA+</Text>
            <Text style={styles.subtitle}>Fill the grid with the data-integrity terms.</Text>

            {isChallenge ? (
              <View style={styles.challengeBadge}>
                <Feather name="users" size={12} color={colors.purple.primary} />
                <Text style={styles.challengeBadgeText}>Challenge attempt · {clueTokens} clue tokens</Text>
              </View>
            ) : null}

            <Card style={styles.gridCard}>
              <CrosswordGrid grid={puzzle.grid} values={values} cellState={cellState} onChangeCell={handleChangeCell} />
            </Card>

            <View style={styles.clueListWrap}>
              <ClueList words={puzzle.grid.words} isSolved={isWordSolved} />
            </View>

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
                <Pressable onPress={() => void submitChallengeRun(computeLevel1Score(puzzle.grid.words.length, hadError))}>
                  <Text style={styles.retryLink}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button
                label="USE CLUE"
                variant="secondary"
                onPress={handleUseClue}
                disabled={clueTokens <= 0 || !hasRevealableCell}
                flex={1}
              />
              <Button
                label={challengeSubmitting ? 'SUBMITTING…' : 'SUBMIT →'}
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
  loadingImage: {
    width: 150,
    height: 143,
  },
  loadingSpinner: {
    marginTop: spacing.sm,
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
    backgroundColor: colors.level1.bg,
    color: colors.level1.fg,
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
  clueListWrap: {
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
