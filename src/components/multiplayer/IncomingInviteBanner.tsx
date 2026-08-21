import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { colors, font, fontSize, radius, spacing } from '../../theme';
import { Button } from '../ui/Button';
import { useGameStore } from '../../store/useGameStore';
import { joinRoom } from '../../lib/roomService';
import { respondToInvite } from '../../lib/inviteService';

/**
 * Rendered once at the root (app/_layout.tsx), above the Stack, so an invite
 * is visible no matter what screen the player is currently on — that's the
 * whole point of app-wide presence. Dismissible inline card, not a modal: per
 * AGENTS.md's error/notice placement rules, missing this is safe (the player
 * just doesn't join), so it shouldn't block the screen underneath it.
 */
export function IncomingInviteBanner() {
  const router = useRouter();
  const pendingInvite = useGameStore((s) => s.pendingInvite);
  const clearPendingInvite = useGameStore((s) => s.clearPendingInvite);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const [busy, setBusy] = useState<'join' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!pendingInvite || !playerId) return null;

  const handleJoin = async () => {
    setBusy('join');
    setError(null);
    const joined = await joinRoom(pendingInvite.roomId, playerId, displayName ?? 'Anonymous Pharmacist');
    if (!joined.ok) {
      setError("Couldn't join — check your connection and try again.");
      setBusy(null);
      return;
    }
    void respondToInvite(pendingInvite.id, 'accepted');
    const roomCode = pendingInvite.roomCode;
    clearPendingInvite();
    router.push({ pathname: '/room/[code]/play', params: { code: roomCode } });
  };

  const handleDismiss = async () => {
    setBusy('dismiss');
    void respondToInvite(pendingInvite.id, 'declined');
    clearPendingInvite();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Feather name="zap" size={18} color={colors.purple.primary} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{pendingInvite.inviterDisplayName} invited you to a live room</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Button label="DISMISS" variant="secondary" onPress={() => void handleDismiss()} loading={busy === 'dismiss'} disabled={!!busy} style={styles.button} />
          <Button label="JOIN" onPress={() => void handleJoin()} loading={busy === 'join'} disabled={!!busy} style={styles.button} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.purple.primary,
    shadowColor: colors.purple.primary,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.neutral.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  textWrap: {
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font('bodyExtraBold'),
    fontSize: fontSize.sm,
    color: colors.text.heading,
  },
  error: {
    fontSize: fontSize.xs,
    color: colors.error.text,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
});
