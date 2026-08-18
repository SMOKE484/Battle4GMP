import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, font, fontSize, radius, spacing } from '../../theme';
import { CODE_LENGTH } from '../../lib/joinCode';

interface JoinCodeFieldProps {
  value: string;
  onChange: (code: string) => void;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}

// Mirrors welcome.tsx's name-input pattern (labelRow + char count, touched/onBlur
// inline validation, hint text that becomes an error after blur-with-invalid) so
// "enter a code" reads the same as "enter a name" everywhere in the app.
export function JoinCodeField({ value, onChange, autoFocus, onSubmitEditing }: JoinCodeFieldProps) {
  const [touched, setTouched] = useState(false);
  const isValid = value.length === CODE_LENGTH;
  const showError = touched && !isValid;

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>CHALLENGE CODE</Text>
        <Text style={styles.charCount}>
          {value.length}/{CODE_LENGTH}
        </Text>
      </View>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH))}
        onBlur={() => setTouched(true)}
        placeholder="e.g. AB3XQ9"
        placeholderTextColor={colors.text.faint}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus={autoFocus}
        maxLength={CODE_LENGTH}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        style={[styles.input, showError ? styles.inputError : null]}
      />
      <Text style={showError ? styles.errorText : styles.hintText}>
        {showError ? `Enter the ${CODE_LENGTH}-character code you were given.` : 'Ask the host for their challenge code.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.purple.muted,
  },
  charCount: {
    fontSize: fontSize.xs,
    color: colors.text.faint,
  },
  input: {
    width: '100%',
    backgroundColor: colors.neutral.inputBg,
    borderWidth: 2,
    borderColor: colors.neutral.inputBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    fontFamily: font('bodySemiBold'),
    color: colors.text.heading,
    letterSpacing: 2,
  },
  inputError: {
    borderColor: colors.error.border,
  },
  hintText: {
    fontSize: fontSize.xs,
    color: colors.text.faint,
    marginTop: spacing.xs,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.error.text,
    marginTop: spacing.xs,
  },
});
