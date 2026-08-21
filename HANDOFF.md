# HANDOFF — BATTLE4GMP

Last updated: 2026-08-21 — **two pieces of work this session, both IMPLEMENTED, neither
hands-on verified yet, and the schema has new changes not yet applied to Supabase.**
See "Reinstall identity fix" and "Rapid Round + online presence/invites" below (in that
order — the identity fix happened first). Everything from 2026-08-18 (Stage 1 Async
Challenge + Stage 2 Live Host Room) and 2026-08-17 (Level 3 rebuild etc.) is preserved
further below and still current/unchanged, except where this session's work explicitly
touches Stage 2's room code (called out inline below).

## Reinstall identity fix: device_id now survives uninstall/reinstall (2026-08-21)

User reported that uninstalling and reinstalling the app creates a **new** `players` row
instead of recovering the original — confirmed against live data (`players` had several
duplicate `display_name`s, each on a different `device_id`, minted minutes apart, from
repeated reinstalls during testing). Root cause: `src/lib/deviceId.ts`'s
`getOrCreateDeviceId()` stored the anonymous `device_id` only in AsyncStorage, which is
wiped on uninstall (both platforms). Full root-cause writeup and fix rationale is logged
in `ISSUES_AND_SOLUTIONS.md` ("Uninstalling and reinstalling the app creates a duplicate
players row instead of recovering the original") — not repeated here.

**Fix, in one line**: when AsyncStorage is empty (fresh install *or* reinstall,
indistinguishable from inside the app), fall back to a platform store that actually
outlives an uninstall — `Application.getAndroidId()` (`expo-application`) on Android,
`expo-secure-store` (Keychain, checked first before minting) on iOS — before minting a
random id. Existing installs are untouched (still short-circuits on a cached AsyncStorage
id), so this can't fragment anyone already using the app. Added
`src/lib/__tests__/deviceId.test.ts` (9 cases). Both new native-module packages
(`expo-application`, `expo-secure-store`) need **a dev client rebuild**, not just a JS
reload, to take effect — flagged to the user, not yet done as of this write-up.

**Verification status**: `npx tsc --noEmit` clean, `npm test` 248/248 at that point. Not
hands-on verified (would need an actual uninstall/reinstall cycle on a real device/dev
client build).

## Rapid Round + online presence/invites (2026-08-21, same session as the fix above)

User asked for: a "Rapid Round" multiplayer mode — 10 MCQ questions mixed from all 3
levels' term pools (not one topic), 20s per question, scored by speed+accuracy, top-to-
bottom leaderboard at the end — plus the ability to see which players are online and
invite them directly into a room. Planned via `EnterPlanMode` (approved plan saved at
`C:\Users\hi\.claude\plans\gentle-forging-chipmunk.md`, full rationale there) before any
code, per workflow rule 2. Two decisions confirmed with the user via `AskUserQuestion`
before building, both **the more expensive option**, not the lighter-weight default this
session recommended — worth knowing if extending this further:
- **Presence is app-wide from launch**, not scoped to just the multiplayer hub — a
  player counts as "online" any time the app is open at all, at the cost of one Realtime
  connection staying open for the entire session (not just while on a multiplayer
  screen).
- **Rapid Round folds into the existing `app/room/create.tsx`** as a 4th topic-picker
  option ("Rapid Round"), rather than a separate route.

**This reuses essentially all of Stage 2's existing Live Host Room machinery**
(`challenge_rooms`/`challenge_room_players`/`challenge_room_answers`, `mcqService.ts`,
`roomService.ts`, `computeRoomAnswerScore` — already exactly a speed+accuracy formula,
untouched) — Rapid Round is a variant (mixed-topic pool, fixed 10 questions/20s), not a
new system. The only genuinely new piece is presence/invites.

**Schema** (`supabase/schema.sql`, **not yet applied to Supabase — same standing caveat
as every prior multiplayer session**):
- `challenge_rooms.topic` check constraint widened to also allow `'mixed'` (needed an
  explicit `drop constraint` + `add constraint`, not just `if not exists`, since it's
  altering an existing constraint on a table that may already exist live — the
  auto-generated constraint name assumed is `challenge_rooms_topic_check`, Postgres's
  default naming for an unnamed inline check; worth double-checking that name matches
  what's actually live if the apply step errors).
- `challenge_rooms.question_duration_ms` (new column, default 15000) — replaces the old
  single shared `QUESTION_DURATION_MS` client constant with a per-room value, so Rapid's
  20s and topic rooms' 15s coexist. `app/room/[code].tsx` and `app/room/[code]/play.tsx`
  both now read `room.question_duration_ms` instead of the old constant (pure
  generalization — existing topic rooms are unaffected, still default 15000).
- New table `room_invites` (id, room_id, room_code, inviter_player_id,
  inviter_display_name, invitee_player_id, status, created_at, unique on
  `(room_id, invitee_player_id)` so re-inviting upserts rather than erroring/piling up).
  `room_code`/`inviter_display_name` are both **denormalized** (like
  `challenge_room_players.display_name_snapshot`) so the invitee's client never needs a
  join back to `players`/`challenge_rooms` just to render the invite banner or navigate.
  RLS follows this schema's existing wide-open trust model (documented inline, same
  reasoning as `challenge_rooms_update_all`).

**`src/lib/mcqService.ts`** — added `generateMixedMcqQuestions(count, rng?)`. Splits
`count` as evenly as possible across all 3 topics (10 → 4/3/3, which topic gets the extra
question is randomized via `rng`, not fixed); generates each topic **fully
independently** (own DeepSeek call, own try/catch → static fallback) so one topic's
DeepSeek hiccup doesn't wipe the other two's fresh wording; distractors for a question
are always drawn from that question's own topic pool (never cross-topic — would make
some questions trivially guessable by category); final question order is shuffled so
topics aren't grouped. 6 new test cases in `mcqService.test.ts`.

**`src/lib/roomService.ts`** — `createRoom` gained an optional 4th param
`questionDurationMs` (defaults to `QUESTION_DURATION_MS` = 15000). Added
`RAPID_QUESTION_DURATION_MS` (20000) and `RAPID_QUESTION_COUNT` (10) constants. 2 new
test cases.

**`src/lib/presenceService.ts`** (new) — `subscribeToLobbyPresence(playerId, displayName,
onSync)`, a single shared app-wide channel (`'lobby-presence'`) every session with a
resolved `playerId` tracks itself on for the whole session. Near-exact mirror of
`roomService.ts`'s existing `subscribeToPresence`, just global scope instead of one room
— and richer: reports `{playerId, displayName}[]` (not just names), since the invite flow
needs the target's real `playerId`. 3 new tests (`presenceService.test.ts`).

**`src/lib/inviteService.ts`** (new) — `sendInvite`/`respondToInvite`/
`getPendingInvitesForPlayer`/`subscribeToInvites`, following the same
`SyncResult`/never-throw conventions as every other service in this codebase.
`subscribeToInvites` uses `postgres_changes` INSERT (persisted), not `broadcast` —
same reasoning as `subscribeToRoom` elsewhere: it's the same table
`getPendingInvitesForPlayer` reads from, so there's no separate ephemeral payload
contract to design or let drift. 9 new tests (`inviteService.test.ts`).
`src/testHelpers/supabaseMock.ts`'s `chainableSupabaseResult` gained `'upsert'` to its
chainable method list (needed for `sendInvite`'s upsert-on-conflict).

**`useGameStore.ts`** — new **non-persisted** state: `onlinePlayers: OnlinePlayer[]`,
`pendingInvite: PendingInvite | null` (one at a time; a second invite arriving while one
is showing just replaces it — not worth a queue). This is the **first time this store
needed a `partialize`** (previously the whole state was persisted by default) —
excludes exactly these two keys, since persisting a stale roster or resurfacing an
already-handled invite after a restart would be wrong; everything else keeps persisting
exactly as before. New `setOnlinePlayers`/`setPendingInvite`/`clearPendingInvite`
actions. 4 new test cases including one asserting the `partialize` exclusion directly.

**`app/_layout.tsx`** — owns the app-wide subscription lifecycle: a `useEffect` keyed on
`playerId` (already reliably resolved shortly after launch by the existing
`initDeviceId().then(flushPendingSync)` chain — no new eager-resolve logic needed) starts
`subscribeToLobbyPresence` + `subscribeToInvites`, plus a one-time
`getPendingInvitesForPlayer` catch-up fetch for anything sent while the app was closed
(takes the oldest pending one if there are several). Renders the new
`<IncomingInviteBanner />` above the `<Stack>` so an invite is visible regardless of
current screen.

**`src/components/multiplayer/IncomingInviteBanner.tsx`** (new) — dismissible inline
card (not a modal — missing it is safe, the player just doesn't join), "`{inviter}`
invited you to a live room — JOIN / DISMISS". Join calls `joinRoom` +
`respondToInvite('accepted')` + navigates to `/room/[code]/play`; Dismiss calls
`respondToInvite('declined')`. Not unit-tested (pure UI component, same testing-boundary
precedent as the rest of this codebase's screens) — needs hands-on verification.

**`app/room/[code].tsx`** (host/big-screen view) — new host-only "INVITE ONLINE PLAYERS"
section in the lobby phase, below the existing room-scoped "CONNECTED" presence list.
Lists the global `onlinePlayers` roster minus the host themselves minus anyone whose
display name already appears in this room's own presence list — **that second exclusion
is a name-based approximation**, not a true player-id-based one (would need an extra
query against `challenge_room_players`; skipped as unnecessary complexity, and
consistent with this app's already-accepted "anonymous display names aren't unique"
limitation elsewhere). Each row has an "INVITE" button → `sendInvite(...)`, with an
optimistic per-row "INVITED ✓" state after it succeeds. Empty state: "No one else is
online right now — share the code instead."

**`app/room/create.tsx`** — `TOPIC_OPTIONS` gained a 4th card ("Rapid Round — 10 mixed
questions across all 3 levels · 20s each"), `topic` state is now `RoomTopic` (=
`QuestionTopic | 'mixed'`, new type in `database.ts` — deliberately **not** widening
`QuestionTopic` itself, since `'mixed'` is only ever valid for rooms, never for
`cached_questions` or the solo-level generators). `handleCreate` branches only at the 2
call sites that differ (`generateMixedMcqQuestions` vs `generateMcqQuestions`,
`RAPID_QUESTION_DURATION_MS` vs `QUESTION_DURATION_MS`) — everything else (leaderboard
view, `LeaderboardList` component, reveal/tally logic, `advancePhase`) needed **zero**
changes, since they already just aggregate `points` per player regardless of topic.

**Explicitly out of scope, flagged not silently dropped**: no OS push notifications — an
invite only delivers live while the invitee's app is open (which is what "online" means
here); reaching a fully-closed app needs `expo-notifications` + push-token registration,
a separate larger feature. Anonymous display names still aren't unique (pre-existing
limitation, not solved here).

**Verification status**: `npx tsc --noEmit` clean, `npm test` 272/272 (24 new this part:
6 mcqService + 2 roomService + 3 presenceService + 9 inviteService + 4 useGameStore).
**Nothing hands-on has been tried** — checklist:

1. **Apply the full current schema** to Supabase before any of this works end-to-end —
   including the `challenge_rooms_topic_check` constraint widening and the new
   `room_invites` table (see schema notes above).
2. **Rebuild the dev client** if testing on a native device/simulator (not just `npm run
   web`) — this session's earlier fix (see above) added `expo-application`/
   `expo-secure-store`, both native modules.
3. Host: "Play with Friends" → "Host a Live Room" → pick **"Rapid Round"** → confirm it
   generates 10 questions (watch for slow-loading text past ~5s) and lands on the room
   screen.
4. From a **second session/device** (need a real second `playerId` — e.g. a second
   browser profile or a second physical device, not just a second tab sharing the same
   AsyncStorage/session): confirm that device shows up in the **first** device's
   "INVITE ONLINE PLAYERS" list on the room lobby screen once both have the app open.
5. Tap **Invite** on that player — confirm the row flips to "INVITED ✓", and confirm the
   **invitee's** device shows the incoming-invite banner **immediately**, from
   *whatever screen it's currently on* (not just the multiplayer hub) — this is the main
   point of app-wide presence.
6. Tap **Join** on the banner — confirm it lands the invitee on the room's play screen.
7. Tap **Dismiss** on a different invite — confirm it clears without navigating.
8. Close the invitee's app entirely, send it another invite, then reopen the app —
   confirm the banner still appears (the catch-up-fetch path, not the live-subscribe
   path).
9. Play through a full Rapid Round: confirm the countdown is **20s** (not 15s), all 10
   questions visibly draw from more than one level's terms, and the final leaderboard
   sorts best-to-worst by total points.
10. Confirm an **ordinary topic room** (Data Integrity/Personnel/Sterility) still behaves
    exactly as before — 15s countdown, single-topic questions — to confirm the
    duration/topic generalization didn't regress Stage 2's existing behavior.

If anything misbehaves: a room stuck showing 15s on what should be a Rapid room, or vice
versa, is most likely `question_duration_ms` not actually landing in the `createRoom`
insert (check `RAPID_QUESTION_DURATION_MS` is being passed in `room/create.tsx`); an
invite never arriving live is most likely `subscribeToInvites`' `postgres_changes`
filter or RLS on `room_invites`; an invite banner showing the wrong inviter name is most
likely `inviter_display_name` not being captured correctly at `sendInvite` time.

This is a long, dense session (a bug fix plus a full multiplayer feature) — **a good
point to start a fresh chat** for whatever comes next, per workflow rule 7.

## Multiplayer Stage 2 — Live Host Room: IMPLEMENTED, needs hands-on verification (2026-08-18)

Built immediately after Stage 1 in the same session, per the same plan file
(`C:\Users\hi\.claude\plans\pure-gliding-kay.md`, Stage 2 section). **User was asked
whether to verify Stage 1 first and explicitly chose to proceed with Stage 2
anyway** — so treat Stage 1 as also still fully unverified hands-on, not just Stage 2.

**Confirmed with the user before building**: Stage 2 uses a **new multiple-choice
question format** (prompt + 4 options, generated from the existing term pools by
topic) — it is NOT a synchronized version of the crossword/drag-match/word-search
screens. Those stay solo/Stage-1-challenge only.

**Design clarification worked out during this build** (the brainstorm's own wording
was ambiguous on this point — resolved by re-reading it closely, not re-asked): the
big screen (laptop) shows the **question prompt only, never the 4 options**; each
phone shows **only the 4 answer-option buttons (with their text), never the question
prompt**. A player has to be looking at the shared screen to know *what's being
asked*, and their own phone to answer it — that's what the brainstorm's "otherwise the
big screen is just redundant with what the phone already shows" reasoning actually
requires, and it's the opposite of literal real-Kahoot (which shows options on the
big screen and colored-only buttons on the phone) — deliberately not copied 1:1 here.

