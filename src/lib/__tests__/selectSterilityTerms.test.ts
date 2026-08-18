import { selectSterilityTerms } from '../selectSterilityTerms';
import { STERILITY_TERMS } from '../sterilityTerms';
import { mulberry32 } from '../../testHelpers/mulberry32';

describe('selectSterilityTerms', () => {
  it('returns exactly the requested count', () => {
    const terms = selectSterilityTerms(6, mulberry32(1));
    expect(terms).toHaveLength(6);
  });

  it('never returns more than the pool size', () => {
    const terms = selectSterilityTerms(999, mulberry32(1));
    expect(terms).toHaveLength(STERILITY_TERMS.length);
  });

  it('only returns terms from the canonical pool, with no duplicates', () => {
    const terms = selectSterilityTerms(6, mulberry32(7));
    const poolTerms = new Set(STERILITY_TERMS.map((t) => t.term));
    const seen = new Set<string>();
    for (const t of terms) {
      expect(poolTerms.has(t.term)).toBe(true);
      expect(seen.has(t.term)).toBe(false);
      seen.add(t.term);
    }
  });

  it('is deterministic under the same seed', () => {
    const a = selectSterilityTerms(6, mulberry32(99));
    const b = selectSterilityTerms(6, mulberry32(99));
    expect(a).toEqual(b);
  });
});
