export const fontFamily = {
  headingMedium: 'Baloo2_500Medium',
  headingSemiBold: 'Baloo2_600SemiBold',
  headingBold: 'Baloo2_700Bold',
  headingExtraBold: 'Baloo2_800ExtraBold',
  bodyRegular: 'Nunito_400Regular',
  bodySemiBold: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyExtraBold: 'Nunito_800ExtraBold',
} as const;

export type FontFamilyKey = keyof typeof fontFamily;

// Set once at app start (see app/_layout.tsx) after useFonts settles, before any
// themed screen renders. A module-level flag is safe here specifically because
// nothing downstream renders until that decision is made.
let fontsAvailable = false;

export function setFontsAvailable(available: boolean): void {
  fontsAvailable = available;
}

/**
 * Returns the registered font family name, or undefined to fall back to the
 * system font. Never point style objects at an unregistered family name — on
 * some Android/RN combinations that renders blank text instead of falling
 * back cleanly.
 */
export function font(key: FontFamilyKey): string | undefined {
  return fontsAvailable ? fontFamily[key] : undefined;
}

export const fontSize = {
  xs: 10,
  sm: 11,
  base: 12,
  md: 13,
  lg: 14,
  xl: 16,
  xxl: 19,
  display: 22,
  banner: 26,
  hero: 32,
};