**Schema** (`supabase/schema.sql`, appended, **not yet applied to Supabase — same
caveat as Stage 1**): `challenge_rooms` (code, host_player_id, topic, `question_set`
jsonb, `phase` — `lobby|question|reveal|leaderboard|ended` — `current_question_index`,
`phase_started_at`), `challenge_room_players` (room_id, player_id,
`display_name_snapshot` — captured at join so a later name change doesn't rewrite an
old room's board), `challenge_room_answers` (room/player/question_index,
selected_option, is_correct, answer_ms, points — **client-computed and simply
inserted, not server-validated**, documented inline in the schema as the same
no-backend trust concession as every other wide-open write policy in this file — not
a new risk, just a new place it shows up), and a `challenge_room_leaderboard` view
(sum of points per player per room). RLS: `challenge_rooms` UPDATE is wide open
(**genuinely can't be host-restricted** without real Supabase Auth — documented
inline with the reasoning and the later fix path, `supabase.auth.signInAnonymously()`
wired to `players.auth_user_id`); `challenge_room_answers` INSERT *is* meaningfully
restricted (only while `challenge_rooms.phase = 'question'`), since that check reads
server-side room state rather than trusting a client-claimed identity.

**`src/lib/mcqService.ts`** (new) — `generateMcqQuestions(topic, count, rng?)`.
Deliberately does **not** add a 4th DeepSeek prompt-builder/validator pair —
dispatches to the *existing* `generateClues`/`generateDefinitions`/`generateScenarios`
(keyed by topic) since each already returns fresh, pool-grounded, validated
`{term, text}` pairs; a picked term's text becomes the question prompt, its term
becomes the correct option, and 3 other pool terms (shuffled) become distractors. On
`DeepSeekError`, falls back straight to the pool's static `fallbackClue`/
`fallbackDefinition` text (no local/Supabase cache tier needed — the generated set is
stored once directly on `challenge_rooms.question_set`, read identically by every
client in the room). Fully unit tested (`mcqService.test.ts`, 7 cases).

**`src/lib/roomService.ts`** (new) — `createRoom`/`getRoomByCode`/`joinRoom`
(idempotent)/`advancePhase`/`submitAnswer`/`getQuestionAnswerTally`/
`getRoomLeaderboard` all follow `scoreSync.ts`'s `SyncResult` conventions like
`challengeService.ts` does. `advancePhase` always re-stamps `phase_started_at` so
every client derives its own countdown locally — no ticking broadcast needed.
**`subscribeToRoom`** uses a `postgres_changes` UPDATE subscription on the room row
(persisted, survives a host refresh) for phase/question sync; **`subscribeToPresence`**
uses a separate, ephemeral `presence` channel purely for "who's connected" in the
lobby — deliberately decoupled, per the plan's Q3 answer. Both return an unsubscribe
closure wrapping `supabase.removeChannel`. This is the **first Realtime usage
anywhere in this codebase** — `src/testHelpers/supabaseMock.ts` gained a new
`createMockRealtimeChannel()` helper (records `.on(...)` handlers by event type so a
test can fire them directly, mocks `.subscribe`/`.track`/`.presenceState`) alongside
the existing `chainableSupabaseResult`. Fully unit tested (`roomService.test.ts`, 20
cases, including that both subscribe functions' returned closures actually call
`removeChannel`).

**`src/lib/levelScoring.ts`** — added `computeRoomAnswerScore(isCorrect, answerMs,
questionDurationMs)`: 0 if wrong; if correct, `POINTS_PER_WORD` base plus up to
another `POINTS_PER_WORD` decaying linearly to 0 as `answerMs` approaches the
deadline (instant answer = double points, last-second correct = base only).
`answerMs` is clamped into `[0, questionDurationMs]` so a late or clock-skewed report
can't score outside that range. 6 new test cases.

