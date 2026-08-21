import { supabase } from './supabase';

export interface OnlinePlayer {
  playerId: string;
  displayName: string;
}

const LOBBY_PRESENCE_CHANNEL = 'lobby-presence';

/**
 * App-wide "who has the app open right now" roster — a single shared channel
 * every session with a resolved playerId tracks itself on, for as long as the
 * app is open (mirrors challenge_rooms' subscribeToPresence, just at global
 * scope instead of one room). Ephemeral by design: a disconnected client just
 * drops out of the next sync event, no explicit "leave" needed. Returns an
 * unsubscribe function — always call it on unmount/sign-out.
 */
export function subscribeToLobbyPresence(
  playerId: string,
  displayName: string,
  onSync: (players: OnlinePlayer[]) => void
): () => void {
  const channel = supabase.channel(LOBBY_PRESENCE_CHANNEL, { config: { presence: { key: playerId } } });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<{ displayName: string }>();
    const players = Object.entries(state).map(([id, entries]) => ({
      playerId: id,
      displayName: entries[0]?.displayName ?? '',
    }));
    onSync(players);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel.track({ displayName });
    }
  });

  return () => {
    void supabase.removeChannel(channel);
  };
}
