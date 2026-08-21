import { supabase } from './supabase';
import { generateJoinCode } from './joinCode';
import { McqQuestion } from './mcqService';
import { ChallengeRoomLeaderboardRow, ChallengeRoomRow, RoomPhase, RoomTopic } from '../types/database';
import { SyncErrorKind, SyncResult } from './scoreSync';

const MAX_CODE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

// Default question duration for topic-based rooms — shared by the host's
// countdown display and computeRoomAnswerScore's speed bonus, so both sides of
// the room agree on the same window. Stored per-room (question_duration_ms) so
// a room can override it, e.g. Rapid Round's shorter window below.
export const QUESTION_DURATION_MS = 15000;
export const RAPID_QUESTION_DURATION_MS = 20000;
export const RAPID_QUESTION_COUNT = 10;

// How long the reveal screen holds before auto-advancing to the next question
// (or to 'ended' on the last one) — no per-question leaderboard step anymore,
// reveal moves straight on by itself.
export const REVEAL_DURATION_MS = 5000;

function classifyError(err: unknown): SyncErrorKind {
  // fetch-level network failures (offline, DNS, etc.) surface as TypeError from the fetch spec
  return err instanceof TypeError ? 'network' : 'db_error';
}

/**
 * Only 'question' and 'reveal' are timed phases that auto-advance; 'lobby' and
 * 'ended' wait on a person. Shared by both room screens so the countdown/
 * auto-advance logic reads one duration off the room's own current phase
 * instead of each screen re-deriving it.
 */
export function getPhaseDurationMs(room: Pick<ChallengeRoomRow, 'phase' | 'question_duration_ms'>): number {
  if (room.phase === 'question') return room.question_duration_ms;
  if (room.phase === 'reveal') return REVEAL_DURATION_MS;
  return 0;
}

