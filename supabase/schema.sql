-- BATTLE4GMP — Supabase schema
-- Run in the Supabase SQL editor (or via `supabase db push`).
-- Players are anonymous by default (device-generated UUID persisted in AsyncStorage);
-- `auth_user_id` is nullable and only populated if/when Supabase Auth is added later.

create extension if not exists pgcrypto;

-- ============================================================
-- players
-- ============================================================
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,           -- generated client-side, cached in AsyncStorage
  auth_user_id uuid references auth.users (id) on delete set null,
  display_name text not null default 'Anonymous Pharmacist',
  created_at timestamptz not null default now()
);

comment on table public.players is 'One row per device/session. device_id is the anonymous identity used from the app.';

-- ============================================================
-- scores
-- ============================================================
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  level_1_score integer not null default 0 check (level_1_score >= 0),
  level_2_score integer not null default 0 check (level_2_score >= 0),
  level_3_score integer not null default 0 check (level_3_score >= 0),
  total_score integer generated always as (level_1_score + level_2_score + level_3_score) stored,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  completed_at timestamptz not null default now()
);

create index if not exists scores_player_id_idx on public.scores (player_id);
create index if not exists scores_total_score_idx on public.scores (total_score desc);

comment on table public.scores is 'One row per completed game run. Flushed at game end (and at level completion for partial runs).';

-- ============================================================
-- cached_questions
-- ============================================================
create table if not exists public.cached_questions (
  id uuid primary key default gen_random_uuid(),
  level smallint not null check (level in (1, 2, 3)),
  topic text not null check (topic in ('data_integrity', 'personnel', 'sterility')),
  question_set jsonb not null,
  source text not null default 'deepseek' check (source in ('deepseek', 'fallback')),
  generated_at timestamptz not null default now()
);

create index if not exists cached_questions_level_idx on public.cached_questions (level, generated_at desc);

comment on table public.cached_questions is 'Successful DeepSeek generations, cached so gameplay can fall back to a recent set if the API is unreachable.';

-- ============================================================
-- challenges (async, single-level, code-shared challenge)
-- ============================================================
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_player_id uuid not null references public.players (id) on delete cascade,
  level smallint not null check (level in (1, 2, 3)),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists challenges_host_player_id_idx on public.challenges (host_player_id);

comment on table public.challenges is 'One row per async single-level challenge. code is the shareable join code; topic is implied by level, same pairing cached_questions already uses.';

create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (challenge_id, player_id)
);

create index if not exists challenge_participants_challenge_id_idx on public.challenge_participants (challenge_id);

comment on table public.challenge_participants is 'Who has joined a challenge, independent of whether they have submitted a score yet.';

-- scores gains a nullable tag: a challenge attempt is a parallel scored run,
-- not part of a player's solo total_score history.
alter table public.scores add column if not exists challenge_id uuid references public.challenges (id) on delete cascade;
create index if not exists scores_challenge_id_idx on public.scores (challenge_id);

