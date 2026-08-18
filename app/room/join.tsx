import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { AppHeader } from '../../src/components/AppHeader';
import { GradientScreen } from '../../src/components/ui/GradientScreen';
import { Button } from '../../src/components/ui/Button';
import { JoinCodeField } from '../../src/components/challenge/JoinCodeField';
import { colors, font, fontSize, spacing } from '../../src/theme';
import { getRoomByCode, joinRoom } from '../../src/lib/roomService';
import { ensurePlayer } from '../../src/lib/scoreSync';
import { isValidJoinCode } from '../../src/lib/joinCode';
import { useGameStore } from '../../src/store/useGameStore';

export default function JoinRoomScreen() {
  const router = useRouter();
  const deviceId = useGameStore((s) => s.deviceId);
  const playerId = useGameStore((s) => s.playerId);
  const displayName = useGameStore((s) => s.displayName);
  const setPlayerId = useGameStore((s) => s.setPlayerId);

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isValid = isValidJoinCode(code);

  const handleJoin = async () => {
    if (!isValid || !deviceId) return;
    setSubmitting(true);
    setSubmitError(null);

    const roomResult = await getRoomByCode(code);
    if (!roomResult.ok) {
      setSubmitting(false);
      setSubmitError("Couldn't reach the server — check your connection and try again.");
      return;
    }
    if (!roomResult.room) {
      setSubmitting(false);
      setSubmitError('No live room found for that code — double check it and try again.');
      return;
    }
    const room = roomResult.room;

    let joinerId = playerId;
    if (!joinerId) {
      const playerResult = await ensurePlayer(deviceId, displayName ?? undefined);
      if (!playerResult.ok) {
        setSubmitting(false);
        setSubmitError("Couldn't reach the server — check your connection and try again.");
        return;
      }
      joinerId = playerResult.playerId;
      setPlayerId(joinerId);
    }

    const joinResult = await joinRoom(room.id, joinerId, displayName ?? 'Anonymous Pharmacist');
    setSubmitting(false);
    if (!joinResult.ok) {
      setSubmitError("Couldn't join the room — check your connection and try again.");
      return;
    }
    router.replace({ pathname: '/room/[code]/play', params: { code: room.code } });
  };

  return (
    <GradientScreen>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Join a Live Room</Text>
        <Text style={styles.subtitle}>Enter the host's room code, then watch the shared screen for questions.</Text>

        <JoinCodeField value={code} onChange={setCode} autoFocus onSubmitEditing={() => void handleJoin()} />

        {submitError ? (
          <View style={styles.submitNotice}>
            <Feather name="alert-circle" size={14} color={colors.error.text} />
            <Text style={styles.submitNoticeText}>{submitError}</Text>
          </View>
        ) : null}

        <Button
          label={submitting ? 'JOINING…' : 'JOIN ROOM →'}
          onPress={() => void handleJoin()}
          loading={submitting}
          disabled={!isValid || !deviceId}
        />
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
    paddingTop: spacing.sm,
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
  submitNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
    backgroundColor: colors.error.bg,
    borderRadius: 12,
    padding: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  submitNoticeText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error.text,
    lineHeight: 16,
  },
});