export async function createRoom(
  hostPlayerId: string,
  topic: RoomTopic,
  questions: McqQuestion[],
  questionDurationMs: number = QUESTION_DURATION_MS
): Promise<SyncResult<{ room: ChallengeRoomRow }>> {
  try {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateJoinCode();
      const { data, error } = await supabase
        .from('challenge_rooms')
        .insert({ code, host_player_id: hostPlayerId, topic, question_set: questions, question_duration_ms: questionDurationMs })
        .select()
        .single();

      if (!error && data) return { ok: true, room: data };
      if (error?.code !== UNIQUE_VIOLATION) return { ok: false, kind: 'db_error' };
    }
    return { ok: false, kind: 'db_error' };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

export async function getRoomByCode(code: string): Promise<SyncResult<{ room: ChallengeRoomRow | null }>> {
  try {
    const { data, error } = await supabase.from('challenge_rooms').select().eq('code', code).maybeSingle();
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true, room: data };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/** By-id refetch used by the polling safety net in useRoomSync. */
export async function getRoomById(roomId: string): Promise<SyncResult<{ room: ChallengeRoomRow | null }>> {
  try {
    const { data, error } = await supabase.from('challenge_rooms').select().eq('id', roomId).maybeSingle();
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true, room: data };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * Guards against out-of-order room updates. Two independent sources now feed
 * room state (a realtime event and a polling refetch), so a slow poll response
 * can land *after* a newer realtime event and would otherwise snap the UI
 * backwards — e.g. from 'question' back to 'lobby' mid-round.
 *
 * phase_started_at is re-stamped on every advancePhase, so it totally orders
 * room states. An update that is byte-identical in the fields the UI renders is
 * also rejected, so the 3s poll doesn't trigger a pointless re-render (and
 * restart the countdown effect) every single tick when nothing has changed.
 */
export function shouldApplyRoomUpdate(current: ChallengeRoomRow | null, incoming: ChallengeRoomRow): boolean {
  if (!current) return true;
  if (current.id !== incoming.id) return true;

  const isSameState =
    current.phase === incoming.phase &&
    current.current_question_index === incoming.current_question_index &&
    current.phase_started_at === incoming.phase_started_at;
  if (isSameState) return false;

  return new Date(incoming.phase_started_at).getTime() >= new Date(current.phase_started_at).getTime();
}

/** Idempotent: re-joining a room already joined is a no-op success. */
export async function joinRoom(roomId: string, playerId: string, displayName: string): Promise<SyncResult<{ joined: true }>> {
  try {
    const { data: existing, error: selectError } = await supabase
      .from('challenge_room_players')
      .select('id')
      .eq('room_id', roomId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (selectError) return { ok: false, kind: 'db_error' };
    if (existing) return { ok: true, joined: true };

    const { error: insertError } = await supabase
      .from('challenge_room_players')
      .insert({ room_id: roomId, player_id: playerId, display_name_snapshot: displayName });

    if (insertError) return { ok: false, kind: 'db_error' };
    return { ok: true, joined: true };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * Host-only in intent (not RLS-enforced — see the schema.sql comment on
 * challenge_rooms_update_all). Always stamps a fresh phase_started_at so every
 * client derives its own countdown locally instead of needing a ticking broadcast.
 */
/**
 * Host-only in intent (not RLS-enforced — see the schema.sql comment on
 * challenge_rooms_update_all). Always stamps a fresh phase_started_at so every
 * client derives its own countdown locally instead of needing a ticking broadcast.
 *
 * Returns the updated row so the caller can apply it to its own state
 * immediately. The host must never wait on the realtime echo of its *own*
 * write to see its own button take effect — that made START look completely
 * dead whenever realtime was unavailable, and added a needless round-trip of
 * latency even when it was working.
 */
export async function advancePhase(
  roomId: string,
  phase: RoomPhase,
  questionIndex?: number
): Promise<SyncResult<{ room: ChallengeRoomRow }>> {
  try {
    const update: { phase: RoomPhase; phase_started_at: string; current_question_index?: number } = {
      phase,
      phase_started_at: new Date().toISOString(),
    };
    if (questionIndex !== undefined) update.current_question_index = questionIndex;

    const { data, error } = await supabase.from('challenge_rooms').update(update).eq('id', roomId).select().single();
    if (error || !data) return { ok: false, kind: 'db_error' };
    return { ok: true, room: data };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

export async function submitAnswer(
  roomId: string,
  playerId: string,
  questionIndex: number,
  selectedOption: 0 | 1 | 2 | 3,
  isCorrect: boolean,
  answerMs: number,
  points: number
): Promise<SyncResult> {
  try {
    const { error } = await supabase.from('challenge_room_answers').insert({
      room_id: roomId,
      player_id: playerId,
      question_index: questionIndex,
      selected_option: selectedOption,
      is_correct: isCorrect,
      answer_ms: answerMs,
      points,
    });
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/** Per-option answer counts for one question, for the host's reveal-phase tally. */
export async function getQuestionAnswerTally(
  roomId: string,
  questionIndex: number
): Promise<SyncResult<{ counts: [number, number, number, number] }>> {
  try {
    const { data, error } = await supabase
      .from('challenge_room_answers')
      .select('selected_option')
      .eq('room_id', roomId)
      .eq('question_index', questionIndex);
    if (error) return { ok: false, kind: 'db_error' };

    const counts: [number, number, number, number] = [0, 0, 0, 0];
    for (const row of data ?? []) {
      counts[row.selected_option] += 1;
    }
    return { ok: true, counts };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

export async function getRoomLeaderboard(roomId: string): Promise<SyncResult<{ rows: ChallengeRoomLeaderboardRow[] }>> {
  try {
    const { data, error } = await supabase
      .from('challenge_room_leaderboard')
      .select()
      .eq('room_id', roomId)
      .order('total_points', { ascending: false });
    if (error) return { ok: false, kind: 'db_error' };
    return { ok: true, rows: data ?? [] };
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
}

/**
 * Subscribes to the room row's phase/question-index state via postgres_changes
 * (persisted, survives a host refresh/reconnect, no custom payload contract to
 * design). Returns an unsubscribe function — always call it on unmount.
 */
export function subscribeToRoom(roomId: string, onChange: (room: ChallengeRoomRow) => void): () => void {
  const channel = supabase
    .channel(`room-state-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'challenge_rooms', filter: `id=eq.${roomId}` },
      (payload) => onChange(payload.new as ChallengeRoomRow)
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * A separate, ephemeral presence channel purely for "who/how many are
 * connected right now" — deliberately decoupled from the persisted game-phase
 * state above, since presence auto-clears on disconnect in a way a DB table
 * can't do for free. Returns an unsubscribe function — always call it on unmount.
 */
export function subscribeToPresence(
  roomId: string,
  playerId: string,
  displayName: string,
  onSync: (names: string[]) => void
): () => void {
  const channel = supabase.channel(`room-presence-${roomId}`, { config: { presence: { key: playerId } } });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<{ displayName: string }>();
    const names = Object.values(state)
      .flat()
      .map((entry) => entry.displayName);
    onSync(names);
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