-- ============================================================
-- leaderboard view — top 10 by each player's best solo total_score
-- (challenge attempts are excluded so a good challenge score never
-- surfaces as a player's all-time solo max)
-- ============================================================
create or replace view public.leaderboard as
select
  p.id as player_id,
  p.display_name,
  s.total_score,
  s.level_1_score,
  s.level_2_score,
  s.level_3_score,
  s.completed_at
from public.scores s
join public.players p on p.id = s.player_id
where s.challenge_id is null
  and s.total_score = (
    select max(s2.total_score)
    from public.scores s2
    where s2.player_id = s.player_id and s2.challenge_id is null
  )
order by s.total_score desc, s.completed_at asc
limit 10;

-- ============================================================
-- challenge_leaderboard view — one row per player per challenge,
-- their best attempt (same "append rows, view derives the max"
-- pattern as leaderboard above)
-- ============================================================
create or replace view public.challenge_leaderboard as
select
  s.challenge_id,
  p.id as player_id,
  p.display_name,
  s.total_score,
  s.tokens_used,
  s.completed_at
from public.scores s
join public.players p on p.id = s.player_id
where s.challenge_id is not null
  and s.total_score = (
    select max(s2.total_score)
    from public.scores s2
    where s2.player_id = s.player_id and s2.challenge_id = s.challenge_id
  )
order by s.challenge_id, s.total_score desc, s.completed_at asc;

-- ============================================================
-- challenge_rooms (live, Kahoot-style room: laptop host + phone players)
-- ============================================================
create table if not exists public.challenge_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_player_id uuid not null references public.players (id) on delete cascade,
  topic text not null check (topic in ('data_integrity', 'personnel', 'sterility')),
  question_set jsonb not null,             -- McqQuestion[] generated once at room creation
  phase text not null default 'lobby' check (phase in ('lobby', 'question', 'reveal', 'leaderboard', 'ended')),
  current_question_index smallint not null default 0,
  phase_started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.challenge_rooms is 'One row per live room. phase/current_question_index/phase_started_at are the host-driven state every client subscribes to via postgres_changes.';

-- Rapid Round: a mixed-topic room pulling questions from all 3 levels at once,
-- so 'mixed' has to be a valid topic value alongside the original 3. Widening
-- an existing inline CHECK constraint needs an explicit drop+recreate (unlike a
-- brand-new column, CREATE TABLE IF NOT EXISTS won't retroactively alter it on a
-- table that already exists in Supabase) — 'challenge_rooms_topic_check' is
-- Postgres's default auto-generated name for an unnamed inline check on the
-- `topic` column of `challenge_rooms`.
alter table public.challenge_rooms drop constraint if exists challenge_rooms_topic_check;
alter table public.challenge_rooms add constraint challenge_rooms_topic_check
  check (topic in ('data_integrity', 'personnel', 'sterility', 'mixed'));

-- Per-room question duration (Rapid Round uses 20s; existing topic rooms keep
-- their original 15s default) — was previously a single shared constant
-- (QUESTION_DURATION_MS) baked into the client, which couldn't vary per room.
alter table public.challenge_rooms add column if not exists question_duration_ms integer not null default 15000 check (question_duration_ms > 0);

-- Dropped the standalone per-question 'leaderboard' phase — reveal now
-- auto-advances straight to the next question (or to 'ended'), which already
-- shows the full/final leaderboard. Bump any room already sitting in
-- 'leaderboard' (from a game in progress before this change) to 'ended' FIRST,
-- since ADD CONSTRAINT validates every existing row and would otherwise fail
-- outright the moment any such row exists.
update public.challenge_rooms set phase = 'ended' where phase = 'leaderboard';

alter table public.challenge_rooms drop constraint if exists challenge_rooms_phase_check;
alter table public.challenge_rooms add constraint challenge_rooms_phase_check
  check (phase in ('lobby', 'question', 'reveal', 'ended'));

create table if not exists public.challenge_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.challenge_rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  display_name_snapshot text not null,     -- captured at join; a later name change shouldn't rewrite this room's board
  joined_at timestamptz not null default now(),
  unique (room_id, player_id)
);

-- is_correct/points are computed client-side (computeRoomAnswerScore) and simply
-- inserted, not re-derived/validated server-side — a motivated client could spoof
-- them, same trust concession as every wide-open write policy in this schema
-- (anon key only, no backend to broker/verify writes; see .env.example). Fine for
-- a classroom prototype; would need a Postgres function or edge function doing the
-- scoring itself to close for real.
create table if not exists public.challenge_room_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.challenge_rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  question_index smallint not null,
  selected_option smallint not null check (selected_option between 0 and 3),
  is_correct boolean not null,
  answer_ms integer not null check (answer_ms >= 0),
  points integer not null check (points >= 0),
  answered_at timestamptz not null default now(),
  unique (room_id, player_id, question_index)
);

create index if not exists challenge_room_answers_room_q_idx on public.challenge_room_answers (room_id, question_index);

-- ============================================================
-- challenge_room_leaderboard view — live standings for one room
-- ============================================================
create or replace view public.challenge_room_leaderboard as
select
  a.room_id,
  p.id as player_id,
  rp.display_name_snapshot as display_name,
  sum(a.points) as total_points,
  count(*) filter (where a.is_correct) as correct_count,
  max(a.answered_at) as last_answered_at
