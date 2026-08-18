import {
  MatchState,
  PersonnelPair,
  allCorrect,
  allMatched,
  applyDrop,
  availableTermIds,
  firstUnsolvedDefId,
  isMatchCorrect,
} from '../personnelMatch';

const pairs: PersonnelPair[] = [
  { defId: 'def-0', termId: 'term-0', term: 'GRADE B GOWNING', definition: 'd0' },
  { defId: 'def-1', termId: 'term-1', term: 'DISQUALIFICATION', definition: 'd1' },
  { defId: 'def-2', termId: 'term-2', term: 'GRADE C GOWNING', definition: 'd2' },
];

describe('isMatchCorrect', () => {
  it('is false when nothing is placed on the card', () => {
    expect(isMatchCorrect('def-0', {}, pairs)).toBe(false);
  });

  it('is true when the placed term matches the card', () => {
    const matches: MatchState = { 'def-0': 'term-0' };
    expect(isMatchCorrect('def-0', matches, pairs)).toBe(true);
  });

  it('is false when the placed term is a different pair', () => {
    const matches: MatchState = { 'def-0': 'term-1' };
    expect(isMatchCorrect('def-0', matches, pairs)).toBe(false);
  });

  it('is false for an unknown defId', () => {
    expect(isMatchCorrect('def-nope', { 'def-nope': 'term-0' }, pairs)).toBe(false);
  });
});

describe('availableTermIds', () => {
  it('returns every term when nothing is placed', () => {
    expect(availableTermIds(pairs, {})).toEqual(['term-0', 'term-1', 'term-2']);
  });

  it('excludes a term placed anywhere, correct or not', () => {
    const matches: MatchState = { 'def-0': 'term-1' }; // wrong pairing, still "placed"
    expect(availableTermIds(pairs, matches)).toEqual(['term-0', 'term-2']);
  });

  it('returns an empty array once every term is placed', () => {
    const matches: MatchState = { 'def-0': 'term-0', 'def-1': 'term-1', 'def-2': 'term-2' };
    expect(availableTermIds(pairs, matches)).toEqual([]);
  });
});

describe('allMatched / allCorrect', () => {
  it('allMatched is false while any card is empty', () => {
    const matches: MatchState = { 'def-0': 'term-0', 'def-1': null, 'def-2': 'term-2' };
    expect(allMatched(pairs, matches)).toBe(false);
  });

  it('allMatched is true once every card holds some term, even if wrong', () => {
    const matches: MatchState = { 'def-0': 'term-1', 'def-1': 'term-0', 'def-2': 'term-2' };
    expect(allMatched(pairs, matches)).toBe(true);
    expect(allCorrect(pairs, matches)).toBe(false);
  });

  it('allCorrect is true only when every card holds its correct term', () => {
    const matches: MatchState = { 'def-0': 'term-0', 'def-1': 'term-1', 'def-2': 'term-2' };
    expect(allCorrect(pairs, matches)).toBe(true);
  });
});

describe('applyDrop', () => {
  it('places a chip from the pool onto an empty card', () => {
    const next = applyDrop({}, 'term-0', 'def-0');
    expect(next).toEqual({ 'def-0': 'term-0' });
  });

  it('bumps whatever chip already occupied the card, freeing it back to the pool', () => {
    const matches: MatchState = { 'def-0': 'term-1' };
    const next = applyDrop(matches, 'term-0', 'def-0');
    expect(next).toEqual({ 'def-0': 'term-0' });
    expect(availableTermIds(pairs, next)).toContain('term-1');
  });

  it('moves a placed chip from one card to another', () => {
    const matches: MatchState = { 'def-0': 'term-0', 'def-1': null };
    const next = applyDrop(matches, 'term-0', 'def-1');
    expect(next).toEqual({ 'def-0': null, 'def-1': 'term-0' });
  });

  it('returns a placed chip to the pool when dropped on empty space (cardId null)', () => {
    const matches: MatchState = { 'def-0': 'term-0' };
    const next = applyDrop(matches, 'term-0', null);
    expect(next).toEqual({ 'def-0': null });
  });

  it('dropping a chip back onto the same card it already occupies is a no-op', () => {
    const matches: MatchState = { 'def-0': 'term-0' };
    const next = applyDrop(matches, 'term-0', 'def-0');
    expect(next).toEqual({ 'def-0': 'term-0' });
  });
});

describe('firstUnsolvedDefId', () => {
  it('returns null once every card is correctly matched', () => {
    const matches: MatchState = { 'def-0': 'term-0', 'def-1': 'term-1', 'def-2': 'term-2' };
    expect(firstUnsolvedDefId(pairs, matches)).toBeNull();
  });

  it('returns the first def id that is empty or incorrect, in pair order', () => {
    const matches: MatchState = { 'def-0': 'term-0', 'def-1': null, 'def-2': 'term-0' };
    expect(firstUnsolvedDefId(pairs, matches)).toBe('def-1');
  });

  it('returns the first def id when matches is completely empty', () => {
    expect(firstUnsolvedDefId(pairs, {})).toBe('def-0');
  });
});
