import {
  QUESTION_DURATION_MS,
  RAPID_QUESTION_DURATION_MS,
  advancePhase,
  createRoom,
  getQuestionAnswerTally,
  getRoomByCode,
  getRoomLeaderboard,
  joinRoom,
  submitAnswer,
  subscribeToPresence,
  subscribeToRoom,
} from '../roomService';
import { supabase } from '../supabase';
import { chainableSupabaseResult, createMockRealtimeChannel } from '../../testHelpers/supabaseMock';

jest.mock('../supabase', () => ({ supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() } }));

const mockedFrom = supabase.from as jest.Mock;
const mockedChannel = supabase.channel as jest.Mock;
const mockedRemoveChannel = supabase.removeChannel as jest.Mock;

const roomRow = {
  id: 'room-1',
  code: 'AB3XQ9',
  host_player_id: 'player-1',
  topic: 'sterility',
  question_set: [],
  phase: 'lobby',
  current_question_index: 0,
  phase_started_at: '2026-08-18T00:00:00.000Z',
  created_at: '2026-08-18T00:00:00.000Z',
};

describe('createRoom', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the created room on a successful insert', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: roomRow, error: null }));

    const result = await createRoom('player-1', 'sterility', []);

    expect(result).toEqual({ ok: true, room: roomRow });
  });

  it('defaults question_duration_ms to QUESTION_DURATION_MS when not given', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: roomRow, error: null }));

    await createRoom('player-1', 'sterility', []);

    const insertBuilder = mockedFrom.mock.results[0].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ question_duration_ms: QUESTION_DURATION_MS }));
  });

  it('passes through an overridden question_duration_ms (Rapid Round)', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: roomRow, error: null }));

    await createRoom('player-1', 'mixed', [], RAPID_QUESTION_DURATION_MS);

    const insertBuilder = mockedFrom.mock.results[0].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'mixed', question_duration_ms: RAPID_QUESTION_DURATION_MS })
    );
  });

  it('retries with a fresh code on a unique-constraint collision, then succeeds', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: null, error: { code: '23505', message: 'duplicate code' } })
        : chainableSupabaseResult({ data: roomRow, error: null });
    });

    const result = await createRoom('player-1', 'sterility', []);

    expect(result).toEqual({ ok: true, room: roomRow });
    expect(mockedFrom).toHaveBeenCalledTimes(2);
  });

  it('classifies a thrown TypeError as a network error', async () => {
    mockedFrom.mockImplementation(() => {
      throw new TypeError('Network request failed');
    });

    const result = await createRoom('player-1', 'sterility', []);

    expect(result).toEqual({ ok: false, kind: 'network' });
  });
});

describe('getRoomByCode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the matching room', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: roomRow, error: null }));

    const result = await getRoomByCode('AB3XQ9');

    expect(result).toEqual({ ok: true, room: roomRow });
  });

  it('returns ok:true with a null room when no code matches', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: null }));

    const result = await getRoomByCode('ZZZZZZ');

    expect(result).toEqual({ ok: true, room: null });
  });
});

describe('joinRoom', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts a new room-player row when none exists yet', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: null, error: null })
        : chainableSupabaseResult({ error: null });
    });

    const result = await joinRoom('room-1', 'player-2', 'Jordan');

    expect(result).toEqual({ ok: true, joined: true });
    const insertBuilder = mockedFrom.mock.results[1].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith({ room_id: 'room-1', player_id: 'player-2', display_name_snapshot: 'Jordan' });
  });

  it('is idempotent: returns ok:true without inserting when already joined', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: { id: 'rp-1' }, error: null }));

    const result = await joinRoom('room-1', 'player-2', 'Jordan');

    expect(result).toEqual({ ok: true, joined: true });
    expect(mockedFrom).toHaveBeenCalledTimes(1);
  });
});