**New routes**: `app/room/create.tsx` (topic picker → generates questions →
`createRoom` → the host screen; shows the same changing-loading-text pattern as the
solo levels since question generation can take a few seconds), `app/room/join.tsx`
(reuses Stage 1's `JoinCodeField`), **`app/room/[code].tsx`** (the laptop/browser host
+ shared-screen view — renders by `phase`: lobby shows the code + live presence list
+ host-only Start; question shows the prompt + countdown, auto-advances to reveal
when the host's own countdown hits zero, host can also Reveal Now; reveal shows the
correct option highlighted + a per-option tally from `getQuestionAnswerTally`;
leaderboard/ended show the shared `LeaderboardList`), **`app/room/[code]/play.tsx`**
(the phone screen — lobby waits; question shows **only the 4 option buttons, no
prompt text**, optimistic "locked in" on tap while `submitAnswer` fires in the
background; reveal shows the player's own result — correct/incorrect/points, or
"time's up" if they didn't answer; leaderboard/ended show `LeaderboardList` with the
player's own row highlighted). All four registered in `app/_layout.tsx`. The existing
`app/challenge/index.tsx` hub was extended (not replaced) with two more cards — "Host
a Live Room" / "Join a Live Room" — under a new "LIVE ROOM" group label, title
generalized from "Challenges" to "Play with Friends".

**Real bug caught and fixed proactively, before it caused a symptom** (logged in
`ISSUES_AND_SOLUTIONS.md`): while designing the host screen's `isHost = playerId ===
room.host_player_id` check, realized every ad hoc `ensurePlayer()` call across both
stages (Stage 1's `challenge/create.tsx`/`join.tsx` and the level screens' challenge
branch, plus this session's new room screens) resolved a player id locally but never
wrote it back into `useGameStore`'s `playerId` field — the store had no setter for it
outside the internal `flushPendingSync` path. Added `setPlayerId(playerId)` to
`useGameStore.ts` and wired it into all six call sites (one new test added to
`useGameStore.test.ts`). No behavior change for Stage 1 (`ensurePlayer` is idempotent
per `device_id`, so it was always resolving the same row) — this fix is specifically
what makes Stage 2's host detection reliable.

**Verification status**: `npx tsc --noEmit` clean, `npm test` 239/239 (34 new this
part of the session: 7 mcqService + 20 roomService + 6 computeRoomAnswerScore + 1
setPlayerId). **Nothing hands-on has been tried** — this is real-time, multi-device
code and needs actual devices, not just reasoning through it. Checklist:

1. **Apply the full current schema** (Stage 1 + Stage 2 sections, both still pending)
   to Supabase before anything in either stage can work end-to-end.
2. **Two devices/windows needed simultaneously**: open `npm run web` on a
   laptop/browser as the host, and a phone (Expo Go or the installed app) as a
   player — this is the actual point of Stage 2, so it can't be verified on one
   device.
3. Host: "Play with Friends" → "Host a Live Room" → pick a topic → confirm question
   generation completes (watch for the "Almost ready…" text if it takes a few
   seconds) → confirm you land on the room screen with a code showing.
4. Player: "Play with Friends" → "Join a Live Room" → enter the code → confirm you
   land on a "Waiting for the host to start…" screen.
5. Host taps **START** — confirm the player's phone transitions to the question
   screen (**only 4 buttons, no question text**) within a second or two, and the
   host's screen shows the prompt (**no options**) with a live countdown.
6. Answer from the phone — confirm it locks in (buttons disable, "Locked in…" shows)
   and doesn't let a second tap change the answer.
7. Let the countdown hit zero **without any tap** — confirm the host **auto-advances
   to reveal** with no button press needed, and confirm the phone's reveal screen
   correctly shows "time's up" for a no-answer case, or correct/incorrect + points
   for an answered one.
8. Confirm the host's reveal screen shows a believable per-option tally (this is the
   newest, least-proven query — `getQuestionAnswerTally`).
9. Host taps "Show Leaderboard →" — confirm both host and phone show the same
   standings (shared `LeaderboardList`, phone highlights its own row).
10. Host taps "Next Question →" a few times through to the last question, then "End
    Room →" — confirm final results show on both screens and the phone's "Back to
    Home" button works.
11. Try a **second phone** joining mid-round (after START) — confirm it doesn't crash
    and reasonably shows the current phase rather than being stuck on lobby forever.
12. Close and reopen the host's browser tab mid-room (simulating a laptop
    refresh/reconnect) — confirm the room state is still there (this is the specific
    thing `postgres_changes`-based sync was chosen over `broadcast` to guarantee).

If anything misbehaves: phase-sync bugs are most likely in `subscribeToRoom`'s
`postgres_changes` filter or the auto-advance timer effect in
`app/room/[code].tsx`; a wrong/missing tally is most likely `getQuestionAnswerTally`
in `roomService.ts` (fully unit-tested with a mocked query, but real Postgres
grouping/filter behavior can't be simulated by that mock); scoring-looks-wrong bugs
are most likely clock skew between the host's and a phone's local clocks
(`answerMs`/`phase_started_at` are both client-clock-derived — this is a known,
accepted limitation from the original brainstorm, not a bug to chase).

## Multiplayer Stage 1 — Async Challenge: IMPLEMENTED, needs hands-on verification (2026-08-18)

The brainstorm two sections below was turned into a full two-stage plan via
`EnterPlanMode`, approved by the user, and saved at
`C:\Users\hi\.claude\plans\pure-gliding-kay.md` (**outside the repo**, in the global
Claude plans directory — read it for the complete design rationale of both stages,
including the exact schema SQL and the RLS trust-model discussion). Two open questions
from the original brainstorm were resolved before planning: build toward **both**
stages (not picking just one), and the live-room host is the **laptop** (controller +
big screen), not a phone. A third question surfaced during planning and was confirmed
with the user: Stage 2 needs a **new multiple-choice question format** (the existing
crossword/drag-match/word-search screens don't decompose into a "prompt on the big
screen, buttons on the phone" shape) — Stage 2 is NOT a synchronized version of the
existing three levels.

**Stage 1 (Async Challenge) is built this session, end-to-end, per that plan file:**

- **Schema** (`supabase/schema.sql`) — **not yet applied to the live Supabase
  project, only written to the file** — two new tables (`challenges`,
  `challenge_participants`), a new nullable `challenge_id` column on `scores`, and two
  views (`leaderboard` rewritten to exclude challenge attempts,
  `challenge_leaderboard` added). **You need to run this against the Supabase SQL
  editor (or `supabase db push`) before Stage 1 can work end-to-end** — the app code
  assumes these tables/views already exist.
- **`src/types/database.ts`** — `ChallengeRow`/`ChallengeParticipantRow`/
  `ChallengeLeaderboardRow` types added, `ScoreRow` gained `challenge_id`, following
  the file's existing `type`-not-`interface` convention.
- **`src/lib/joinCode.ts`** (new) — `generateJoinCode()`/`isValidJoinCode()`, a
  6-character uppercase code excluding ambiguous glyphs (0/O/1/I/L). Fully unit
  tested (`joinCode.test.ts`, 9 cases).
- **`src/lib/challengeService.ts`** (new) — `createChallenge` (retries on a join-code
  collision), `getChallengeByCode`, `getChallengeById`, `joinChallenge` (idempotent),
  `submitChallengeScore`, `getChallengeLeaderboard` — mirrors `scoreSync.ts`'s
  `SyncResult`/never-throw/`classifyError` conventions exactly. Fully unit tested
  (`challengeService.test.ts`, 26 cases, using the existing `supabaseMock.ts`
  chainable mock).
- **`app/level1.tsx`/`level2.tsx`/`level3.tsx`** (edited, identical pattern in each) —
  read an optional `challengeId` route param via `useLocalSearchParams`. When present:
  clue tokens and the mistake-tracking flag switch to fresh, attempt-local state
  (never touching the player's persisted solo `clueTokens`/`levels[]`/lock
  progression — a challenge attempt is a parallel run, not part of solo
  progression/economy), a small "Challenge attempt · N clue tokens" badge renders
  under the title, and Submit calls `submitChallengeScore` instead of
  `completeLevel` — **this path blocks and shows an explicit inline error + Retry on
  failure** (unlike solo's fire-and-forget), since an unset "did I make the
  leaderboard?" outcome is exactly the ambiguous-failure case AGENTS.md's UX rules
  call out. On success, routes to `/challenge/[id]` instead of the next level.
- **New routes**: `app/challenge/index.tsx` (create/join hub), `create.tsx` (level +
  time-window picker → code + Share), `join.tsx` (code entry, reusing the new
  `JoinCodeField` component), `[id].tsx` (loading/error/not-found/ready states,
  challenge info, Play button, leaderboard). All four registered in
  `app/_layout.tsx`. `app/index.tsx` got a new dashed "Challenge a Friend" card below
  the level cards linking to `/challenge`.
- **New shared components**: `src/components/challenge/JoinCodeField.tsx` (mirrors
  `welcome.tsx`'s name-input validation pattern exactly) and
  `LeaderboardList.tsx` (presentation-only "golf scorecard" rows; the empty-leaderboard
  state is handled by the screen, not this component, so it stays reusable for Stage
  2's room leaderboard later).
- The store (`useGameStore.ts`) was **not touched** — challenge/attempt state is
  local to the screens that need it, matching the existing convention that puzzle
  content is component state, not global state.

**Verification status**: `npx tsc --noEmit` clean, `npm test` 205/205 (35 new: 26
`challengeService` + 9 `joinCode`). **UI verification is the user's job per AGENTS.md
rule 5** — not done this session. Checklist:

1. **Apply the schema first** (see above) — nothing in Stage 1 works against a live
   backend until `challenges`/`challenge_participants`/the `scores.challenge_id`
   column/both views exist in Supabase.
2. Create a challenge from `app/index.tsx` → "Challenge a Friend" → "Create a
   Challenge": pick a level and window, confirm a code appears, Share works.
3. From a second device/app instance, "Join a Challenge" with that code → confirm it
   lands on the challenge detail screen.
4. Play the challenge's level via the "PLAY →" button — confirm the "Challenge
   attempt · N clue tokens" badge shows, USE CLUE draws from that local count (not
   the shared solo pill in the header), and finishing routes back to the challenge
   screen with the score now showing in the leaderboard.
5. Confirm a **solo** playthrough of any level (no `challengeId` param) is completely
   unaffected — same behavior as before this session.
6. Confirm an expired challenge shows "This challenge has closed" and disables Play;
   confirm the leaderboard's empty state ("No one's played this challenge yet — be the
   first!") shows before anyone has a score.
7. Try joining with a bad/nonexistent code — confirm the inline "No challenge found
   for that code" message, not a raw error or silent failure.

**Stage 2 (Live Host Room)** is fully designed in the plan file linked above but
**not started** — schema for `challenge_rooms`/`challenge_room_players`/
`challenge_room_answers`, `src/lib/mcqService.ts`, `src/lib/roomService.ts`
(Supabase Realtime `postgres_changes` + `presence`), and the `app/room/*` routes are
all still to be built. Treat it as its own session once Stage 1 is verified, per the
plan file's suggested execution order.

## Multiplayer — brainstorm, NOT YET PLANNED OR STARTED (previous session, 2026-08-18)

**Status: superseded by the plan/implementation above** — kept here only as the
historical record of the original ideation. No plan file, no code, no architecture
decision had been made when this section was written; the user explicitly wanted this
to be the starting point of a **new chat**, which is exactly what happened (see
above). The two open questions below are now answered (see above) — don't re-ask them.

### Why multiplayer, and why Supabase Realtime is the natural fit

The app already runs on Supabase (players/scores/cached_questions tables, see
`supabase/schema.sql`), and Supabase's **Realtime** feature (`postgres_changes` for
DB-change subscriptions, plus `broadcast`/`presence` channels for ephemeral
low-latency messaging) means live synchronized multiplayer is achievable **without
standing up a separate backend/websocket server** — just new Supabase tables/channels
on top of the existing project. This was the framing for the whole brainstorm: it's
achievable within the current stack, not a "we'd need to rearchitect everything" ask.

### Five game format ideas discussed, simplest to most involved

1. **Live Host Room (Kahoot-style).** Host creates a room with a join code, players
   join on their phones, host controls pacing. Everyone sees the same question at the
   same time, answers lock in, then a live leaderboard shows between questions. Fits
   GMP trivia naturally — e.g. a trainer running it for a class. Needs Realtime
   broadcast for question sync + presence for "who's in the room."
2. **Async Challenge / Scorecard.** Host picks a question set (or level), shares a
   code, friends play it on their own time within a window. Leaderboard for that
   challenge updates as people finish — like a golf scorecard, not real-time
   synchronized. Much simpler to build (no live sync needed at all) — just a
   `challenges` table plus scores filtered by `challenge_id`.
3. **Head-to-Head Duel.** Two players get the same question set simultaneously, race
   for speed + accuracy. Good "quick match" feel; could support an ELO/rating system
   later.
4. **Team Battle.** Players split into 2+ teams, team score is the aggregate. Could
   add a "relay" twist — only one teammate answers each question, rotating.
5. **Elimination / Survival.** Everyone answers the same live question; a wrong
   answer (or being slowest) knocks you out. Last one standing wins. High tension,
   good for a "tournament night" feel, but needs the same live-sync infrastructure as
   #1.

**Recommendation given at the time** (not yet accepted or rejected by the user):
start with **#1 (live host room)** or **#2 (async challenge)** — they cover the two
real use cases (a trainer running a live session vs. friends competing casually), and
**#2 is dramatically less engineering** (no Realtime channel management, no
reconnect/disconnect edge cases, no "host disconnects mid-game" problem). #1 is the
flashier feature but drags in a whole class of state-sync bugs: a player dropping
mid-question, the host closing their app, players joining late, clock skew between
devices.

**Open question #1 (unanswered):** which direction appeals to the user — #1, #2, or
build toward both eventually and just decide which comes first? **Ask this before
doing anything else** if picking this up in a new chat.

### Web "big screen" host view — also discussed, also unresolved

User asked whether these games could have a **web version broadcast on a computer**,
showing live scores etc. — like a TV/projector screen at the front of a room.

**Answer given: yes, and it's a good fit for this specific stack**, because
`npm run web` already means this Expo app runs in a browser today via React Native
Web — **no second codebase or separate web project needed**. The "big screen" view
can just be another route in the same `expo-router` app (e.g. `/host/[roomCode]`)
that a host opens in a browser on a computer/TV, while players join and answer from
their own phones (Expo Go or the installed app).

This maps onto the Kahoot-style live host room (idea #1 above):
- **Big screen shows:** room code / QR to join, the list of players as they connect,
  the current question (**prompt only, no answer options** — so nobody in the room
  can cheat by reading answers off the shared screen over someone's shoulder), a
  countdown, and the live leaderboard between questions.
- **Phones show:** just the answer buttons (A/B/C/D) — like a game-show buzzer, not
  the question text. **This is the actual Kahoot trick, and it's what makes the
  shared screen worth having** — otherwise the big screen is just redundant with what
  the phone already shows.
- **Sync mechanism:** Supabase Realtime — a `presence` channel for "who's connected,"
  and `broadcast` for "next question now" / "reveal answer" / "show leaderboard."
  The big screen and every phone all subscribe to the same room channel.

**Open question #2 (unanswered) — this one changes the architecture, so it needs
answering before any building starts:** does the **host control the game from their
phone** while the big screen just displays passively, or does the **host click "next
question" directly on the laptop**? Kahoot uses the latter. The suggestion given was
to default to that (**laptop = host + controller + display, phones = players only,
one fewer device in the sync loop**) unless the user specifically wants the host
walking around with their phone while a TV displays behind them. **The user had not
confirmed this preference as of this write-up — ask directly if picking this up.**

### Next steps for whoever picks this up

1. Ask the two open questions above first (game format priority; host-control model).
2. Once answered, this needs a real plan (workflow rule 2) before any code — likely
   touching: new Supabase tables (rooms/room_players/room_state or similar — schema
   not designed yet), `supabase/schema.sql` + RLS policies for them, new Realtime
   channel wiring (nothing in this codebase uses Supabase Realtime yet — `src/lib/supabase.ts`
   is currently just used for one-shot queries/inserts, not subscriptions), new
   routes (a join/host flow, a "big screen" route, phone-side player views), and
   probably a fair amount of new Zustand store state for room/connection status.
3. Nothing about this brainstorm is binding — it's a starting menu of options, not a
   locked-in design. Revisit the 5 formats and the web-host idea with fresh eyes if
   the user's thinking has shifted since this was written.

## Level 3 rebuild: real 2D word search + drag-to-select, all 4 axes (previous session, UNVERIFIED)

User reported "tapping a row does not work properly" plus two specific complaints:
words should sometimes be vertical, and tapping shouldn't count filler letters as
part of the word. Investigated before touching anything (per workflow rule 1) and
confirmed this wasn't a broken-handler bug — the whole gameplay model was wrong. The
old `layoutWordSearch` laid out **one term per row**, padded with random filler
letters to the width of the longest term, and the old `WordSearchGrid` made **the
entire row** (real letters + filler) a single tap target. So "tap a row" really meant
"guess which row holds your term," not "find the actual letters" — and there was no
vertical placement at all, ever. This is logged in full in `ISSUES_AND_SOLUTIONS.md`
(the "Level 3 word search" entry) — read that for the complete root-cause writeup;
this section covers what changed and what still needs your hands-on check.

**Immediately extended to diagonals, same session**: after the initial rebuild
(horizontal + vertical only), the user asked to confirm vertical placement and
random start positions were really happening — verified empirically (not just by
re-reading the code) via a throwaway Jest-based simulation script, run and then
deleted, across 300 real rounds: vertical came out to 909/1800 placements (50.5%),
and only 24/1800 (1.3%) happened to start at the grid's (0,0) origin, confirming
positions are genuinely randomized across the grid, not anchored to a corner. The
user then asked for true "any direction" placement. Clarified via `AskUserQuestion`
first, since there were two different things this could mean: words already were
*findable* by dragging either end-first (matching checks both directions along an
axis), so the only real gap was **diagonal** placement/selection — user confirmed
they wanted that added, understanding it was real added scope (both the layout
algorithm and the drag-selection math needed to grow), not a small tweak.

**This was scoped as a real rebuild, not a patch**, per workflow rule 2 (plan before
editing) — confirmed the redesign approach with the user via `AskUserQuestion` before
writing any code: **free-form word search** (drag any word you spot anywhere in the
grid; if it matches a still-hidden term it locks in and its scenario auto-checks) was
chosen over keeping the old "select a scenario first, then find its term" flow.

**New files/rewrites**:
- `src/lib/wordSearchLayout.ts` — full rewrite. Real 2D placement across **4 axes**
  (`WordSearchDirection = 'horizontal' | 'vertical' | 'diagonalDownRight' |
  'diagonalDownLeft'` — only 4, not 8 compass directions, since a straight run of
  cells reads the same letters from either end and matching already checks both
  ways, so e.g. "right" and "left" are the same underlying axis). New exported
  `directionDelta(direction) → {dRow, dCol}` is the single source of truth other
  files use to walk a placement's cells — `WordSearchGrid.tsx` and the test file
  both import it rather than re-deriving the per-direction math. Each term is
  placed once, retried up to `MAX_PLACEMENT_ATTEMPTS` times per word at a random
  direction+in-bounds position; may cross another placed term only where letters
  agree; grid size grows and retries (up to `MAX_GRID_GROWTH_ATTEMPTS`) if a layout
  can't fit everything; remaining cells filled with random letters. Returns
  `{ rows, cols, cells: string[][], placements: {term, row, col, direction}[] }` —
  **shape changed** from the old one-row-per-term `{ columns, rows: WordSearchRow[]
  }` (nothing outside `questionsService.ts`/the word-search UI touches this type, so
  no other files needed the shape change, but keep it in mind if anything new reads
  `puzzle.grid` directly).
- `src/lib/wordSearchMatch.ts` — full rewrite. `matchTermFromSelection(letters,
  terms, found)` checks dragged letters against every still-hidden term, forwards
  **and backwards** (tracing a word from either end is allowed). `matchesTerm` is the
  underlying single-term check; `allFound`/`firstUnfoundTerm` unchanged. This file
  is fully geometry-agnostic — it only ever sees a flat array of letters, so it
  needed zero changes when diagonals were added afterward.
- **`src/lib/wordSearchSelection.ts`** (new, added when diagonals were added) — pure,
  fully unit-tested drag-selection geometry, deliberately kept **out of any Reanimated
  worklet**: `snapDragEnd(startRow, startCol, rawRow, rawCol)` picks whichever of the
  4 axes best fits the raw (possibly wobbly/diagonal-ish) drag delta by comparing how
  far the delta deviates from each candidate axis, and `cellsBetween(startRow,
  startCol, endRow, endCol)` enumerates the straight inclusive run between two cells
  on any of those 4 axes. Both are plain functions callable from ordinary JS — no
  `'worklet'` directive, no Reanimated import — specifically so they stay trivially
  testable in Jest and don't inherit any UI-thread/worklet fragility.
- `src/components/wordsearch/WordSearchGrid.tsx` — full rewrite, then extended for
  diagonals. Real drag-to-select via `react-native-gesture-handler`'s
  `Gesture.Pan()`: press the first letter, drag straight to the last (any of the 4
  axes' 2 reading directions), release. **Deliberate worklet/JS split**: the pan
  gesture's `.onStart`/`.onUpdate`/`.onEnd` worklet callbacks do only cheap
  arithmetic (convert touch position to a clamped row/col, throttle via a
  last-reported-cell comparison so JS is crossed once per cell moved into, not once
  per touch-move frame) and `runOnJS` the raw numbers across; **all the actual
  axis-snapping and cell-enumeration logic (`snapDragEnd`/`cellsBetween`) runs on
  the JS side**, not inside the worklet — avoids any risk around calling
  cross-module functions from a worklet context, and keeps that logic unit-testable
  in isolation (see `wordSearchSelection.ts` above). Uses the gesture event's `x`/`y`
  (relative to the gesture's own attached view, confirmed via the RNGH docs before
  relying on it) directly — **no `measure()` needed**, unlike Level 2's `RoleChip`,
  since selection and rendering both happen in this one component rather than across
  a chip+card pair.
- `src/components/wordsearch/ScenarioList.tsx` — simplified to a pure display list
  (no `Pressable`, no selection state) now that there's no "select a scenario first"
  step — a card just checks itself off once its term is found.
- `app/level3.tsx` — `handleTapRow`/`selectedTerm`/`handleSelectScenario` all
  replaced by `handleSelectionEnd(cells)`, which reads the dragged cells' letters off
  `puzzle.grid.cells` and calls `matchTermFromSelection`. `handleUseClue` is
  otherwise unchanged (`foundTerms` is still just `Set<string>` of term names — the
  grid derives which cells to highlight green from `grid.placements` + `foundTerms`
  via `directionDelta`, so a clue-revealed term highlights correctly without the
  screen needing to know cell positions itself). Instruction copy
  (`LEVEL3_INSTRUCTIONS`) updated to describe dragging instead of tapping — **the
  instruction screenshots themselves (`FindtheSterilityTerms.png` etc.) still show
  the old tap-a-row UI** and will read as stale/misleading now; I can't regenerate
  screenshots myself, so these need retaking on your end whenever convenient (not
  blocking, just known-stale).

**Gesture-vs-ScrollView conflict, handled proactively, not reactively**: a
`Gesture.Pan()` nested inside a `ScrollView` is a well-documented conflict zone (both
want to own vertical drags), and unlike Level 2 (where the drag is mostly
horizontal-ish, chip-to-card), Level 3 vertical/diagonal selection is a core,
common-case interaction now. Applied the same fix already proven in this repo for
Level 2's drag (`app/level2.tsx`'s `scrollEnabled={draggingTermId === null}`):
`WordSearchGrid` reports `onDragActiveChange(active)` — derived from its own
`selection` state via a `useEffect`, not a separate gesture callback — and
`app/level3.tsx` disables its `ScrollView` (`scrollEnabled={!isSelectingGrid}`) for
the duration of a drag. **This specific mechanism is inherently a little racy**
(native touch arbitration happens before React state can flip `scrollEnabled` for
the very first touch of a new gesture), which is a known limitation of this pattern,
not unique to this change — Level 2 already lives with the same tradeoff. Worth an
explicit hands-on check (see below) rather than assuming it away.

**Verified empirically, not just by reading the code** — ran (and then deleted) two
throwaway Jest-based simulation scripts across real term pools:
- Before diagonals: 300 rounds / 1800 placements — 50.5% vertical vs 49.5%
  horizontal, only 1.3% of placements incidentally started at (0,0). Grid sizes
  ranged 11×11 to 17×17 (avg ~14.7×14.7), largest when `DECONTAMINATION` (15
  letters, the pool's longest term) gets drawn.
- After diagonals were added: 500 rounds / 3000 placements — roughly even across
  all 4 axes (horizontal 26.2%, vertical 29.9%, diagonal-down-right 21.6%,
  diagonal-down-left 22.3%). **Grid size range was unaffected** (still 11×17,
  avg 14.7) — adding 2 more candidate axes didn't require a bigger grid, if
  anything it gives the placement algorithm more room to succeed on the first try.

**Testing boundary** (same precedent as Level 1/2): pure logic
(`wordSearchLayout.ts`, `wordSearchMatch.ts`, `wordSearchSelection.ts`) is fully
unit-tested, including a multi-seed test confirming every placed term's cells still
spell that term correctly even when crossed by another (proving no placement
silently clobbers another's letters), and a test confirming all 4 directions
actually get used across many rounds (not just claimed in a comment). The
gesture/drag plumbing in `WordSearchGrid.tsx` itself (the `Gesture.Pan()` callbacks)
and the wiring in `app/level3.tsx` are **not** unit-tested — that's your hands-on
job, same as Level 2's `RoleChip` drag code — but the geometry those callbacks
delegate to (`snapDragEnd`/`cellsBetween`) is fully covered. Rewrote
`wordSearchLayout.test.ts` and `wordSearchMatch.test.ts` entirely for the new APIs,
added `wordSearchSelection.test.ts` (new); fixed 2 assertions in
`questionsService.test.ts` that referenced the old `grid.rows.length` shape (now
`grid.placements.length`). `npx tsc --noEmit` clean, `npm test` 175/175.

### Level 3 verification checklist (user, hands-on — this is now the important one, superseding the old Level 3 checklist below)

This is genuinely new gesture code (first Pan-gesture-inside-ScrollView case with
vertical/diagonal drags as a core interaction, not an edge case) — needs a real
hands-on pass, not just a read-through:

1. **All 4 axes**: drag across a few words of each kind — horizontal, vertical, and
   both diagonals (↘ and ↙). Confirm each locks in green correctly, and that
   dragging **backwards** (last letter to first) also works for at least one of each.
   The grid doesn't visually distinguish which axis a given hidden word sits on, so
   you may need to eyeball the letters to spot a diagonal one — that's expected, not
   a bug, same as a real word search.
2. **Diagonal drag precision**: this is the newest, least-proven math
   (`snapDragEnd` in `wordSearchSelection.ts`) — confirm a genuinely diagonal drag
   (finger moving both down and across roughly equally) snaps cleanly to the
   diagonal line rather than jittering between horizontal/vertical/diagonal as you
   drag, and that a *slightly* off-diagonal finger movement still resolves to the
   intended diagonal rather than snapping to horizontal or vertical instead.
3. **Filler letters are never falsely included**: confirm a drag that includes even
   one filler letter (i.e. doesn't land exactly on a real placed term, in any
   direction) flashes red rather than false-accepting — this was the original core
   complaint, so it's the most important thing to confirm is actually fixed.
4. **Scroll vs. select conflict**: this is the highest-risk item (see above). Normal
   page scrolling (e.g. via the ScrollView above/below the grid) should still work;
   while dragging inside the grid (vertical or diagonal especially) the page must not
   also scroll underneath your finger. Pay extra attention to the very first drag of
   a session — if the ScrollView "wins" the first touch and steals it, that's the
   known racy edge case flagged above.
5. **USE CLUE**: should auto-reveal one hidden term's cells in green (via
   `grid.placements` + `directionDelta`) without requiring a drag, and without
   disturbing already-found words — try this on a diagonally-placed term specifically
   at least once, since that path is newest.
6. **Grid size/readability**: `DECONTAMINATION` (15 letters) is the longest term in
   the pool now — if a round selects it, the grid could be a fairly large square
   (~17x17). Confirm cell sizing still stays readable/tappable rather than becoming
   too cramped (cells clamp between `MIN_CELL_SIZE`/`MAX_CELL_SIZE` in
   `WordSearchGrid.tsx` — if it's genuinely too small on your device, those bounds
   are the place to adjust).
7. **Full flow**: find all 6 terms, tap FINISH, confirm it routes to `/grand-reward`
   and the score reflects `computeLevel3Score`.

If anything misbehaves: axis-snapping/selection bugs are most likely in
`wordSearchSelection.ts`'s `snapDragEnd`/`cellsBetween` (both fully unit-tested
already, but hands-on dragging exercises real touch coordinates a test can't
simulate) or the row/col-from-touch conversion in `WordSearchGrid.tsx`'s
`.onStart`/`.onUpdate`; scroll-conflict bugs are in the `scrollEnabled` timing in
`app/level3.tsx`. The placement algorithm itself (`wordSearchLayout.ts`) is
unit-tested and should not be the culprit if a word simply isn't findable — check
whether it's a snapping/precision issue first.

## Correct-answer sound effect (new, this follow-up session)

User asked for a sound on every right answer, across all three levels. Added
`expo-audio` (`npx expo install expo-audio` — pulled in `expo-audio@~57.0.3` and
auto-added a bare `"expo-audio"` entry to `app.json`'s `plugins`, no options needed
since this is playback-only, no microphone/background-audio use). Confirmed via the
v57 docs this is the correct current API (expo-av is the deprecated predecessor on
this SDK).

**Sound asset**: `assets/sounds/correct.wav` — a short (~0.33s) two-note ascending
chime (A5 → E6, fast attack + exponential decay), synthesized from scratch as raw
16-bit PCM via a one-off Node script (not committed — it lived in the scratchpad dir)
rather than sourced as a placeholder needing later replacement, since a clean sound
effect is cheap to generate programmatically (unlike the earlier placeholder
image/icon assets, which genuinely needed the user's own art). Swap this file for a
different chime any time — nothing else needs to change.

**`src/hooks/useCorrectSound.ts`** (new) — thin shared wrapper around
`useAudioPlayer(CORRECT_SOUND)`, returns a stable `playCorrect()` that does
`seekTo(0); play()` so the same player retriggers cleanly even if the previous chime
hasn't finished. Used identically in all three level screens.

**Trigger point per level** (confirmed with the user before building — Level 1's
granularity was a genuine open question, Level 2/3 weren't):
- **Level 1** (`app/level1.tsx`): fires once per **completed word**, not once per
  correct letter (user's explicit choice — per-letter was flagged as likely to feel
  spammy on a fast typer). Needed a real diff, since a locked cell can complete zero,
  one, or two words at once (intersections) and re-locking an already-solved word
  must never re-fire. Extracted as a pure, tested helper:
  **`src/lib/wordCompletion.ts`**'s `newlyCompletedWords(words, previouslyLocked,
  nowLocked)`, called from `handleChangeCell`'s correct branch right before
  `setLockedCells`. New test file: `wordCompletion.test.ts` (5 cases: no word done
  yet, single word completes, two words complete simultaneously at a shared
  intersection cell, an already-solved word doesn't re-fire, an untouched word is
  ignored).
- **Level 2** (`app/level2.tsx`): fires synchronously inside `handleDrop`'s existing
  `pair.termId === termId` correct branch (the `else` of the existing `markError(2)`
  check) — no diffing needed, correctness is already computed there before any state
  changes. Re-dropping an already-correct chip back onto its card re-fires the sound,
  same as the green flash already does — treated as consistent, not a bug.
- **Level 3** (`app/level3.tsx`): fires synchronously inside `handleTapRow`'s existing
  `isRowMatch(...)` true branch, same reasoning as Level 2.
- **USE CLUE auto-solves do NOT play the sound on any level** — a clue reveal isn't
  the player getting it right themselves. This is naturally true for Level 2/3 (the
  sound call sites are only in the drop/tap handlers, not `handleUseClue`) and for
  Level 1 too (`handleUseClue` still uses its own separate `setLockedCells` call that
  never runs through `newlyCompletedWords`/`playCorrect`).

No test changes needed for the untouched suites — `npx tsc --noEmit` clean, `npm test`
151/151 (146 prior + 5 new `wordCompletion` cases). No Metro/jest config changes
needed either: `.wav` is in React Native's default Metro `assetExts`, and nothing in
the existing test suite imports the level screens or the new hook, so `expo-audio`
never loads under Jest.

If asked to touch this again: the one-off WAV-generator script no longer exists on
disk (it was scratch, not committed) — regenerate similarly if a different tone is
ever wanted, or just drop in a real sound file at the same path.

---

Previous update: 2026-08-17, end of session (**Level 2 — Personnel drag-and-match — and
Level 3 — Sterility word search — both built end to end this session**). This chat is
very long — **start a fresh chat** for the next round of work and point it at this
file plus `AGENTS.md` (binding workflow/UX rules, read it) and
`.claude/plans/concurrent-conjuring-ritchie.md` (the approved plan file — **note it
was reused for both Level 2 and Level 3 in this session, overwritten in between; it
currently holds the Level 3 plan only**, so it's a snapshot of the latest build, not a
running log — this HANDOFF file is the durable record of both). The older
`.claude/plans/greedy-singing-kite.md` produced the original Level 1 build described
further below.

## What this project is

Expo/React Native (expo-router) educational game for pharmacy students, teaching GMP
(Good Manufacturing Practice) across 3 levels: Level 1 crossword (data integrity/ALCOA+),
Level 2 drag-and-match (personnel/Annex 1), Level 3 definition-driven word search
(sterility). Shared clue-token pool (starts at 3), score accumulates across levels,
sequential unlocking, Supabase backend, DeepSeek for dynamic question generation.
Visual design source of truth is `Battle4GMP.dc.html` (an interactive HTML mockup the
user built externally) — read it before touching any UI, though note the welcome screen
built this session has **no mockup counterpart**; it was designed from scratch to match
the app's existing visual language (see below).

## Status: Levels 1, 2 and 3 are all built; none of Level 2 or 3 has been hands-on verified yet

Done, in order: Expo scaffold → Supabase schema/client → DeepSeek service → Zustand
store → Level 1 crossword → welcome/name-entry screen → **Level 2 personnel
drag-and-match (this session)** → **Level 3 sterility word search (this session)**.
**Not started: Grand Reward, Scoreboard content** (routes exist as bare placeholders
only — `app/grand-reward.tsx` is now the actual next screen a player reaches, since
Level 3 routes into it on submit).

- `npx tsc --noEmit` — clean.
- `npm test` — 146/146 passing across 13 suites (`src/**/__tests__/`).
- **Hands-on UI verification is the user's job**, per the AGENTS.md policy change from
  a prior session — the assistant type-checks and reasons through code but does not
  launch Expo/a browser itself. **This matters most for Level 2**: it's the first real
  touch-drag-gesture code in this repo (react-native-gesture-handler +
  react-native-reanimated, previously installed but unused), so it genuinely needs a
  hands-on pass, not just a code read-through — see "Level 2 verification checklist"
  below. **Level 3 is lower-risk** (plain tap interactions, same shape as Level 1's
  already-working crossword) but still entirely unverified hands-on — see "Level 3
  verification checklist" below.

## New this session: Level 2 — Personnel drag-and-match

Built end-to-end per `.claude/plans/concurrent-conjuring-ritchie.md` (full plan and
rationale there if anything below needs more depth). Source material:
`level2notes/Personnel.pdf` (PIC/S Annex 1 §7, paragraphs 7.1–7.18) plus, added
later the same session, `level2notes/pe-009-17-...part-i....pdf` (PIC/S GMP Guide
Part I) — **only Chapter 2 "Personnel" (pages 8–12) of that second PDF was used**;
the rest (Documentation, Production, QC labs, Outsourcing, Complaints/Recalls,
Self-Inspection) is general GMP, not personnel-specific, and doesn't map to any
current level's topic. `src/lib/personnelTerms.ts` is now **12 pairs**: the original 8
sterile-gowning/qualification pairs from Annex 1 §7, plus 4 new role-based pairs
from Part I Chapter 2's "Key Personnel" section (2.5–2.9) — Authorised Person, Head
of Production, Head of Quality Control, Senior Management. The role-based pairs
are a noticeably better fit for the "match a role to its responsibility" mockup framing
than the gowning-grade pairs (which are really "match a concept to its rule," not a
named role) — worth knowing if curating further. The term pool is built to extend
trivially (add rows to one file) since the user may upload still more notes later.

**Gameplay**: role chips ("ROLES") dragged onto matching responsibility cards
("RESPONSIBILITIES"). A chip's location is never stored directly — it's always
derived from a `matches: Record<defId, termId|null>` map, so bump/replace/move/
return-to-pool all fall out of one reducer (`applyDrop` in `src/lib/personnelMatch.ts`)
with no special cases. Correctness is always computed live (`isMatchCorrect`), never
cached, so a re-drag can never leave a stale green/red state.

**New files**:
- `src/lib/personnelTerms.ts` — 8 grounded term/definition pairs (mirrors
  `crosswordTerms.ts`'s `{term, fallbackDefinition}` shape), each traced to a specific
  §7 paragraph (Grade B/C/D gowning, gowning qualification, disqualification,
  unqualified-personnel access, personal items policy, cleanroom movement).
- `src/lib/selectPersonnelTerms.ts` — Fisher-Yates pool selector, default count 4,
  mirrors `selectCrosswordTerms.ts` exactly (same seeded-`rng` param for testability).
- `src/lib/personnelMatch.ts` — pure, fully-tested matching logic: `applyDrop`,
  `isMatchCorrect`, `availableTermIds`, `allMatched`, `allCorrect`,
  `firstUnsolvedDefId` (used by the USE CLUE auto-solve). This is the one part of the
  drag feature that's unit-tested — see "testing boundary" note below.
- `src/components/personnel/RoleChip.tsx` — the draggable chip. Owns a
  `Gesture.Pan()` (RNGH v2 builder API + `GestureDetector`), hides itself
  (`opacity: 0`) while being dragged rather than reflowing the flex-wrap pool, and
  reports `onDragStart`/`onDrop` up to the screen via `runOnJS` — no React state is
  ever touched inside the worklet itself.
- `src/components/personnel/DefinitionCard.tsx` — the drop target. Owns its own
  `useAnimatedRef<View>()`, registers it upward once on mount, renders the
  definition text plus either an empty dashed slot or a nested `RoleChip` (so a
  placed chip is itself draggable back off the card).
- `app/level2.tsx` — full rewrite of the placeholder. Mirrors `level1.tsx`'s shape
  (loading/error/ready status machine, instructions overlay, USE CLUE gated on
  `spendClueToken()`, inline submit-error banner, `completeLevel(2, score)` →
  `router.push('/level3')`). Owns the shared drag-ghost overlay (a single
  absolutely-positioned `Animated.View` driven by two screen-level shared values,
  `dragX`/`dragY`, rather than per-chip ghosts) and the `cardRefs` registry (a plain
  array of `{id, ref}`, **not a `Map`** — deliberately, since Reanimated's
  worklet-closure "shareable" conversion isn't a reliable bet for `Map` across
  versions; arrays/plain objects are the safe, well-supported shape).

**Edited files**:
- `src/lib/deepseek.ts` — added `generateDefinitions`/`validateDefinitionResponse`/
  `buildDefinitionsSystemPrompt`, exact mirror of the existing clue-generation trio.
  Same grounding rule as Level 1: DeepSeek only rewords a fixed, pre-supplied
  definition per term, can't invent/rename terms, can't leak the term inside its own
  wording (`validateDefinitionResponse` enforces this, tested).
- `src/lib/questionsService.ts` — added `loadLevel2Puzzle()` with the **identical
  4-tier fallback chain** as `loadLevel1Puzzle`: DeepSeek → local AsyncStorage cache
  (`@battle4gmp/level2-puzzle-cache`) → most-recent Supabase `cached_questions` row
  (`level: 2, topic: 'personnel'` — already a valid schema value, no migration
  needed) → static `fallbackDefinition`-sourced puzzle. (No final
  `QuestionsUnavailableError` tier here unlike Level 1 — Level 1 needs it because
  `layoutCrossword` can theoretically throw; Level 2's static fallback is a direct
  array map that can't fail, so that tier would've been dead/untestable code.)
- `src/lib/levelScoring.ts` — added `computeLevel2Score`, reusing the existing
  `POINTS_PER_WORD`/`NO_ERROR_BONUS` constants (a correct match scores the same as a
  correct crossword word).
- `src/components/LevelInstructions.tsx` — `InstructionStep.image` is now **optional**
  (guarded both the `<Image>` render and the prefetch `useEffect`). Level 2's
  instructions ship as 4 text-only steps for now — no placeholder mascot asset was
  created this time (unlike the welcome screen's placeholder PNG, which the user
  disliked enough to plan replacing; this avoids repeating that pattern). Add
  `image: {...}` to any `LEVEL2_INSTRUCTIONS` entry in `app/level2.tsx` once real
  mascot art exists — no other code changes needed.

**Deliberate deviation from `Battle4GMP.dc.html`**: the mockup's Level 2 uses HTML5
browser drag-and-drop (`draggable`, `onDragStart`, `onDrop`), which doesn't exist on
mobile. Asked the user via AskUserQuestion whether to build a real touch-drag gesture
or fall back to tap-to-place; **user chose real drag** — this is genuinely new
gesture code for the repo (see below), not a shortcut.

**Testing boundary** (matches existing precedent — `CrosswordGrid`'s keystroke
handling in `level1.tsx` isn't Jest-tested either): the pure matching logic
(`personnelMatch.ts`) is fully unit-tested; the actual `Gesture.Pan()`/hit-testing
plumbing in `RoleChip.tsx`/`app/level2.tsx` is **not** — that's the user's hands-on
job. New/extended test files: `personnelMatch.test.ts` (new),
`selectPersonnelTerms.test.ts` (new), `deepseek.test.ts` (extended —
`validateDefinitionResponse`), `questionsService.test.ts` (extended —
`loadLevel2Puzzle` fallback chain), `levelScoring.test.ts` (extended —
`computeLevel2Score`).

## Level 2 verification checklist (user, hands-on — this is the important one)

This is the first Reanimated-worklet code compiled in this repo (the babel plugin and
`GestureHandlerRootView` were already wired at the root from earlier setup, but never
exercised by custom gesture code until now). Things to specifically check:

1. **First `expo start`/`npm run web` after pulling this**: watch the terminal for
   Babel-plugin errors on first compile (a sign a worklet closed over something it
   shouldn't have) — should be silent if everything's right.
2. **Drag mechanics on whichever platform(s) you test**: press-hold a role chip, drag
   it onto a responsibility card, release — chip should land in the card, colored
   green (correct) or red (incorrect); drag a placed chip back out to the pool or
   onto a different card and confirm the old slot frees up correctly (bump/replace
   behavior, not full re-implementation, but worth eyeballing).
3. **Web specifically**: `measure()` timing on `react-native-web` has had historical
   edge cases (stale/zero values immediately after mount) — the design accounts for
   this by always re-measuring fresh at drop time, but it's the one thing flagged as
   worth an early explicit check rather than assuming it away.
4. **Scroll behavior**: the screen's `ScrollView` is intentionally disabled
   (`scrollEnabled={false}`) while a drag is in progress, and re-enabled the instant
   you release — confirm that feels right rather than janky, especially if the device
   window is short enough that ROLES + RESPONSIBILITIES don't all fit on screen.
5. **USE CLUE**: should auto-place one correct match (consuming a token) without
   disturbing any already-correct matches.
6. **Full flow**: match all 4, SUBMIT, confirm it routes to `/level3` and the score
   reflects `computeLevel2Score` (10/correct match + 3 bonus if mistake-free).

If any of this misbehaves, it's very likely in `RoleChip.tsx`'s `onEnd` hit-test math
or the `scrollEnabled`/`draggingTermId` wiring in `app/level2.tsx` — the pure logic in
`personnelMatch.ts` is unit-tested and should not be the culprit.

## New this session: Level 3 — Sterility word search

Built end-to-end per the Level 3 plan (see the note at the top of this file about
`.claude/plans/concurrent-conjuring-ritchie.md` currently holding this plan, not
Level 2's). Source material: `level3notes/Annex 1_ manufacture of sterile
products.pdf` (the full 2022/2023 EU/PIC/S Annex 1 revision — ~10 chapters, including
a clean Glossary of ~50 defined terms, which is what most of the term pool is
grounded in) and `level3notes/sterile_product.pdf` (a Nelson Mandela University
pharmacy course slide deck, used for the `BIOFILM` term and gowning/attire framing).

**A real bug in the mockup was found and fixed, not just ported**: `Battle4GMP.dc.html`'s
Level 3 prototype binds both the scenario cards and the grid rows to the *same*
`toggleFound(idx)` handler — tapping either one directly reveals it, with **no check
that the tapped row actually matches the selected scenario**. It's a click-to-reveal
demo, not real gameplay. This build adds genuine matching (tap a scenario, tap a row,
only "found"s if they actually correspond) — same "wrong answer flashes red, just
retry" pattern already used in Levels 1 and 2, not a literal port of the mockup's
shortcut. Each grid row is a single fixed-width row of letters spelling exactly one
hidden term (not a real multi-directional word search) — matches the mockup's visual
shape while staying far simpler than Level 1's crossword intersection algorithm.

**New files**:
- `src/lib/sterilityTerms.ts` — grounded `{term, fallbackClue}` pairs, now **22**
  (grew twice the same session as the user kept uploading `level3notes/` material):
  - Original 8: CLEANROOM, AIRLOCK, BIOBURDEN, ISOLATOR, ENDOTOXIN, ASEPTIC,
    BIOFILM, GOWNING.
  - +6 once "Sterility Assurance: The Fundamentals" (Pharmaceutical Online guest
    column) and Aulton's Pharmaceutics "Principles of sterilization"/"Sterilization
    in practice" chapters were uploaded: AUTOCLAVE, DEPYROGENATION, STERILANT,
    SPORICIDAL, DOSIMETER, LETHALITY — sterilization methods/validation/
    process-indicators, a different angle from the first two docs' cleanroom/
    environment focus.
  - +8 more mined from those same two later docs when the user asked "aren't
    there more terms in the notes?" (a fair prompt — there were): PYROGEN, RABS,
    PARISON, OVERKILL, THERMOLABILE, DEIONISED, FILTRATION, INTEGRITY. Deliberately
    paired with existing terms rather than duplicating them (e.g. PYROGEN is the
    broad category, ENDOTOXIN already in the pool is one specific type; RABS
    contrasts with the already-present ISOLATOR as the other barrier-technology
    option).
  Each term traced to a specific
  glossary entry/section. **Terms must be a single unbroken word (no spaces)** —
  each is spelled out letter-by-letter in one word-search grid row, so a multi-word
  term like Level 2's "GRADE B GOWNING" wouldn't work here; see the comment atop
  the file. `selectSterilityTerms.ts` still picks 6 per round (now 6 of 14, not
  6 of 8 — `DEFAULT_STERILITY_COUNT` unchanged, just draws from a bigger pool).
- `src/lib/wordSearchLayout.ts` — pure, tested grid-building algorithm mirroring
  `crosswordLayout.ts`'s conventions (typed interfaces, injectable `rng`, a dedicated
  `WordSearchLayoutError`). Column width = the longest selected term's length; each
  row is that term's letters padded with random filler letters; **row display order
  is shuffled independently of term order**, otherwise row N would trivially always
  hold scenario N and the matching gameplay would be meaningless.
- `src/lib/wordSearchMatch.ts` — small pure matching module (`isRowMatch`,
  `allFound`, `firstUnfoundTerm`). Much simpler than Level 2's `personnelMatch.ts` —
  a found term is a one-way permanent reveal with no bump/replace/move semantics, so
  a plain `Set<string>` of found terms is the entire state shape (no reducer needed).
- `src/components/wordsearch/WordSearchGrid.tsx` — each row is one `Pressable` (the
  whole row is the tap target, matching the mockup's row-level `onClick`), with
  default/found(green)/incorrect-flash(red, transient) cell styling.
- `src/components/wordsearch/ScenarioList.tsx` — mirrors `ClueList.tsx`'s
  row-per-item style but interactive/selectable (tap to select, checkmark once found).
- `app/level3.tsx` — full rewrite of the placeholder, mirroring `app/level1.tsx`'s
  shape (loading/error/ready status machine, instructions overlay, USE CLUE gated on
  `spendClueToken()` auto-solving `firstUnfoundTerm`, inline submit-error banner).
  **Routes to `/grand-reward` on successful submit** — Level 3 is the last level, and
  `app/grand-reward.tsx`/`<Stack.Screen name="grand-reward">` already existed as a
  registered (placeholder) route from earlier scaffolding.

**Edited files**:
- `src/lib/deepseek.ts` — added a third parallel trio (`buildScenariosSystemPrompt`/
  `validateScenarioResponse`/`generateScenarios`), same grounding rule as the
  existing clue/definition trios. Reuses the `ClueEntry` `{term, clue}` shape since
  it's structurally identical, just validated against `STERILITY_TERMS` and wrapped
  in a `"scenarios"` JSON key instead of `"clues"`.
- `src/lib/questionsService.ts` — added `loadLevel3Puzzle()` with the **same 4-tier
  fallback chain as `loadLevel1Puzzle`** (DeepSeek → local cache
  `@battle4gmp/level3-puzzle-cache` → Supabase `cached_questions` row `level: 3,
  topic: 'sterility'` → static fallback → `QuestionsUnavailableError`). Unlike Level
  2 (whose static fallback couldn't fail), Level 3's static tier does call
  `layoutWordSearch`, so it keeps the same defensive final-catch tier as Level 1.
- `src/lib/levelScoring.ts` — added `computeLevel3Score`, same formula/constants as
  Levels 1 and 2.

**Testing boundary** (same as Level 1/2 precedent): pure logic
(`wordSearchLayout.ts`, `wordSearchMatch.ts`) is fully unit-tested; the tap
interaction in `app/level3.tsx` itself is not — that's the user's hands-on job.
New/extended test files: `wordSearchLayout.test.ts` (new), `wordSearchMatch.test.ts`
(new), `selectSterilityTerms.test.ts` (new), `deepseek.test.ts` (extended —
`validateScenarioResponse`), `questionsService.test.ts` (extended —
`loadLevel3Puzzle` fallback chain), `levelScoring.test.ts` (extended —
`computeLevel3Score`).

## Level 3 verification checklist — SUPERSEDED

This section originally described a tap-a-row flow (tap a scenario card, then tap a
grid row) that **no longer exists** — Level 3 was rebuilt this session into a
free-form drag-to-select word search. See "Level 3 rebuild: real 2D word search +
drag-to-select" near the top of this file for the current checklist; it replaces
this one entirely. Left as a historical marker only so old context doesn't silently
vanish — don't follow the steps that used to be here.

## New this session: welcome / name-entry screen

The user asked for a screen where every player enters a display name before playing,
stored in Supabase (`players.display_name`, which already existed in the schema with a
default of `'Anonymous Pharmacist'` but was never actually set by the client before this
session). Decisions made (via AskUserQuestion): **name entry is required** (no skip
option), and the **icon is a user-supplied asset** (not a Feather icon).

- **`app/welcome.tsx`** (new) — centered layout: icon, title, subtitle, a name
  `TextInput` (max 24 chars, live char count, inline "required" hint that becomes an
  error after blur-with-empty), and a submit button disabled until valid. Uses
  `assets/welcome.png` for the icon.
  - ⚠️ **`assets/welcome.png` is currently a placeholder** (a plain purple circle with a
    white checkmark, generated via PowerShell `System.Drawing` so the app would build).
    **User said they'll drop in their own icon** — replace this file with the real asset
    (same filename, ideally ~120×120 display size / a few hundred px source, transparent
    background, similar treatment to `assets/crossword.png` below).
- **`app/index.tsx`** gates on this: `if (!hasHydrated) return null;` then
  `if (!displayName) return <Redirect href="/welcome" />;` before rendering the level
  list. Hydration (zustand-persist reading AsyncStorage) is fast enough that no loading
  spinner is shown for it, per the <1s "show nothing" loading rule.
- **`app/_layout.tsx`** — registered `<Stack.Screen name="welcome" />`.
- **`src/store/useGameStore.ts`** — added `displayName: string | null` and
  `displayNameSynced: boolean` (both persisted), plus a `submitDisplayName(name)` action
  that sets the name locally and instantly (optimistic — the screen navigates away
  immediately, per the "low-risk action" UX rule, it never waits on the network) and
  fires `flushPendingSync()` in the background. **`flushPendingSync` was restructured**:
  it used to bail out immediately if `pendingSync` (the score queue) was empty, which
  meant a player row was never created until the first level finished. It now
  establishes/updates the player row (and syncs the name) whenever `!playerId ||
  (displayName && !displayNameSynced)`, independent of whether any scores are queued —
  then only proceeds to flush scores if there are any. This means a `players` row (with
  whatever the default/known name is at the time) now gets created right at app cold
  start rather than deferred, which is intentional but is a real behavior change worth
  knowing about if debugging player-row-creation timing.
- **`src/lib/scoreSync.ts`** — `ensurePlayer(deviceId, displayName?)` now writes the name
  either way: sets it on `insert` for a brand-new row, or issues an `update` for an
  existing row found by `device_id` (covers "user set a name after the anonymous row
  already existed," which is the common case given the app-start-creates-a-row change
  above).
- **`src/components/AppHeader.tsx`** — the existing non-blocking "pending sync" banner
  (previously score-only) now also lights up when a display name hasn't synced yet;
  message text generalized from "Score saved on device…" to "Saved on device…".
- **`src/testHelpers/supabaseMock.ts`** — added `update` to the chainable mock's method
  list (needed for the new `ensurePlayer` update path).
- Tests added: 4 new cases in `scoreSync.test.ts` (insert-with-name, update-on-existing,
  no-op when no name given, db_error on failed update) and 4 new cases in
  `useGameStore.test.ts` (`submitDisplayName` sets state synchronously;
  `flushPendingSync` syncs a pending name with zero scores queued; leaves it unsynced on
  `ensurePlayer` failure; re-syncs even when `playerId` already exists).

## AGENTS.md changed this session

- **Rule 5 (UI verification) rewritten**: the assistant no longer launches Expo / drives
  a headless browser to verify UI changes — **the user checks those themselves now**.
  Rule 3 updated to match (still runs `tsc`/`npm test` after every fix; UI-specific
  verification is the user's responsibility going forward, not a missing step).
  If picking this up in a new chat: don't try to `npm start`/`npm run web` to "finish
  verifying" a UI change unless the user explicitly asks for it — that's now against the
  stated preference, not an oversight.

## Level 1 loading state got a mascot image this session

- `app/level1.tsx`'s loading state (`status === 'loading'`) now shows
  `assets/crossword.png` (a pencil-with-crossword-tiles illustration the user supplied)
  above the existing small spinner + "Generating your crossword…" text, instead of just
  a bare `ActivityIndicator`.
- **Real bug hit and fixed, logged in `ISSUES_AND_SOLUTIONS.md`**: first pass sized the
  image with `{ width: 200, aspectRatio: 1427/1357 }` — `react-native-web`'s `Image`
  doesn't reliably compute height from `aspectRatio` alone, so it rendered at the source
  PNG's native 1427×1357 size and blew the loading screen out ~250px past the fold
  (caught via a headless-Chromium Playwright check, before the UI-check policy above
  changed). **Fix:** explicit numeric `{ width: 150, height: 143 }` instead of
  `aspectRatio`. Also shrank the source file itself from 1427×1357 (800KB) to 300×285
  (~73KB) via a one-off PowerShell `System.Drawing` resize, since it was needlessly
  oversized regardless of the display bug. **Takeaway for any future `Image` usage in
  this app:** always pair `aspectRatio` with explicit `width`+`height`, or just skip
  `aspectRatio` and hardcode both dimensions.

## Term pool expansion (new session, follow-up)

User reported Level 1 and Level 3 rounds felt repetitive. Root cause: pool size vs.
selection count. Level 1 (`ALCOA_PLUS_TERMS`) had only 8 terms selecting 6 per round
(just 2 swap out — heavy repeats, `C(8,6)=28` combos). Level 3 (`STERILITY_TERMS`) had
22 selecting 6 (`C(22,6)≈74,600` — much less repetitive already, but user lumped it in
too, so grew it further for good measure.

Extracted text from all `level1notes/`/`level3notes/` PDFs via `pdftotext -layout`
(`pdftoppm`/poppler for the Read tool's native PDF support isn't installed in this
environment, but Git Bash ships `pdftotext.exe`, which worked fine) and mined
additional grounded, single-word (`/^[A-Z]+$/`, no spaces — required by both
`crosswordLayout.ts` and `wordSearchLayout.ts`) terms not already covered:

- **`src/lib/crosswordTerms.ts`**: +9 terms (8 → 17), grounded in `Data
  integrity_...48868.pdf` (Scilife study guide) and `WHO article on data
  integrity_...27670.pdf` (WHO draft guideline glossary) — terms outside the strict
  ALCOA+ acronym but core to the same data-integrity topic: METADATA, GOVERNANCE,
  ARCHIVING, FALSIFICATION, BACKDATING, RETENTION, STATIC, DYNAMIC, INDELIBLE.
- **`src/lib/sterilityTerms.ts`**: +9 terms (22 → 31), grounded in the Annex 1
  Glossary (section 11, previously only partially mined) and Aulton's
  sterilization-methods chapter: BARRIER, DISINFECTION, DECONTAMINATION, LEACHABLES,
  EXTRACTABLES, HEPA, DECOMMISSION, CONTAMINATION, IRRADIATION.

Both additions follow the file's existing shape exactly (`{term, fallbackClue}`,
grounded to a specific glossary entry/section, clue text paraphrased and verified to
never contain the term itself — same rule `validateClueResponse`/
`validateScenarioResponse` enforce for DeepSeek's own output). **No other files
changed** — `selectCrosswordTerms`/`selectSterilityTerms` and their DeepSeek prompt
builders all read pool length dynamically, and neither test file hardcodes a pool
size, so `npx tsc --noEmit` and `npm test` (146/146) both stayed green with no test
changes needed.

If more repetition complaints come up: Level 1 and Level 3 selection count
(`DEFAULT_TERM_COUNT`/`DEFAULT_STERILITY_COUNT`, both 6) could also be lowered, but
growing the pool (as done here) is the fix that adds variety without changing
difficulty — prefer that first. Level 2 (`PERSONNEL_TERMS`, 12 terms selecting 4) has
the best pool:selection ratio of the three and wasn't touched.

**Immediate follow-up in the same session**: user asked to also pull in terms from the
open internet (not just `level1notes/`), since Level 1's uploaded PDFs are all
ALCOA+/data-integrity-fundamentals material and don't cover computerised-system
concepts. Searched and fetched the MHRA "GxP Data Integrity Guidance and Definitions"
(Revision 1, March 2018 — the authoritative UK regulatory glossary on this exact
topic) via `WebSearch`/`WebFetch`, then ran the fetched PDF through `pdftotext`
(WebFetch's own PDF text extraction failed on this file — compressed content
streams — but it does save the fetched binary locally, which `pdftotext -layout`
handled fine). Added 5 more grounded terms to `crosswordTerms.ts` (17 → 22):
CRITICALITY, TRANSACTION, VALIDATION, RECONSTRUCTION, ADMINISTRATOR — same
`{term, fallbackClue}` shape, same never-leak-the-term clue discipline, each
paraphrased from a specific numbered section of that document (§4.1 criticality,
§6.12 transactions, §6.19 validation-for-intended-purpose, §6.13/6.16
reconstruction/audit-trail, §6.16 system administrator access). `npx tsc --noEmit`
and `npm test` (146/146) both still green, no test changes needed (same reason as
above — nothing hardcodes pool size).

If asked to pull more terms from the internet again for any level: this MHRA document
is a good next place to mine further if Level 1's pool needs to keep growing (it also
has sections on data transfer/migration, data exclusion, and electronic signatures not
yet turned into terms). For Level 2/3, PIC/S and EU GMP Annex 1/Part I are the
equivalent authoritative sources already partially used — check what's already
grounded in `personnelTerms.ts`/`sterilityTerms.ts` before re-fetching the same
documents.

## Crossword axis labels removed this session

Last session's build added column-number/row-letter axis labels around the crossword
grid (`CrosswordGrid.tsx`). The user asked to remove them this session — done: the
label row/column, the `rowLabel()` helper, `LABEL_SIZE`/`ROW_GAP` constants, and the
`axisLabel` style were all deleted; the cell-size width calculation was simplified to
match. **The in-cell clue-start numbers (small "1"/"2" used for the "1A"/"4D" clue
list) were intentionally left untouched** — only the outer axis labels were removed.

## Key architecture decisions (read before changing related code)

- **Crossword term selection is deterministic, not LLM-driven.** `src/lib/crosswordTerms.ts`
  holds the canonical ALCOA+ term whitelist (`CONTEMPORANEOUS` excluded — 15 letters,
  too wide). `src/lib/selectCrosswordTerms.ts` picks a random 6-term subset client-side.
  DeepSeek (`src/lib/deepseek.ts`) is only ever asked to write clue *wording* for terms
  it's handed — it can't invent/rename/drop terms (`validateClueResponse` enforces this).
  Grid layout (`src/lib/crosswordLayout.ts`) is a pure, deterministic, greedy
  intersection-placement algorithm — fully unit tested, never touches the LLM.
- **`AlcoaTerm.fallbackClue` is a real, used field** (grounded in `level1notes/` source
  material — see prior session's notes in git history/earlier HANDOFF revisions if you
  need the full story). `src/lib/questionsService.ts`'s `loadLevel1Puzzle` fallback
  chain is 4 tiers: DeepSeek → AsyncStorage cache → Supabase cache → static fallback
  (`ALCOA_PLUS_TERMS[].fallbackClue`) → `QuestionsUnavailableError`.
- **Supabase typed client gotcha** (logged in `ISSUES_AND_SOLUTIONS.md`): row/table types
  in `src/types/database.ts` must be `type`, never `interface` — interfaces silently fail
  the client's internal `GenericSchema` check and every `.from()` call degrades to `never`
  with no error at the declaration site. Every table/view also needs a `Relationships: []`
  field and the schema needs a top-level `Functions: Record<string, never>`. **If you run
  `supabase gen types typescript` (command below) to regenerate this file, diff the
  output against the current file rather than blindly overwriting — the generator's
  shape may not preserve this constraint.**
- **jest-expo on SDK 57 needs jest pinned to the 29.x line** (`jest@^29.7.0`,
  `@types/jest@^29.5.0`, `@react-native/jest-preset@0.86.2` matching the exact installed
  `react-native` version) — jest 30 conflicts with jest-expo's transitively-pulled
  jest-29-era packages. `.npmrc` has `legacy-peer-deps=true` for the same reason.
- **Score sync is insert-only, never update-in-place** for the `scores` table (no UPDATE
  RLS policy) — `src/lib/scoreSync.ts`'s `flushScoreSnapshot` inserts a full snapshot at
  every level completion. The leaderboard view's per-player `max(total_score)` handles
  the resulting multiple partial-run rows correctly. **`players.display_name` is the
  opposite** — it *does* have an UPDATE policy (`players_update_own`, open `using(true)`)
  and the new `ensurePlayer(deviceId, displayName)` uses it.
- **Offline sync has no NetInfo dependency** — `useGameStore`'s `pendingSync` queue (and,
  as of this session, the display-name sync) retries at app start and at every
  subsequent `completeLevel()`/`submitDisplayName()` call, not on a network-change
  listener (kept out of the original tech stack deliberately).
- **`BottomNav` deliberately deviates from the mockup**: it respects level-locking.
- **DeepSeek model choice**: `deepseek-chat` (DeepSeek-V3), not `deepseek-reasoner` — see
  `src/lib/deepseek.ts` comments if changing this.
- **`CrosswordGrid.tsx` keyboard-dismiss bug** (native-only, fixed a prior session) and
  the **`Image`+`aspectRatio` sizing bug** (this session) are both logged in
  `ISSUES_AND_SOLUTIONS.md` — check there before touching focus/keyboard or image-sizing
  code again.
- **All three levels now share one shape**: a grounded `{term, fallback...}` pool file
  (`crosswordTerms.ts` / `personnelTerms.ts` / `sterilityTerms.ts`) → a Fisher-Yates
  `selectXTerms(count, rng)` picker → a DeepSeek trio in `deepseek.ts` (system prompt
  grounded in the pool + validator + generate function) → a `loadLevelNPuzzle()` in
  `questionsService.ts` with the same 4-tier fallback chain → a `computeLevelNScore`
  in `levelScoring.ts` sharing `POINTS_PER_WORD`/`NO_ERROR_BONUS`. If a 4th topic ever
  gets added, this is the pattern to replicate, file-for-file.

## Environment

- `.env` exists locally with **real, live** Supabase + DeepSeek credentials (gitignored,
  confirmed not tracked). `.env.example` is safe placeholders only.
- Supabase project ref (from `.env`'s `EXPO_PUBLIC_SUPABASE_URL`): `droxktnatrheuumzffht`.
- Supabase project already has `supabase/schema.sql` applied (players/scores/
  cached_questions tables + leaderboard view + RLS policies).
- **To pull fresh types from Supabase** (asked about this session, not yet run):
  ```
  npx supabase login
  npx supabase gen types typescript --project-id droxktnatrheuumzffht --schema public > src/types/database.ts
  ```
  Remember the `interface`-vs-`type` gotcha above before overwriting the hand-written file.
- **EAS iOS dev-build setup was started two sessions ago** — `eas.json` and
  `app.json`'s `extra.eas.projectId` exist; user ran `eas build:configure`,
  `expo install expo-dev-client`, `eas device:create`, and `eas build` themselves.
  **Unknown as of this writing whether that build actually succeeded/installed** — ask
  before assuming. Don't run `eas build`/`eas device:create`/`eas submit` without asking
  first regardless (external, billed, account-tied service).

## Immediate next steps

1. **User needs to hands-on verify both Level 2 and Level 3.** Level 2's checklist is
   below (still accurate, still unverified). **Level 3's checklist moved** — it's now
   under "Level 3 rebuild: real 2D word search + drag-to-select" near the top of this
   file, since the level was rebuilt entirely this session (free-form drag-to-select,
   real vertical+horizontal placement); the old tap-a-row checklist is gone. Level 3
   is now arguably the higher-risk one of the two remaining checks — it's the first
   Pan-gesture-inside-a-ScrollView case in the repo with vertical drags as a core
   interaction, not an edge case.
2. **Still outstanding from an earlier session**: welcome screen full-flow check, and
   `assets/welcome.png` is still the placeholder purple-circle PNG — swap in the real
   icon the user wanted whenever they hand it over.
3. **More Level 2 source material may still be coming** — the user said they'd upload
   additional Level 2 notes; when that happens, add rows to `src/lib/personnelTerms.ts`
   (grounded `{term, fallbackDefinition}` pairs). Same applies to Level 3 — add rows to
   `src/lib/sterilityTerms.ts` if more `level3notes/` material arrives. Neither needs
   any other file changed.
4. Consider running the Supabase type-gen command below and diffing it against
   `src/types/database.ts`, if types have drifted (not yet done, low priority).
5. **After both Level 2 and Level 3 are verified: build out `app/grand-reward.tsx`**
   (currently a bare placeholder, same shape as the other levels were before their
   build sessions) — this is now the actual last step of the 5-item original spec
   (Level 1 → Level 2 → Level 3 → Grand Reward → Scoreboard), and the only screen a
   full playthrough currently dead-ends into. Check `Battle4GMP.dc.html`'s
   `isResults` block (trophy icon, per-level results rows, total score, "Play Again"/
   "Home" buttons) as the visual source of truth before building it.
6. Scoreboard content is also still unbuilt (`app/scoreboard.tsx` — not checked this
   session, assume placeholder) — last item in the original 5-item spec.

Uploaded source material: `level1notes/` (5 PDFs, ALCOA+/data integrity),
`level2notes/` (2 PDFs — Annex 1 §7 Personnel, and PIC/S GMP Guide Part I Chapter 2),
`level3notes/` (2 PDFs — the full EU/PIC/S Annex 1 revision, and a Nelson Mandela
University sterile-products slide deck). All still in place if needed for reference;
more Level 2 notes specifically are expected at some point.

## How to verify after changes

```
npx tsc --noEmit
npm test
```
**UI verification (`npm run web` / Expo Go / hands-on) is the user's responsibility now
— do not launch dev servers or drive a headless browser for this unless explicitly
asked.** If you are explicitly asked to do it anyway: the `run` skill's Playwright
fallback pattern was used successfully in earlier sessions (headless Chromium,
`waitUntil: 'domcontentloaded'`, `playwright` resolved via the `npx` global cache since
it isn't a local devDependency — see git history / prior HANDOFF revisions for the exact
driver script if repeating). Avoid CDP network-throttling in that script — it caused a
screenshot to hang waiting on web font loads in an earlier attempt.

⚠️ **Windows gotcha**: killing a background `expo start` via `pkill -f "expo start"`
(Git Bash) does **not** reliably kill the underlying Windows `node.exe` process tree.
Use `tasklist //FI "IMAGENAME eq node.exe"` and `taskkill //F //IM node.exe` (or
`taskkill //F //PID <pid>` for a specific listener found via `netstat -ano`) to clear
stray processes if a dev server won't bundle/hangs.

## Reference docs in this repo

- `AGENTS.md` — binding workflow/UX process rules, read in full every session. Note the
  rule 5 change this session (UI checks are no longer the assistant's job).
- `ISSUES_AND_SOLUTIONS.md` — bug log with root causes, check before fixing anything
  that looks familiar. Three entries as of this session: the Supabase `interface`-vs-
  `type` gotcha, the `CrosswordGrid` keyboard-dismiss bug, and the `Image`+`aspectRatio`
  sizing bug.
- `supabase/schema.sql` — source of truth for the DB shape.
- `Battle4GMP.dc.html` — source of truth for visual design (the welcome screen has no
  entry here — it was designed fresh this session to match the app's existing style).
- `Battle4GMP_game_proposal.pdf` — the original academic research proposal.
- `.claude/plans/greedy-singing-kite.md` — the approved plan for the original Level 1
  build (DeepSeek service, Zustand store, Level 1).
