import { supabase } from './supabase';
import { generateJoinCode } from './joinCode';
import { ChallengeLeaderboardRow, ChallengeRow } from '../types/database';
import { SyncErrorKind, SyncResult } from './scoreSync';

const MAX_CODE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

function classifyError(err: unknown): SyncErrorKind {
  // fetch-level network failures (offline, DNS, etc.) surface as TypeError from the fetch spec
  return err instanceof TypeError ? 'network' : 'db_error';
}

/**
 * Creates a challenge with a freshly generated join code, retrying with a new
 * code on a unique-constraint collision (extremely unlikely at this alphabet
 * size, but codes are short enough it's worth handling rather than assuming
 * away). Any other insert failure is not retried.
 */
export async function createChallenge(
  hostPlayerId: string,
  level: 1 | 2 | 3,
  windowHours: number
): Promise<SyncResult<{ challenge: ChallengeRow }>> {
  const expiresAt = new Date(Date.now() + windowHours * 60 * 60 * 1000).toISOString();

  try {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateJoinCode();
      const { data, error } = await supabase
        .from('challenges')
        .insert({ code, host_player_id: hostPlayerId, level, expires_at: expiresAt })
        .select()
        .single();

      if (!error && data) return { ok: true, challenge: data };
      if (error?.code !== UNIQUE_VIOLATION) return { ok: false, kind: 'db_error' };
    }
    return { ok: false, kind: 'db_error' };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

export async function getChallengeByCode(code: string): Promise<SyncResult<{ challenge: ChallengeRow | null }>> {
  try {
    const { data, error } = await supabase.from('challenges').select().eq('code', code).maybeSingle();
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true, challenge: data };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

export async function getChallengeById(id: string): Promise<SyncResult<{ challenge: ChallengeRow | null }>> {
  try {
    const { data, error } = await supabase.from('challenges').select().eq('id', id).maybeSingle();
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true, challenge: data };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * Idempotent: re-joining a challenge already joined is a no-op success, not
 * a unique-constraint error surfaced to the caller.
 */
export async function joinChallenge(challengeId: string, playerId: string): Promise<SyncResult<{ joined: true }>> {
  try {
    const { data: existing, error: selectError } = await supabase
      .from('challenge_participants')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (selectError) return { ok: false, kind: 'db_error' };
    if (existing) return { ok: true, joined: true };

    const { error: insertError } = await supabase
      .from('challenge_participants')
      .insert({ challenge_id: challengeId, player_id: playerId });

    if (insertError) return { ok: false, kind: 'db_error' };
    return { ok: true, joined: true };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * A challenge attempt is a parallel scored run (challenge_id set), never
 * touching the player's solo score history — only the target level's score
 * column is non-zero.
 */
export async function submitChallengeScore(
  playerId: string,
  challengeId: string,
  level: 1 | 2 | 3,
  score: number,
  tokensUsed: number
): Promise<SyncResult> {
  try {
    const { error } = await supabase.from('scores').insert({
      player_id: playerId,
      challenge_id: challengeId,
      level_1_score: level === 1 ? score : 0,
      level_2_score: level === 2 ? score : 0,
      level_3_score: level === 3 ? score : 0,
      tokens_used: tokensUsed,
    });
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

export async function getChallengeLeaderboard(challengeId: string): Promise<SyncResult<{ rows: ChallengeLeaderboardRow[] }>> {
  try {
    const { data, error } = await supabase
      .from('challenge_leaderboard')
      .select()
      .eq('challenge_id', challengeId)
      .order('total_score', { ascending: false });
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true, rows: data ?? [] };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}
