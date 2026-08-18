import { supabase } from './supabase';

export type SyncErrorKind = 'network' | 'db_error';

export interface ScoreSnapshot {
  level1: number;
  level2: number;
  level3: number;
  tokensUsed: number;
}

export type SyncResult<T extends object = object> = ({ ok: true } & T) | { ok: false; kind: SyncErrorKind };

function classifyError(err: unknown): SyncErrorKind {
  // fetch-level network failures (offline, DNS, etc.) surface as TypeError from the fetch spec
  return err instanceof TypeError ? 'network' : 'db_error';
}

/**
 * Finds or creates the players row for this anonymous device. Never throws —
 * callers get a typed result and decide UI treatment themselves. When
 * `displayName` is given, it's written to the row either way (set on insert
 * for a new row, or applied as an update to an existing one) so a name
 * chosen after the row already exists — e.g. re-submitting on the welcome
 * screen after an earlier offline attempt — still lands in Supabase.
 */
export async function ensurePlayer(deviceId: string, displayName?: string): Promise<SyncResult<{ playerId: string }>> {
  try {
    const { data: existing, error: selectError } = await supabase
      .from('players')
      .select('id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (selectError) return { ok: false, kind: 'db_error' };

    if (existing) {
      if (displayName) {
        const { error: updateError } = await supabase.from('players').update({ display_name: displayName }).eq('id', existing.id);
        if (updateError) return { ok: false, kind: 'db_error' };
      }
      return { ok: true, playerId: existing.id };
    }

    const { data: created, error: insertError } = await supabase
      .from('players')
      .insert(displayName ? { device_id: deviceId, display_name: displayName } : { device_id: deviceId })
      .select('id')
      .single();

    if (insertError || !created) return { ok: false, kind: 'db_error' };
    return { ok: true, playerId: created.id };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * Inserts a full score snapshot (schema is append-only — no UPDATE policy exists).
 * Scores only increase within a playthrough, so the final insert always carries
 * that playthrough's highest total_score, keeping the leaderboard's per-player
 * max() correct even with earlier partial-run rows still in the table.
 */
export async function flushScoreSnapshot(playerId: string, snapshot: ScoreSnapshot): Promise<SyncResult> {
  try {
    const { error } = await supabase.from('scores').insert({
      player_id: playerId,
      level_1_score: snapshot.level1,
      level_2_score: snapshot.level2,
      level_3_score: snapshot.level3,
      tokens_used: snapshot.tokensUsed,
    });
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}
