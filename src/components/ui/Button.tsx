import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, font, fontSize, radius, spacing } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  flex?: number;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, flex, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        flex ? { flex } : null,
        isDisabled ? styles.disabled : null,
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.neutral.white : colors.purple.primary} />
      ) : (
        <Text
          style={[
            styles.label,
            {
              color: variant === 'primary' ? colors.neutral.white : colors.purple.primary,
              fontFamily: font('bodyExtraBold'),
            },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.pink.accent,
    shadowColor: colors.pink.accent,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  secondary: {
    backgroundColor: colors.neutral.white,
    borderWidth: 2,
    borderColor: colors.neutral.outlineBorder,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '800',
  },
});
