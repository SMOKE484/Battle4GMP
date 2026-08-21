import { useEffect, useState } from 'react';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, setFontsAvailable } from '../src/theme';
import { useGameStore } from '../src/store/useGameStore';
import { subscribeToLobbyPresence } from '../src/lib/presenceService';
import { getPendingInvitesForPlayer, subscribeToInvites } from '../src/lib/inviteService';
import { IncomingInviteBanner } from '../src/components/multiplayer/IncomingInviteBanner';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Baloo2_500Medium,
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const [ready, setReady] = useState(false);
  const initDeviceId = useGameStore((s) => s.initDeviceId);
  const flushPendingSync = useGameStore((s) => s.flushPendingSync);
  const hasHydrated = useGameStore((s) => s.hasHydrated);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setOnlinePlayers = useGameStore((s) => s.setOnlinePlayers);
  const setPendingInvite = useGameStore((s) => s.setPendingInvite);

  useEffect(() => {
    // A font-load failure shouldn't produce a permanently stuck loading screen —
    // proceed with system fonts (setFontsAvailable stays false) rather than wait forever.
    if (fontsLoaded || fontError) {
      setFontsAvailable(!!fontsLoaded);
      setReady(true);
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (!hasHydrated) return;
    void initDeviceId().then(() => {
      void flushPendingSync();
    });
  }, [hasHydrated, initDeviceId, flushPendingSync]);

  // App-wide presence + invite delivery: starts as soon as playerId is resolved
  // (flushPendingSync above already resolves it on first launch regardless of
  // whether a display name has been chosen yet) and stays open for the whole
  // session, so a player is invitable no matter what screen they're on.
  useEffect(() => {
    if (!playerId) return;
    const name = displayName ?? 'Anonymous Pharmacist';
    const currentPlayerId = playerId;

    const unsubscribePresence = subscribeToLobbyPresence(currentPlayerId, name, setOnlinePlayers);
    const unsubscribeInvites = subscribeToInvites(currentPlayerId, (invite) => {
      setPendingInvite({
        id: invite.id,
        roomId: invite.room_id,
        roomCode: invite.room_code,
        inviterDisplayName: invite.inviter_display_name,
      });
    });

    // Catch-up fetch for an invite sent while the app was closed (before this
    // subscription existed) — takes the oldest still-pending one if there are
    // several, same "one visible at a time" contract as setPendingInvite.
    void getPendingInvitesForPlayer(currentPlayerId).then((result) => {
      if (!result.ok || result.invites.length === 0) return;
      const oldest = [...result.invites].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      setPendingInvite({
        id: oldest.id,
        roomId: oldest.room_id,
        roomCode: oldest.room_code,
        inviterDisplayName: oldest.inviter_display_name,
      });
    });

    return () => {
      unsubscribePresence();
      unsubscribeInvites();
    };
  }, [playerId, displayName, setOnlinePlayers, setPendingInvite]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.purple.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.fill}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="level1" />
        <Stack.Screen name="level2" />
        <Stack.Screen name="level3" />
        <Stack.Screen name="grand-reward" />
        <Stack.Screen name="scoreboard" />
        <Stack.Screen name="challenge/index" />
        <Stack.Screen name="challenge/create" />
        <Stack.Screen name="challenge/join" />
        <Stack.Screen name="challenge/[id]" />
        <Stack.Screen name="room/create" />
        <Stack.Screen name="room/join" />
        <Stack.Screen name="room/[code]" />
        <Stack.Screen name="room/[code]/play" />
      </Stack>
      <IncomingInviteBanner />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
