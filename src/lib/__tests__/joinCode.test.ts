import { CODE_LENGTH, generateJoinCode, isValidJoinCode } from '../joinCode';

const AMBIGUOUS_GLYPHS = ['0', 'O', '1', 'I', 'L'];

describe('generateJoinCode', () => {
  it('generates a code of the fixed length', () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('only uses uppercase letters and digits', () => {
    const code = generateJoinCode();
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it('never includes visually ambiguous glyphs, across many samples', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateJoinCode();
      for (const glyph of AMBIGUOUS_GLYPHS) {
        expect(code).not.toContain(glyph);
      }
    }
  });

  it('produces varied output rather than a fixed string', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateJoinCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('always generates a code isValidJoinCode accepts', () => {
    expect(isValidJoinCode(generateJoinCode())).toBe(true);
  });
});

describe('isValidJoinCode', () => {
  it('rejects codes shorter than the fixed length', () => {
    expect(isValidJoinCode('AB3XQ')).toBe(false);
  });

  it('rejects codes longer than the fixed length', () => {
    expect(isValidJoinCode('AB3XQ99')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidJoinCode('')).toBe(false);
  });

  it('accepts a code of exactly the fixed length', () => {
    expect(isValidJoinCode('AB3XQ9')).toBe(true);
  });
});
