import { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, font, fontSize, radius, spacing } from '../../theme';

interface PillProps {
  children: ReactNode;
  backgroundColor?: string;
  gradient?: [string, string];
  style?: ViewStyle;
}

export function Pill({ children, backgroundColor, gradient, style }: PillProps) {
  const content = <View style={styles.content}>{children}</View>;

  if (gradient) {
    return (
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.base, style]}>
        {content}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.base, { backgroundColor: backgroundColor ?? colors.neutral.white }, style]}>{content}</View>
  );
}

interface PillTextProps {
  children: ReactNode;
  color?: string;
}

export function PillText({ children, color = colors.purple.primary }: PillTextProps) {
  return <Text style={[styles.text, { color, fontFamily: font('bodyExtraBold') }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md - 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
});
