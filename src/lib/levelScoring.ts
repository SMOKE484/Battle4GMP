export const POINTS_PER_WORD = 10;
export const NO_ERROR_BONUS = 3;

/**
 * hadAnyError reflects whether the player ever typed a wrong letter this level —
 * tracked across the whole session, not just whether the final grid happens to be
 * correct — matching the proposal's framing of the bonus as mistake-free play.
 */
export function computeLevel1Score(correctWordCount: number, hadAnyError: boolean): number {
  const base = Math.max(0, correctWordCount) * POINTS_PER_WORD;
  const bonus = correctWordCount > 0 && !hadAnyError ? NO_ERROR_BONUS : 0;
  return base + bonus;
}

/**
 * Same formula as computeLevel1Score — a correct match is worth the same as a
 * correct crossword word, so Level 2 reuses the shared point constants rather than
 * duplicating magic numbers.
 */
export function computeLevel2Score(correctMatchCount: number, hadAnyError: boolean): number {
  const base = Math.max(0, correctMatchCount) * POINTS_PER_WORD;
  const bonus = correctMatchCount > 0 && !hadAnyError ? NO_ERROR_BONUS : 0;
  return base + bonus;
}

/** Same formula again — a correctly matched term is worth the same as a correct word/match. */
export function computeLevel3Score(correctTermCount: number, hadAnyError: boolean): number {
  const base = Math.max(0, correctTermCount) * POINTS_PER_WORD;
  const bonus = correctTermCount > 0 && !hadAnyError ? NO_ERROR_BONUS : 0;
  return base + bonus;
}

/**
 * Kahoot-style live-room scoring: a correct answer is worth POINTS_PER_WORD as a
 * base, plus up to another POINTS_PER_WORD that decays linearly to 0 as answerMs
 * approaches questionDurationMs — so answering instantly is worth double a
 * last-second correct answer, and any incorrect answer scores 0 regardless of
 * speed. answerMs is clamped into [0, questionDurationMs] so a late/clock-skewed
 * answer can't score negative or above the instant-answer ceiling.
 */
export function computeRoomAnswerScore(isCorrect: boolean, answerMs: number, questionDurationMs: number): number {
  if (!isCorrect) return 0;
  const clampedMs = Math.min(Math.max(answerMs, 0), questionDurationMs);
  const speedFraction = questionDurationMs > 0 ? 1 - clampedMs / questionDurationMs : 0;
  return Math.round(POINTS_PER_WORD + POINTS_PER_WORD * speedFraction);
}
