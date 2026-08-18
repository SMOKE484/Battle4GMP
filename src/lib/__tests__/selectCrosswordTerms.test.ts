import { selectCrosswordTerms } from '../selectCrosswordTerms';
import { ALCOA_PLUS_TERMS } from '../crosswordTerms';
import { mulberry32 } from '../../testHelpers/mulberry32';

describe('selectCrosswordTerms', () => {
  it('returns exactly the requested count', () => {
    const terms = selectCrosswordTerms(6, mulberry32(1));
    expect(terms).toHaveLength(6);
  });

  it('never returns more than the pool size', () => {
    const terms = selectCrosswordTerms(999, mulberry32(1));
    expect(terms).toHaveLength(ALCOA_PLUS_TERMS.length);
  });

  it('only returns terms from the canonical ALCOA+ pool, with no duplicates', () => {
    const terms = selectCrosswordTerms(6, mulberry32(7));
    const poolWords = new Set(ALCOA_PLUS_TERMS.map((t) => t.term));
    const seen = new Set<string>();
    for (const t of terms) {
      expect(poolWords.has(t.term)).toBe(true);
      expect(seen.has(t.term)).toBe(false);
      seen.add(t.term);
    }
  });

  it('excludes CONTEMPORANEOUS from the selectable pool entirely', () => {
    const terms = selectCrosswordTerms(ALCOA_PLUS_TERMS.length, mulberry32(3));
    expect(terms.some((t) => t.term === 'CONTEMPORANEOUS')).toBe(false);
  });

  it('is deterministic under the same seed', () => {
    const a = selectCrosswordTerms(6, mulberry32(99));
    const b = selectCrosswordTerms(6, mulberry32(99));
    expect(a).toEqual(b);
  });
});
