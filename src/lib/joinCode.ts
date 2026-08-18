// Excludes 0/O/1/I/L — glyphs easy to confuse when a code is read aloud or
// copied off a screen someone else is holding.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function isValidJoinCode(code: string): boolean {
  return code.length === CODE_LENGTH;
}
