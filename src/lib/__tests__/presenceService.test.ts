import { subscribeToLobbyPresence } from '../presenceService';
import { supabase } from '../supabase';
import { createMockRealtimeChannel } from '../../testHelpers/supabaseMock';

jest.mock('../supabase', () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }));

const mockedChannel = supabase.channel as jest.Mock;
const mockedRemoveChannel = supabase.removeChannel as jest.Mock;

describe('subscribeToLobbyPresence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tracks this player and reports the full roster (with player ids) on a presence sync event', () => {
    const channel = createMockRealtimeChannel();
    (channel.presenceState as jest.Mock).mockReturnValue({
      'player-1': [{ displayName: 'Jordan' }],
      'player-2': [{ displayName: 'Sam' }],
    });
    mockedChannel.mockReturnValue(channel);
    const onSync = jest.fn();

    subscribeToLobbyPresence('player-1', 'Jordan', onSync);

    expect(channel.track).toHaveBeenCalledWith({ displayName: 'Jordan' });

    (channel as { __trigger: (type: string, ...args: unknown[]) => void }).__trigger('presence');
    expect(onSync).toHaveBeenCalledWith([
      { playerId: 'player-1', displayName: 'Jordan' },
      { playerId: 'player-2', displayName: 'Sam' },
    ]);
  });

  it('reports an empty roster when no one is present', () => {
    const channel = createMockRealtimeChannel();
    mockedChannel.mockReturnValue(channel);
    const onSync = jest.fn();

    subscribeToLobbyPresence('player-1', 'Jordan', onSync);
    (channel as { __trigger: (type: string, ...args: unknown[]) => void }).__trigger('presence');

    expect(onSync).toHaveBeenCalledWith([]);
  });

  it('returns an unsubscribe function that removes the channel', () => {
    const channel = createMockRealtimeChannel();
    mockedChannel.mockReturnValue(channel);

    const unsubscribe = subscribeToLobbyPresence('player-1', 'Jordan', jest.fn());
    expect(mockedRemoveChannel).not.toHaveBeenCalled();

    unsubscribe();
    expect(mockedRemoveChannel).toHaveBeenCalledWith(channel);
  });
});
