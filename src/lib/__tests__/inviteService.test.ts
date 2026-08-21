import { getPendingInvitesForPlayer, respondToInvite, sendInvite, subscribeToInvites } from '../inviteService';
import { supabase } from '../supabase';
import { chainableSupabaseResult, createMockRealtimeChannel } from '../../testHelpers/supabaseMock';

jest.mock('../supabase', () => ({ supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));

const mockedFrom = supabase.from as jest.Mock;
const mockedChannel = supabase.channel as jest.Mock;
const mockedRemoveChannel = supabase.removeChannel as jest.Mock;

const inviteRow = {
  id: 'invite-1',
  room_id: 'room-1',
  room_code: 'AB3XQ9',
  inviter_player_id: 'player-1',
  inviter_display_name: 'Jordan',
  invitee_player_id: 'player-2',
  status: 'pending' as const,
  created_at: '2026-08-21T00:00:00.000Z',
};

describe('sendInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts on (room_id, invitee_player_id) and returns the invite', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: inviteRow, error: null }));

    const result = await sendInvite('room-1', 'AB3XQ9', 'player-1', 'Jordan', 'player-2');

    expect(result).toEqual({ ok: true, invite: inviteRow });
    const builder = mockedFrom.mock.results[0].value;
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        room_id: 'room-1',
        room_code: 'AB3XQ9',
        inviter_player_id: 'player-1',
        inviter_display_name: 'Jordan',
        invitee_player_id: 'player-2',
        status: 'pending',
      },
      { onConflict: 'room_id,invitee_player_id' }
    );
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await sendInvite('room-1', 'AB3XQ9', 'player-1', 'Jordan', 'player-2');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });

  it('classifies a thrown TypeError as a network error', async () => {
    mockedFrom.mockImplementation(() => {
      throw new TypeError('Network request failed');
    });

    const result = await sendInvite('room-1', 'AB3XQ9', 'player-1', 'Jordan', 'player-2');

    expect(result).toEqual({ ok: false, kind: 'network' });
  });
});

describe('respondToInvite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates the invite status', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: null }));

    const result = await respondToInvite('invite-1', 'accepted');

    expect(result).toEqual({ ok: true });
    const builder = mockedFrom.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ status: 'accepted' });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: { message: 'boom' } }));

    const result = await respondToInvite('invite-1', 'declined');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('getPendingInvitesForPlayer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the pending invites for that player', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: [inviteRow], error: null }));

    const result = await getPendingInvitesForPlayer('player-2');

    expect(result).toEqual({ ok: true, invites: [inviteRow] });
  });

  it('returns an empty array rather than null when there are none', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: null }));

    const result = await getPendingInvitesForPlayer('player-2');

    expect(result).toEqual({ ok: true, invites: [] });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await getPendingInvitesForPlayer('player-2');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('subscribeToInvites', () => {
  beforeEach(() => jest.clearAllMocks());

  it('invokes onInvite with the new row when a postgres_changes INSERT fires, filtered to this player', () => {
    const channel = createMockRealtimeChannel();
    mockedChannel.mockReturnValue(channel);
    const onInvite = jest.fn();

    subscribeToInvites('player-2', onInvite);

    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', table: 'room_invites', filter: 'invitee_player_id=eq.player-2' }),
      expect.any(Function)
    );

    (channel as { __trigger: (type: string, ...args: unknown[]) => void }).__trigger('postgres_changes', { new: inviteRow });
    expect(onInvite).toHaveBeenCalledWith(inviteRow);
  });

  it('returns an unsubscribe function that removes the channel', () => {
    const channel = createMockRealtimeChannel();
    mockedChannel.mockReturnValue(channel);

    const unsubscribe = subscribeToInvites('player-2', jest.fn());
    expect(mockedRemoveChannel).not.toHaveBeenCalled();

    unsubscribe();
    expect(mockedRemoveChannel).toHaveBeenCalledWith(channel);
  });
});
