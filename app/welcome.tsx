import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { GradientScreen } from '../src/components/ui/GradientScreen';
import { Button } from '../src/components/ui/Button';
import { colors, font, fontSize, radius, spacing } from '../src/theme';
import { useGameStore } from '../src/store/useGameStore';

const MAX_NAME_LENGTH = 24;

export default function WelcomeScreen() {
  const router = useRouter();
  const submitDisplayName = useGameStore((s) => s.submitDisplayName);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0;
  const showError = touched && !isValid;

  const handleSubmit = () => {
    if (!isValid) {
      setTouched(true);
      return;
    }
    submitDisplayName(trimmed);
    router.replace('/');
  };

  return (
    <GradientScreen>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Image source={require('../assets/welcome.png')} style={styles.icon} resizeMode="contain" />

          <Text style={styles.title}>Welcome to Battle4GMP</Text>
          <Text style={styles.subtitle}>What should we call you on the leaderboard?</Text>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>YOUR NAME</Text>
              <Text style={styles.charCount}>
                {trimmed.length}/{MAX_NAME_LENGTH}
              </Text>
            </View>
            <TextInput
              value={name}
              onChangeText={(text) => setName(text.slice(0, MAX_NAME_LENGTH))}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Jordan"
              placeholderTextColor={colors.text.faint}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={MAX_NAME_LENGTH}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={[styles.input, showError ? styles.inputError : null]}
            />
            <Text style={showError ? styles.errorText : styles.hintText}>
              {showError ? 'Enter a name to continue.' : 'Shown on the leaderboard — required to continue.'}
            </Text>
          </View>

          <Button label="LET'S GO →" onPress={handleSubmit} disabled={!isValid} style={styles.button} />
        </View>
      </KeyboardAvoidingView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  icon: {
    width: 180,
    height: 180,
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xxl,
    color: colors.text.heading,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.xl,
  },
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
  button: {
    width: '100%',
  },
});
