import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { BottomNav } from '../../src/components/BottomNav';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { colors, font, fontSize, radius, spacing } from '../../src/theme';

export default function ChallengeHubScreen() {
  const router = useRouter();

  return (
    <GradientScreen>
      <AppHeader />
      <View style={styles.content}>
        <Text style={styles.title}>Play with Friends</Text>
        <Text style={styles.subtitle}>Race a friend on your own time, or run a live quiz together.</Text>

        <Text style={styles.groupLabel}>ASYNC CHALLENGE</Text>
        <Pressable
          style={styles.card}
          onPress={() => router.push('/challenge/create')}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Feather name="plus-circle" size={22} color={colors.purple.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Create a Challenge</Text>
            <Text style={styles.cardDesc}>Pick a level, get a code, share it with friends.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.purple.muted} />
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => router.push('/challenge/join')}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Feather name="hash" size={22} color={colors.purple.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Join a Challenge</Text>
            <Text style={styles.cardDesc}>Enter a friend's code and play their challenge.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.purple.muted} />
        </Pressable>

        <Text style={styles.groupLabel}>LIVE ROOM</Text>
        <Pressable
          style={styles.card}
          onPress={() => router.push('/room/create')}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Feather name="tv" size={22} color={colors.purple.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Host a Live Room</Text>
            <Text style={styles.cardDesc}>Open on a laptop as the shared screen — players join on their phones.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.purple.muted} />
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => router.push('/room/join')}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Feather name="smartphone" size={22} color={colors.purple.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Join a Live Room</Text>
            <Text style={styles.cardDesc}>Enter a host's room code and answer from your phone.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.purple.muted} />
        </Pressable>
      </View>
      <BottomNav />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  title: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.xxl,
    color: colors.text.heading,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.text.muted,
    marginBottom: spacing.xl,
  },
  groupLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.purple.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    shadowColor: colors.purple.primary,
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.neutral.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: font('headingSemiBold'),
    fontSize: fontSize.lg,
    color: colors.text.heading,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    marginTop: 2,
  },
});
