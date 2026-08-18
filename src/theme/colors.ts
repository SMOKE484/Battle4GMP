export const colors = {
  background: '#e9e4f5',
  screenGradient: ['#f3effa', '#e6ddf7'] as [string, string],
  frame: '#1c1730',

  brandGradient: ['#8b7cc9', '#5c4b96'] as [string, string],
  scoreGradient: ['#6d5aab', '#5c4b96'] as [string, string],
  rewardGradient: ['#f2c14e', '#e8779e'] as [string, string],

  purple: {
    primary: '#5c4b96',
    deep: '#6d5aab',
    light: '#8b7cc9',
    muted: '#a68fd1',
  },
  pink: {
    accent: '#e8779e',
  },
  text: {
    heading: '#3a2f5c',
    body: '#5c527c',
    muted: '#7a6f9c',
    faint: '#a68fd1',
  },
  success: {
    dark: '#2f8a54',
    base: '#4aa66b',
    bg: '#e3f6e9',
    border: '#7fcf9c',
  },
  // A separate semantic token from level1's brand color, even though they share
  // a hex value today (the mockup reuses level1's pink for its error/incorrect
  // states) — keeping them distinct means re-theming level 1 later can't
  // accidentally change what "incorrect" looks like everywhere else.
  error: {
    text: '#c9497b',
    bg: '#fde3e6',
    border: '#f0919e',
  },
  neutral: {
    white: '#ffffff',
    inputBg: '#f3effa',
    inputBorder: '#c3b3ea',
    divider: '#eae4f7',
    outlineBorder: '#d9cdf2',
  },
  level1: { bg: '#fddce8', fg: '#c9497b' },
  level2: { bg: '#d6e9f7', fg: '#3477a3' },
  level3: { bg: '#e6def7', fg: '#6b53a8' },
};
