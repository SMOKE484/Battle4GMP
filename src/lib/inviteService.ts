import { supabase } from './supabase';
import { InviteStatus, RoomInviteRow } from '../types/database';
import { SyncErrorKind, SyncResult } from './scoreSync';

function classifyError(err: unknown): SyncErrorKind {
  return err instanceof TypeError ? 'network' : 'db_error';
}

/**
 * Upserts on (room_id, invitee_player_id) — re-inviting the same person to the
 * same room just refreshes the row (e.g. back to 'pending' if they'd declined
 * earlier) rather than erroring on the unique constraint or piling up rows.
 */
export async function sendInvite(
  roomId: string,
  roomCode: string,
  inviterPlayerId: string,
  inviterDisplayName: string,
  inviteePlayerId: string
): Promise<SyncResult<{ invite: RoomInviteRow }>> {
  try {
    const { data, error } = await supabase
      .from('room_invites')
      .upsert(
        {
          room_id: roomId,
          room_code: roomCode,
          inviter_player_id: inviterPlayerId,
          inviter_display_name: inviterDisplayName,
          invitee_player_id: inviteePlayerId,
          status: 'pending',
        },
        { onConflict: 'room_id,invitee_player_id' }
      )
      .select()
      .single();
    if (error || !data) return { ok: false, kind: 'db_error' };
    return { ok: true, invite: data };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

export async function respondToInvite(inviteId: string, status: Extract<InviteStatus, 'accepted' | 'declined'>): Promise<SyncResult> {
  try {
    const { error } = await supabase.from('room_invites').update({ status }).eq('id', inviteId);
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * Catch-up fetch for invites sent while this session's realtime subscription
 * wasn't yet (or no longer) live — e.g. the app was closed when a friend
 * invited you. Called once when a screen that shows invites mounts, alongside
 * (not instead of) subscribeToInvites for anything sent after that.
 */
export async function getPendingInvitesForPlayer(playerId: string): Promise<SyncResult<{ invites: RoomInviteRow[] }>> {
  try {
    const { data, error } = await supabase.from('room_invites').select().eq('invitee_player_id', playerId).eq('status', 'pending');
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true, invites: data ?? [] };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * Live delivery for invites sent while this session is open — postgres_changes
 * (persisted), not broadcast, matching why subscribeToRoom elsewhere in this
 * codebase prefers postgres_changes: it's the same table getPendingInvitesForPlayer
 * reads from, so there's no separate ephemeral payload contract to design or drift
 * out of sync with the persisted row. Returns an unsubscribe function.
 */
export function subscribeToInvites(playerId: string, onInvite: (invite: RoomInviteRow) => void): () => void {
  const channel = supabase
    .channel(`player-invites-${playerId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_invites', filter: `invitee_player_id=eq.${playerId}` },
      (payload) => onInvite(payload.new as RoomInviteRow)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