from public.challenge_room_answers a
join public.players p on p.id = a.player_id
join public.challenge_room_players rp on rp.room_id = a.room_id and rp.player_id = a.player_id
group by a.room_id, p.id, rp.display_name_snapshot
order by a.room_id, total_points desc;

-- ============================================================
-- room_invites — direct "come join this room" invites between players,
-- delivered to the invitee via postgres_changes (persisted, so an invite sent
-- while the invitee's app is closed still shows up next time they open it,
-- unlike a pure ephemeral broadcast).
-- ============================================================
create table if not exists public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.challenge_rooms (id) on delete cascade,
  room_code text not null,                 -- denormalized: the invitee's client can navigate
                                            -- straight to /room/[code] with no extra lookup
  inviter_player_id uuid not null references public.players (id) on delete cascade,
  inviter_display_name text not null,      -- denormalized (captured at send time, like
                                            -- challenge_room_players.display_name_snapshot):
                                            -- lets the invitee's banner show who invited them
                                            -- with no join back to players
  invitee_player_id uuid not null references public.players (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (room_id, invitee_player_id)      -- re-inviting the same person to the same room upserts
);

comment on table public.room_invites is 'One row per invite. status is updated by the invitee on accept/decline; inserted by the inviter via sendInvite.';

-- ============================================================
-- Realtime publication membership
--
-- REQUIRED for any postgres_changes subscription to receive anything at all.
-- Supabase only emits change events for tables that are members of the
-- `supabase_realtime` publication, and tables are NOT added to it automatically
-- when created. A subscription to a non-member table still reports SUBSCRIBED
-- and then silently delivers zero events forever — which is exactly how this
-- was originally missed (see ISSUES_AND_SOLUTIONS.md).
--
-- Wrapped in an idempotency guard because ALTER PUBLICATION ... ADD TABLE has
-- no IF NOT EXISTS and errors on a re-run, and this whole file is meant to be
-- safely re-runnable.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenge_rooms'
    ) then
      alter publication supabase_realtime add table public.challenge_rooms;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_invites'
    ) then
      alter publication supabase_realtime add table public.room_invites;
    end if;
  end if;
end $$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.players enable row level security;
alter table public.scores enable row level security;
alter table public.cached_questions enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_rooms enable row level security;
alter table public.challenge_room_players enable row level security;
alter table public.challenge_room_answers enable row level security;
alter table public.room_invites enable row level security;

-- Every policy below is preceded by `drop policy if exists` so this whole file can
-- be re-run safely at any point (CREATE POLICY has no IF NOT EXISTS in Postgres) —
-- matters here specifically because players/scores/cached_questions' policies were
-- already applied to the live project before this session, and would otherwise
-- error out ("policy already exists") partway through a re-run.

-- players: anyone (anon key) can create their own row and read/update it.
-- There is no per-row secrecy requirement (display_name + device_id are not sensitive),
-- so reads are open to support the leaderboard join; writes are open because the app
-- has no server component to broker inserts on the player's behalf.
drop policy if exists "players_select_all" on public.players;
create policy "players_select_all" on public.players
  for select using (true);

drop policy if exists "players_insert_all" on public.players;
create policy "players_insert_all" on public.players
  for insert with check (true);

drop policy if exists "players_update_own" on public.players;
create policy "players_update_own" on public.players
  for update using (true) with check (true);

-- scores: open insert/select so the client can flush scores and read the leaderboard.
drop policy if exists "scores_select_all" on public.scores;
create policy "scores_select_all" on public.scores
  for select using (true);

drop policy if exists "scores_insert_all" on public.scores;
create policy "scores_insert_all" on public.scores
  for insert with check (true);

-- cached_questions: open read (fallback loading) and insert (caching a fresh generation).
-- No update/delete policy — cached sets are append-only from the client.
drop policy if exists "cached_questions_select_all" on public.cached_questions;
create policy "cached_questions_select_all" on public.cached_questions
  for select using (true);

