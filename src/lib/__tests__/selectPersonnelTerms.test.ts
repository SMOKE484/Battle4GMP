import { selectPersonnelTerms } from '../selectPersonnelTerms';
import { PERSONNEL_TERMS } from '../personnelTerms';
import { mulberry32 } from '../../testHelpers/mulberry32';

describe('selectPersonnelTerms', () => {
  it('returns exactly the requested count', () => {
    const terms = selectPersonnelTerms(4, mulberry32(1));
    expect(terms).toHaveLength(4);
  });

  it('never returns more than the pool size', () => {
    const terms = selectPersonnelTerms(999, mulberry32(1));
    expect(terms).toHaveLength(PERSONNEL_TERMS.length);
  });

  it('only returns terms from the canonical pool, with no duplicates', () => {
    const terms = selectPersonnelTerms(4, mulberry32(7));
    const poolTerms = new Set(PERSONNEL_TERMS.map((t) => t.term));
    const seen = new Set<string>();
    for (const t of terms) {
      expect(poolTerms.has(t.term)).toBe(true);
      expect(seen.has(t.term)).toBe(false);
      seen.add(t.term);
    }
  });

  it('is deterministic under the same seed', () => {
    const a = selectPersonnelTerms(4, mulberry32(99));
    const b = selectPersonnelTerms(4, mulberry32(99));
    expect(a).toEqual(b);
  });
});
