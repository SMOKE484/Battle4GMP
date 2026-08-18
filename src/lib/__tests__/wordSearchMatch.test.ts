import { allFound, firstUnfoundTerm, matchesTerm, matchTermFromSelection } from '../wordSearchMatch';

describe('matchesTerm', () => {
  it('is true when the dragged letters spell the term forwards', () => {
    expect(matchesTerm(['A', 'I', 'R', 'L', 'O', 'C', 'K'], 'AIRLOCK')).toBe(true);
  });

  it('is true when the dragged letters spell the term backwards', () => {
    expect(matchesTerm(['K', 'C', 'O', 'L', 'R', 'I', 'A'], 'AIRLOCK')).toBe(true);
  });

  it('is false for an unrelated sequence', () => {
    expect(matchesTerm(['B', 'I', 'O', 'F', 'I', 'L', 'M'], 'AIRLOCK')).toBe(false);
  });

  it('is false for a partial/incomplete drag, even as a substring', () => {
    expect(matchesTerm(['A', 'I', 'R'], 'AIRLOCK')).toBe(false);
  });
});

describe('matchTermFromSelection', () => {
  const terms = ['AIRLOCK', 'BIOFILM'];

  it('returns the matching term when the drag spells a still-hidden term forwards', () => {
    expect(matchTermFromSelection(['A', 'I', 'R', 'L', 'O', 'C', 'K'], terms, new Set())).toBe('AIRLOCK');
  });

  it('returns the matching term when the drag spells it backwards', () => {
    expect(matchTermFromSelection(['M', 'L', 'I', 'F', 'O', 'I', 'B'], terms, new Set())).toBe('BIOFILM');
  });

  it('returns null when the drag matches nothing in the term list', () => {
    expect(matchTermFromSelection(['C', 'A', 'T'], terms, new Set())).toBeNull();
  });

  it('returns null for a term that spells correctly but is already found', () => {
    expect(matchTermFromSelection(['A', 'I', 'R', 'L', 'O', 'C', 'K'], terms, new Set(['AIRLOCK']))).toBeNull();
  });

  it('returns null for an empty selection', () => {
    expect(matchTermFromSelection([], terms, new Set())).toBeNull();
  });
});

describe('allFound', () => {
  it('is false while any term is missing from found', () => {
    expect(allFound(['A', 'B', 'C'], new Set(['A', 'B']))).toBe(false);
  });

  it('is true once every term is present', () => {
    expect(allFound(['A', 'B'], new Set(['A', 'B']))).toBe(true);
  });

  it('is true for an empty term list regardless of found', () => {
    expect(allFound([], new Set())).toBe(true);
  });
});

describe('firstUnfoundTerm', () => {
  it('returns the first term (in list order) not yet found', () => {
    expect(firstUnfoundTerm(['A', 'B', 'C'], new Set(['A']))).toBe('B');
  });

  it('returns null once every term is found', () => {
    expect(firstUnfoundTerm(['A', 'B'], new Set(['A', 'B']))).toBeNull();
  });

  it('returns the first term when found is empty', () => {
    expect(firstUnfoundTerm(['A', 'B'], new Set())).toBe('A');
  });

  it('returns null for an empty term list', () => {
    expect(firstUnfoundTerm([], new Set())).toBeNull();
  });
});