drop policy if exists "cached_questions_insert_all" on public.cached_questions;
create policy "cached_questions_insert_all" on public.cached_questions
  for insert with check (true);

-- challenges: open read (so a code lookup works for anyone) and insert (creating
-- a challenge). No update/delete policy for V1 — a challenge is immutable once
-- created.
drop policy if exists "challenges_select_all" on public.challenges;
create policy "challenges_select_all" on public.challenges
  for select using (true);

drop policy if exists "challenges_insert_all" on public.challenges;
create policy "challenges_insert_all" on public.challenges
  for insert with check (true);

-- challenge_participants: open read/insert, no update/delete — append-only,
-- matches scores/cached_questions.
drop policy if exists "challenge_participants_select_all" on public.challenge_participants;
create policy "challenge_participants_select_all" on public.challenge_participants
  for select using (true);

drop policy if exists "challenge_participants_insert_all" on public.challenge_participants;
create policy "challenge_participants_insert_all" on public.challenge_participants
  for insert with check (true);

-- challenge_rooms: open read/insert, matching every other table in this schema.
-- UPDATE is intentionally wide open (using(true)/with check(true)) too: RLS can
-- only trust auth.uid() from a real Supabase Auth session, and this app has none
-- (anon key only; device_id is a client-claimed value with nothing
-- server-verifiable behind it) — so a genuinely host-only UPDATE policy isn't
-- achievable today. This means any client could in principle advance someone
-- else's room; an accepted risk consistent with this app's existing documented
-- anon-key/no-backend posture (see .env.example), not a new one. Real host-only
-- enforcement needs Supabase anonymous auth (supabase.auth.signInAnonymously())
-- wired to players.auth_user_id (already anticipated by that column) as
-- separate, later work if it becomes a real problem in practice.
drop policy if exists "challenge_rooms_select_all" on public.challenge_rooms;
create policy "challenge_rooms_select_all" on public.challenge_rooms
  for select using (true);

drop policy if exists "challenge_rooms_insert_all" on public.challenge_rooms;
create policy "challenge_rooms_insert_all" on public.challenge_rooms
  for insert with check (true);

drop policy if exists "challenge_rooms_update_all" on public.challenge_rooms;
create policy "challenge_rooms_update_all" on public.challenge_rooms
  for update using (true) with check (true);

drop policy if exists "challenge_room_players_select_all" on public.challenge_room_players;
create policy "challenge_room_players_select_all" on public.challenge_room_players
  for select using (true);

drop policy if exists "challenge_room_players_insert_all" on public.challenge_room_players;
create policy "challenge_room_players_insert_all" on public.challenge_room_players
  for insert with check (true);

drop policy if exists "challenge_room_answers_select_all" on public.challenge_room_answers;
create policy "challenge_room_answers_select_all" on public.challenge_room_answers
  for select using (true);

-- Unlike the host-update case above, this one CAN be meaningfully narrowed: it
-- only reads another row's state, not a client-claimed identity, so it's
-- trustworthy — only allow inserting an answer while the room is actually in
-- the 'question' phase.
drop policy if exists "challenge_room_answers_insert_all" on public.challenge_room_answers;
create policy "challenge_room_answers_insert_all" on public.challenge_room_answers
  for insert with check (exists (
    select 1 from public.challenge_rooms r where r.id = room_id and r.phase = 'question'
  ));

-- room_invites: same wide-open trust model as the rest of this schema (anon key
-- only, device_id/player_id are client-claimed with nothing server-verifiable
-- behind them — see the challenge_rooms_update_all comment above for the full
-- reasoning, not repeated here). select/insert/update are all open; the client
-- filters select by its own claimed invitee_player_id, and update is how the
-- invitee marks their own invite accepted/declined.
drop policy if exists "room_invites_select_all" on public.room_invites;
create policy "room_invites_select_all" on public.room_invites
  for select using (true);

drop policy if exists "room_invites_insert_all" on public.room_invites;
create policy "room_invites_insert_all" on public.room_invites
  for insert with check (true);

drop policy if exists "room_invites_update_all" on public.room_invites;
create policy "room_invites_update_all" on public.room_invites
  for update using (true) with check (true);
