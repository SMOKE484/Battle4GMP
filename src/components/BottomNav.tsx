import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, usePathname, Href } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, font, fontSize, radius, spacing } from '../theme';
import { LevelNumber, selectLevelStatus, useGameStore } from '../store/useGameStore';

interface NavItem {
  key: string;
  href: Href;
  label: string;
  level?: LevelNumber;
  icon: (color: string) => ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', href: '/', label: 'HOME', icon: (c) => <Feather name="home" size={18} color={c} /> },
  { key: 'level1', href: '/level1', label: 'LVL 1', level: 1, icon: (c) => <Feather name="grid" size={18} color={c} /> },
  { key: 'level2', href: '/level2', label: 'LVL 2', level: 2, icon: (c) => <Feather name="users" size={18} color={c} /> },
  { key: 'level3', href: '/level3', label: 'LVL 3', level: 3, icon: (c) => <Feather name="search" size={18} color={c} /> },
  { key: 'scoreboard', href: '/scoreboard', label: 'SCORE', icon: (c) => <Ionicons name="trophy" size={18} color={c} /> },
];

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const state = useGameStore((s) => s);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.floater}>
        <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.08)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheen} pointerEvents="none" />
        <View style={styles.row}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            // The design mockup lets the nav bar skip ahead to any level regardless
            // of lock status — deliberately not replicated here, since sequential
            // unlocking is a binding spec constraint, not just a home-screen affordance.
            const locked = item.level ? selectLevelStatus(state, item.level) === 'locked' : false;
            const iconColor = active ? colors.neutral.white : colors.purple.light;
            const labelColor = locked ? colors.purple.light : active ? colors.pink.accent : colors.purple.light;

            return (
              <Pressable
                key={item.key}
                disabled={locked}
                onPress={() => router.push(item.href)}
                style={styles.item}
                accessibilityRole="button"
                accessibilityState={{ disabled: locked, selected: active }}
              >
                <View style={[styles.iconPill, active ? styles.iconPillActive : null]}>
                  {locked ? (
                    <Feather name="lock" size={16} color={colors.purple.light} />
                  ) : (
                    item.icon(iconColor)
                  )}
                </View>
                <Text style={[styles.label, { color: labelColor, fontFamily: font('bodyExtraBold') }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  floater: {
    width: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.25)',
    shadowColor: colors.purple.primary,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  item: {
    alignItems: 'center',
    gap: 4,
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: colors.pink.accent,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
});
