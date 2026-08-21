import { useCallback, useEffect, useRef, useState } from 'react';

import { getRoomByCode, getRoomById, shouldApplyRoomUpdate, subscribeToRoom } from '../lib/roomService';
import { ChallengeRoomRow } from '../types/database';

export type RoomSyncStatus = 'loading' | 'error' | 'not_found' | 'ready';

// Safety-net refetch cadence. Deliberately short enough to stay usable as the
// *only* sync path (a 20s Rapid Round question still leaves plenty of time to
// answer if a phase change lands up to 3s late), but slow enough to be
// negligible load — it's one indexed single-row read per client.
export const ROOM_POLL_INTERVAL_MS = 3000;

/**
 * Owns all room-state syncing for both room screens: initial load by code, the
 * realtime subscription, and a polling fallback.
 *
 * The poll is NOT gated on realtime reporting an error, deliberately. The
 * failure mode this app actually hit was a channel that reports SUBSCRIBED and
 * then delivers nothing (a table missing from the `supabase_realtime`
 * publication) — status-gated polling would not have rescued that, because the
 * status looked healthy the whole time. Polling unconditionally means the room
 * keeps advancing even if realtime is misconfigured, blocked by a network, or
 * silently degraded; realtime just makes it feel instant when it works.
 *
 * All writes funnel through shouldApplyRoomUpdate so a slow poll response can
 * never clobber a newer realtime event.
 */
export function useRoomSync(code: string | undefined) {
  const [room, setRoom] = useState<ChallengeRoomRow | null>(null);
  const [status, setStatus] = useState<RoomSyncStatus>('loading');
  // Mirrors `room` for the ordering check: the poll interval and the realtime
  // callback both close over their setup-time render, so they can't read the
  // latest `room` from state directly.
  const roomRef = useRef<ChallengeRoomRow | null>(null);

  const applyRoom = useCallback((incoming: ChallengeRoomRow) => {
    if (!shouldApplyRoomUpdate(roomRef.current, incoming)) return;
    roomRef.current = incoming;
    setRoom(incoming);
  }, []);

  const load = useCallback(async () => {
    if (!code) return;
    setStatus('loading');
    const result = await getRoomByCode(code);
    if (!result.ok) {
      setStatus('error');
      return;
    }
    if (!result.room) {
      setStatus('not_found');
      return;
    }
    // An explicit (re)load is authoritative — it bypasses the ordering guard so
    // a manual Retry always resyncs, even against a stale cached ref.
    roomRef.current = result.room;
    setRoom(result.room);
    setStatus('ready');
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const roomId = room?.id ?? null;

  useEffect(() => {
    if (!roomId) return;

    const unsubscribe = subscribeToRoom(roomId, applyRoom);
    const interval = setInterval(() => {
      void getRoomById(roomId).then((result) => {
        if (result.ok && result.room) applyRoom(result.room);
      });
    }, ROOM_POLL_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [roomId, applyRoom]);

  return { room, status, applyRoom, reload: load };
}