describe('advancePhase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates the phase and stamps a fresh phase_started_at', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: null }));

    const result = await advancePhase('room-1', 'question', 2);

    expect(result).toEqual({ ok: true });
    const updateBuilder = mockedFrom.mock.results[0].value;
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'question', current_question_index: 2, phase_started_at: expect.any(String) })
    );
  });

  it('omits current_question_index when not given', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: null }));

    await advancePhase('room-1', 'leaderboard');

    const updateBuilder = mockedFrom.mock.results[0].value;
    expect(updateBuilder.update).toHaveBeenCalledWith({ phase: 'leaderboard', phase_started_at: expect.any(String) });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: { message: 'boom' } }));

    const result = await advancePhase('room-1', 'ended');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('submitAnswer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts the answer row', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: null }));

    const result = await submitAnswer('room-1', 'player-2', 0, 1, true, 3200, 18);

    expect(result).toEqual({ ok: true });
    const insertBuilder = mockedFrom.mock.results[0].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      room_id: 'room-1',
      player_id: 'player-2',
      question_index: 0,
      selected_option: 1,
      is_correct: true,
      answer_ms: 3200,
      points: 18,
    });
  });

  it('never throws a raw error even if the client itself throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('unexpected client crash');
    });

    await expect(submitAnswer('room-1', 'player-2', 0, 1, true, 3200, 18)).resolves.toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('getQuestionAnswerTally', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts answers per option', async () => {
    mockedFrom.mockReturnValue(
      chainableSupabaseResult({
        data: [{ selected_option: 1 }, { selected_option: 1 }, { selected_option: 0 }, { selected_option: 3 }],
        error: null,
      })
    );

    const result = await getQuestionAnswerTally('room-1', 0);

    expect(result).toEqual({ ok: true, counts: [1, 2, 0, 1] });
  });

  it('returns all zeros when there are no answers yet', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: null }));

    const result = await getQuestionAnswerTally('room-1', 0);

    expect(result).toEqual({ ok: true, counts: [0, 0, 0, 0] });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await getQuestionAnswerTally('room-1', 0);

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('getRoomLeaderboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns an empty array rather than null when there are no rows', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: null }));

    const result = await getRoomLeaderboard('room-1');

    expect(result).toEqual({ ok: true, rows: [] });
  });
});

describe('subscribeToRoom', () => {
  beforeEach(() => jest.clearAllMocks());

  it('invokes onChange with the updated row when a postgres_changes UPDATE fires', () => {
    const channel = createMockRealtimeChannel();
    mockedChannel.mockReturnValue(channel);
    const onChange = jest.fn();

    subscribeToRoom('room-1', onChange);

    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'UPDATE', table: 'challenge_rooms', filter: 'id=eq.room-1' }),
      expect.any(Function)
    );

    (channel as { __trigger: (type: string, ...args: unknown[]) => void }).__trigger('postgres_changes', { new: roomRow });
    expect(onChange).toHaveBeenCalledWith(roomRow);
  });

  it('returns an unsubscribe function that removes the channel', () => {
    const channel = createMockRealtimeChannel();
    mockedChannel.mockReturnValue(channel);

    const unsubscribe = subscribeToRoom('room-1', jest.fn());
    expect(mockedRemoveChannel).not.toHaveBeenCalled();

    unsubscribe();
    expect(mockedRemoveChannel).toHaveBeenCalledWith(channel);
  });
});

describe('subscribeToPresence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tracks this player and reports names on a presence sync event', () => {
    const channel = createMockRealtimeChannel();
    (channel.presenceState as jest.Mock).mockReturnValue({
      'player-1': [{ displayName: 'Jordan' }],
      'player-2': [{ displayName: 'Sam' }],
    });
    mockedChannel.mockReturnValue(channel);
    const onSync = jest.fn();

    subscribeToPresence('room-1', 'player-1', 'Jordan', onSync);

    expect(channel.track).toHaveBeenCalledWith({ displayName: 'Jordan' });

    (channel as { __trigger: (type: string, ...args: unknown[]) => void }).__trigger('presence');
    expect(onSync).toHaveBeenCalledWith(['Jordan', 'Sam']);
  });

  it('returns an unsubscribe function that removes the channel', () => {
    const channel = createMockRealtimeChannel();
    mockedChannel.mockReturnValue(channel);

    const unsubscribe = subscribeToPresence('room-1', 'player-1', 'Jordan', jest.fn());
    unsubscribe();

    expect(mockedRemoveChannel).toHaveBeenCalledWith(channel);
  });
});
