import { computeLevel1Score, computeLevel2Score, computeLevel3Score, computeRoomAnswerScore } from '../levelScoring';

describe('computeLevel1Score', () => {
  it('awards the no-error bonus for a mistake-free full solve', () => {
    expect(computeLevel1Score(6, false)).toBe(6 * 10 + 3);
  });

  it('withholds the bonus if any error occurred earlier, even with a full solve', () => {
    expect(computeLevel1Score(6, true)).toBe(6 * 10);
  });

  it('scores partial credit with no bonus when mistakes were made', () => {
    expect(computeLevel1Score(3, true)).toBe(3 * 10);
  });

  it('scores zero for zero correct words, regardless of the error flag', () => {
    expect(computeLevel1Score(0, false)).toBe(0);
    expect(computeLevel1Score(0, true)).toBe(0);
  });
});

describe('computeLevel2Score', () => {
  it('awards the no-error bonus for a mistake-free full solve', () => {
    expect(computeLevel2Score(4, false)).toBe(4 * 10 + 3);
  });

  it('withholds the bonus if any error occurred earlier, even with a full solve', () => {
    expect(computeLevel2Score(4, true)).toBe(4 * 10);
  });

  it('scores partial credit with no bonus when mistakes were made', () => {
    expect(computeLevel2Score(2, true)).toBe(2 * 10);
  });

  it('scores zero for zero correct matches, regardless of the error flag', () => {
    expect(computeLevel2Score(0, false)).toBe(0);
    expect(computeLevel2Score(0, true)).toBe(0);
  });
});

describe('computeLevel3Score', () => {
  it('awards the no-error bonus for a mistake-free full solve', () => {
    expect(computeLevel3Score(6, false)).toBe(6 * 10 + 3);
  });

  it('withholds the bonus if any error occurred earlier, even with a full solve', () => {
    expect(computeLevel3Score(6, true)).toBe(6 * 10);
  });

  it('scores partial credit with no bonus when mistakes were made', () => {
    expect(computeLevel3Score(3, true)).toBe(3 * 10);
  });

  it('scores zero for zero correct terms, regardless of the error flag', () => {
    expect(computeLevel3Score(0, false)).toBe(0);
    expect(computeLevel3Score(0, true)).toBe(0);
  });
});

describe('computeRoomAnswerScore', () => {
  it('scores zero for an incorrect answer regardless of speed', () => {
    expect(computeRoomAnswerScore(false, 0, 15000)).toBe(0);
    expect(computeRoomAnswerScore(false, 15000, 15000)).toBe(0);
  });

  it('awards the full double-points ceiling for an instant correct answer', () => {
    expect(computeRoomAnswerScore(true, 0, 15000)).toBe(20);
  });

  it('awards only the base points for a correct answer at the exact deadline', () => {
    expect(computeRoomAnswerScore(true, 15000, 15000)).toBe(10);
  });

  it('awards a linearly interpolated bonus for a correct answer partway through the window', () => {
    expect(computeRoomAnswerScore(true, 7500, 15000)).toBe(15);
  });

  it('clamps an answer reported after the deadline to the base-points floor, never below it', () => {
    expect(computeRoomAnswerScore(true, 20000, 15000)).toBe(10);
  });

  it('clamps a negative answerMs to the instant-answer ceiling, never above it', () => {
    expect(computeRoomAnswerScore(true, -500, 15000)).toBe(20);
  });
});
