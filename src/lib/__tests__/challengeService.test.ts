import {
  createChallenge,
  getChallengeByCode,
  getChallengeById,
  getChallengeLeaderboard,
  joinChallenge,
  submitChallengeScore,
} from '../challengeService';
import { supabase } from '../supabase';
import { chainableSupabaseResult } from '../../testHelpers/supabaseMock';

jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

const mockedFrom = supabase.from as jest.Mock;

const challengeRow = {
  id: 'challenge-1',
  code: 'ABC234',
  host_player_id: 'player-1',
  level: 2,
  expires_at: '2026-08-20T00:00:00.000Z',
  created_at: '2026-08-18T00:00:00.000Z',
};

describe('createChallenge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the created challenge on a successful insert', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: challengeRow, error: null }));

    const result = await createChallenge('player-1', 2, 24);

    expect(result).toEqual({ ok: true, challenge: challengeRow });
  });

  it('retries with a fresh code on a unique-constraint collision, then succeeds', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: null, error: { code: '23505', message: 'duplicate code' } })
        : chainableSupabaseResult({ data: challengeRow, error: null });
    });

    const result = await createChallenge('player-1', 2, 24);

    expect(result).toEqual({ ok: true, challenge: challengeRow });
    expect(mockedFrom).toHaveBeenCalledTimes(2);
  });

  it('returns a db_error result without retrying on a non-collision failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { code: '42501', message: 'rls denied' } }));

    const result = await createChallenge('player-1', 2, 24);

    expect(result).toEqual({ ok: false, kind: 'db_error' });
    expect(mockedFrom).toHaveBeenCalledTimes(1);
  });

  it('gives up after repeated collisions rather than retrying forever', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { code: '23505', message: 'duplicate code' } }));

    const result = await createChallenge('player-1', 2, 24);

    expect(result).toEqual({ ok: false, kind: 'db_error' });
    expect(mockedFrom).toHaveBeenCalledTimes(5);
  });

  it('classifies a thrown TypeError as a network error, never a raw throw', async () => {
    mockedFrom.mockImplementation(() => {
      throw new TypeError('Network request failed');
    });

    const result = await createChallenge('player-1', 2, 24);

    expect(result).toEqual({ ok: false, kind: 'network' });
  });
});

describe('getChallengeByCode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the matching challenge', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: challengeRow, error: null }));

    const result = await getChallengeByCode('ABC234');

    expect(result).toEqual({ ok: true, challenge: challengeRow });
  });

  it('returns ok:true with a null challenge when no code matches', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: null }));

    const result = await getChallengeByCode('ZZZZZZ');

    expect(result).toEqual({ ok: true, challenge: null });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await getChallengeByCode('ABC234');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('getChallengeById', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the matching challenge', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: challengeRow, error: null }));

    const result = await getChallengeById('challenge-1');

    expect(result).toEqual({ ok: true, challenge: challengeRow });
  });

  it('returns ok:true with a null challenge when no id matches', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: null }));

    const result = await getChallengeById('missing-id');

    expect(result).toEqual({ ok: true, challenge: null });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await getChallengeById('challenge-1');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('joinChallenge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts a new participant row when none exists yet', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: null, error: null })
        : chainableSupabaseResult({ error: null });
    });

    const result = await joinChallenge('challenge-1', 'player-2');

    expect(result).toEqual({ ok: true, joined: true });
    expect(mockedFrom).toHaveBeenCalledTimes(2);
  });

  it('is idempotent: returns ok:true without inserting when already joined', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: { id: 'participant-1' }, error: null }));

    const result = await joinChallenge('challenge-1', 'player-2');

    expect(result).toEqual({ ok: true, joined: true });
    expect(mockedFrom).toHaveBeenCalledTimes(1);
  });

  it('returns a db_error result if the existence check fails', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await joinChallenge('challenge-1', 'player-2');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });

  it('returns a db_error result if the insert fails', async () => {
    let call = 0;
    mockedFrom.mockImplementation(() => {
      call += 1;
      return call === 1
        ? chainableSupabaseResult({ data: null, error: null })
        : chainableSupabaseResult({ error: { message: 'insert failed' } });
    });

    const result = await joinChallenge('challenge-1', 'player-2');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});

describe('submitChallengeScore', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts only the target level column as non-zero', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: null }));

    const result = await submitChallengeScore('player-2', 'challenge-1', 2, 33, 1);

    expect(result).toEqual({ ok: true });
    const insertBuilder = mockedFrom.mock.results[0].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      player_id: 'player-2',
      challenge_id: 'challenge-1',
      level_1_score: 0,
      level_2_score: 33,
      level_3_score: 0,
      tokens_used: 1,
    });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ error: { message: 'insert failed' } }));

    const result = await submitChallengeScore('player-2', 'challenge-1', 1, 13, 0);

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });

  it('never throws a raw error even if the client itself throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('unexpected client crash');
    });

    await expect(submitChallengeScore('player-2', 'challenge-1', 3, 10, 0)).resolves.toEqual({
      ok: false,
      kind: 'db_error',
    });
  });
});

describe('getChallengeLeaderboard', () => {
  beforeEach(() => jest.clearAllMocks());

  const row = {
    challenge_id: 'challenge-1',
    player_id: 'player-2',
    display_name: 'Jordan',
    total_score: 33,
    tokens_used: 1,
    completed_at: '2026-08-18T00:00:00.000Z',
  };

  it('returns the leaderboard rows', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: [row], error: null }));

    const result = await getChallengeLeaderboard('challenge-1');

    expect(result).toEqual({ ok: true, rows: [row] });
  });

  it('returns an empty array rather than null when there are no rows', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: null }));

    const result = await getChallengeLeaderboard('challenge-1');

    expect(result).toEqual({ ok: true, rows: [] });
  });

  it('returns a db_error result on failure', async () => {
    mockedFrom.mockReturnValue(chainableSupabaseResult({ data: null, error: { message: 'boom' } }));

    const result = await getChallengeLeaderboard('challenge-1');

    expect(result).toEqual({ ok: false, kind: 'db_error' });
  });
});
