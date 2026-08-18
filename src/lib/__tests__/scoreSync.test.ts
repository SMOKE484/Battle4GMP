import { ensurePlayer, flushScoreSnapshot } from '../scoreSync';
import { supabase } from '../supabase';
import { chainableSupabaseResult } from '../../testHelpers/supabaseMock';

jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

const mockedFrom = supabase.from as jest.Mock;

describe('ensurePlayer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the existing player id when a row already exists', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: { id: 'player-1' }, error: null }));

    const result = await ensurePlayer('device-abc');

    expect(result).toEqual({ ok: true, playerId: 'player-1' });
  });

  it('creates and returns a new player id when none exists', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      // first call: select().eq().maybeSingle() -> no existing row
      // second call: insert().select().single() -> newly created row
      return call === 1
        ? chainableSupabaseResult({ data: null, error: null })
        : chainableSupabaseResult({ data: { id: 'player-2' }, error: null });
    });

    const result = await ensurePlayer('device-xyz');

    expect(result).toEqual({ ok: true, playerId: 'player-2' });
  });

  it('returns a db_error result if the select fails', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await ensurePlayer('device-abc');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });

  it('classifies a thrown TypeError as a network error, never a raw throw', async () => {
    mockedFrom.mockImplementation(() => {
      throw new TypeError('Network request failed');
    });

    const result = await ensurePlayer('device-abc');

    expect(result).toEqual({ ok: false, kind: 'network' });
  });

  it('inserts with the given display name when creating a new player', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: null, error: null })
        : chainableSupabaseResult({ data: { id: 'player-2' }, error: null });
    });

    const result = await ensurePlayer('device-xyz', 'Jordan');

    expect(result).toEqual({ ok: true, playerId: 'player-2' });
    const insertBuilder = mockedFrom.mock.results[1].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith({ device_id: 'device-xyz', display_name: 'Jordan' });
  });

  it('updates the display name on an existing player row', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: { id: 'player-1' }, error: null })
        : chainableSupabaseResult({ error: null });
    });

    const result = await ensurePlayer('device-abc', 'Jordan');

    expect(result).toEqual({ ok: true, playerId: 'player-1' });
    const updateBuilder = mockedFrom.mock.results[1].value;
    expect(updateBuilder.update).toHaveBeenCalledWith({ display_name: 'Jordan' });
  });

  it('does not touch display_name for an existing row when none is given', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: { id: 'player-1' }, error: null }));

    const result = await ensurePlayer('device-abc');

    expect(result).toEqual({ ok: true, playerId: 'player-1' });
    expect(mockedFrom).toHaveBeenCalledTimes(1);
  });

  it('returns a db_error result if the display-name update fails', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: { id: 'player-1' }, error: null })
        : chainableSupabaseResult({ error: { message: 'update failed' } });
    });

    const result = await ensurePlayer('device-abc', 'Jordan');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('flushScoreSnapshot', () => {
  beforeEach(() => jest.clearAllMocks());

  const snapshot = { level1: 60, level2: 0, level3: 0, tokensUsed: 1 };

  it('returns ok:true on a successful insert', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: null }));

    await expect(flushScoreSnapshot('player-1', snapshot)).resolves.toEqual({ ok: true });
  });

  it('returns a typed db_error result instead of throwing on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: { message: 'insert failed' } }));

    await expect(flushScoreSnapshot('player-1', snapshot)).resolves.toEqual({ ok: false, kind: 'db_error' });
  });

  it('never throws a raw error even if the client itself throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('unexpected client crash');
    });

    await expect(flushScoreSnapshot('player-1', snapshot)).resolves.toEqual({ ok: false, kind: 'db_error' });
  });
});
