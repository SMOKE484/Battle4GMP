# Issues & Solutions

Bug log per `AGENTS.md` workflow rule 6. Check here before fixing something that looks
familiar — it may already have a documented root cause and fix.

---

## `src/lib/questionsService.ts` calls to `supabase.from('cached_questions')` typed as `never`

**Found:** while wiring up the DeepSeek/Zustand/Level 1 work, `npx tsc --noEmit` failed with
`Object literal may only specify known properties, and 'level' does not exist in type
'never[]'` and `Property 'question_set' does not exist on type 'never'` on the two
`cached_questions` calls in `questionsService.ts`.

**Root cause:** `src/types/database.ts` declared `PlayerRow`, `ScoreRow`, `CachedQuestionRow`,
`LeaderboardRow`, and originally `Database` itself as TypeScript `interface`s. The
`@supabase/supabase-js` typed client internally resolves your schema via a conditional type:
`Schema extends Database['public'] extends GenericSchema ? Database['public'] : never`, and
`GenericSchema['Tables']` is typed as `Record<string, GenericTable>` where
`GenericTable = { Row: Record<string, unknown>; Insert: Record<string, unknown>; ... }`.

TypeScript's structural check for "does type X satisfy an index-signature type like
`Record<string, unknown>`" only succeeds for object **type literals** (`type Foo = {...}`) —
**not** for `interface Foo {...}`, even when the two are structurally identical. An interface
without its own explicit index signature is never assignable to `Record<string, unknown>` in an
`extends` conditional check. So `PlayerRow extends Record<string, unknown>` was `false`, which
made the whole `Database['public']` schema fail its `GenericSchema` check, which silently
collapsed `Schema` to `never` — and every `.from(...)` call site downstream typed as `never`
without any error at the `Database` declaration site itself (the failure only surfaces later,
wherever the client is actually used).

Confirmed empirically (not just from memory) with an isolated scratch file before touching the
real code — see the conversation history around this fix for the exact repro.

**Fix:** converted every row type and the top-level `Database` type from `interface` to `type`
(object type literal) in `src/types/database.ts`. Also required, independently, for the
`GenericSchema` check to pass:
- Each table needs a `Relationships: []` field (empty tuple, satisfies `GenericRelationship[]`).
- Each view needs `Relationships: []` too.
- The schema needs a top-level `Functions: Record<string, never>` key (we have no Postgres
  functions to expose, but the key itself must exist).

**How to avoid regressing this:** always declare new Supabase row/table types in
`src/types/database.ts` using `type X = {...}`, never `interface X {...}`. If a new table or
view is added to `supabase/schema.sql`, its `Database['public']['Tables' | 'Views']` entry needs
`Relationships: []` too.

---

## Level 1 crossword: keyboard dismisses whenever a letter is typed

**Found:** user testing on a real iPhone (via an EAS development build) reported that typing a
letter into the crossword grid makes the on-screen keyboard disappear.

**Root cause:** in `src/components/crossword/CrosswordGrid.tsx`, each cell's `TextInput` had
`editable={state !== 'locked'}`. `app/level1.tsx`'s `handleChangeCell` locks a cell the instant
the *correct* letter is typed into it (adds it to `lockedCells`), which re-renders that same
`TextInput` with `editable` flipped to `false` — while it still has native focus, since the user
just typed into it. Setting `editable={false}` on a currently-focused `TextInput` causes iOS (and
Android) to blur it and dismiss the keyboard; it does *not* reproduce the same way on
`react-native-web`, since RN Web maps `editable={false}` to the DOM `readOnly` attribute, which
doesn't force a blur — this is why it wasn't caught by the earlier browser-based hands-on
verification and only surfaced once tested on a physical device.

Confirmed via headless-Chromium Playwright driver: typed the correct letter into the first grid
cell, observed `document.activeElement` before/after — before the fix this would've stayed on
the (now-`readOnly`-but-not-blurred-on-web) same input; the real bug only manifests on native.
The fix itself was verified by confirming focus programmatically lands on a *different* `<input>`
after a correct entry, with zero console errors.

**Fix:** rather than just leaving a solved cell disabled-and-abandoned (a workaround), auto-advance
focus to the next open cell in the same word the instant a letter locks in — standard crossword
UX, and it means focus never needs to be "stranded" on a field that's about to become
non-editable. Added a `useRef<Map<string, TextInput>>` keyed by `cellKey` in `CrosswordGrid.tsx`,
plus `focusNextCellInWord()` which looks up the word containing the just-filled cell (via
`grid.words`, already available), computes the next cell along that word's direction, and calls
`.focus()` on it if it exists and isn't already locked. Only fires on a *correct* entry (the only
path that flips `editable`); wrong entries don't lock the cell, so they never triggered this bug.

**How to avoid regressing this:** never toggle `editable`/`disabled` on a `TextInput` that may
currently hold focus without also moving focus somewhere else first (or in the same tick). If a
future level adds more free-text or single-character inputs with a "lock on correct" pattern,
apply the same auto-advance-before-lock approach rather than just disabling in place. Also: a
component-level interaction like this can pass hands-on verification on web (`npm run web`) and
still be broken on native — this class of bug is worth explicitly re-checking on-device (EAS
build or Expo Go) rather than trusting web verification alone once native input focus/keyboard
behavior is involved.

---

## `Image` with only `aspectRatio` set (no explicit `height`) fills the whole screen

**Found:** added a decorative mascot image (`assets/crossword.png`) to `app/level1.tsx`'s loading
state, styled with `{ width: 200, aspectRatio: 1427 / 1357 }`. Headless-Chromium hands-on
verification showed the image rendering far larger than intended, pushing the loading
spinner/text ~250px below the fold (`document.documentElement.scrollHeight` was 1149 against a
900px viewport).

**Root cause:** `react-native-web`'s `Image` doesn't reliably compute a height from `aspectRatio`
alone — with no explicit `height`, it fell back to the source PNG's native intrinsic pixel size
(1427×1357), not the intended ~200×190 box. Confirmed by inspecting the live DOM: the "centered"
flex container itself measured correctly (785px tall, fully within viewport), but the actual
`<Image>`/text elements inside it were laid out far outside that box — consistent with the image
sizing itself off the source asset's real dimensions rather than the style.

**Fix:** set explicit numeric `width` and `height` in the style (`{ width: 150, height: 143 }`)
instead of relying on `aspectRatio`. Also resized the source PNG itself from 1427×1357 (800KB) to
300×285 (~73KB) via a one-off `System.Drawing` resize, since a 4x-oversized source asset was
needlessly slow to load regardless of the display-size bug.

**How to avoid regressing this:** never size an `Image` with `aspectRatio` as the only
height-determining style prop, especially for web/RN-Web targets — always pair it with an explicit
`width` *and* `height` (or verify hands-on that the computed box is what's intended). Keep source
image files close to their actual display size rather than shipping full-resolution exports.

---

## `LevelInstructions` overlay flashes the previous step's mascot before showing the current one

**Found:** user reported that clicking "Next" in the Level 1 instructions overlay briefly shows
the *previous* step's mascot image before it swaps to the correct one for the new step.

**Root cause:** `<Image source={step.image.source} .../>` just updates the `source` prop on the
same `Image` element when `stepIndex` changes — both React Native and `react-native-web` keep
rendering whatever bitmap is already on screen until the new source finishes loading/decoding,
rather than clearing to blank first. Each mascot is a distinct, fairly large local asset
(100–165KB), so that decode isn't instant, and the gap was long enough to see the stale image.

**Fix:** added a `useEffect` in `LevelInstructions.tsx` that prefetches every step's image (via
`Image.prefetch(Image.resolveAssetSource(source).uri)`) as soon as the overlay becomes visible —
by the time a player has read the first step and clicks Next, all four images are already
decoded/cached, so the `source` swap is instant with nothing stale visible in between.

**How to avoid regressing this:** any UI that swaps an `Image`'s `source` in response to user
interaction (step carousels, tabs, galleries) should prefetch every candidate image up front if
the set is small and known ahead of time — don't rely on the first render of a new source to be
fast enough to avoid a visible flash of the old one.

---

## Level 3 word search: tapping a row counted filler letters as part of the word, and there was no vertical placement

**Found:** user reported "tapping a row does not work properly" and that they wanted words to
sometimes run vertically, plus that tapping shouldn't include letters that aren't part of the
word.

**Root cause:** this wasn't a broken-tap bug in the literal sense (the tap handler itself fired
correctly) — it was a fundamental mismatch between the gameplay model and a real word search.
`wordSearchLayout.ts`'s `layoutWordSearch` laid out **one term per row**, padded with random
filler letters out to the width of the longest term in the pool, and `WordSearchGrid.tsx` made
**the entire row** (real letters + filler) a single `Pressable`. So "tapping a row" really meant
"guessing which row holds your selected scenario's term" — there was no way to select just the
real letters, and no vertical placement existed at all (every term was forced horizontal).

**Fix (a real rebuild, not a patch):** replaced the whole grid + interaction model with a genuine
2D word search:
- `src/lib/wordSearchLayout.ts` — real placement algorithm, across **4 axes**
  (`WordSearchDirection = 'horizontal' | 'vertical' | 'diagonalDownRight' |
  'diagonalDownLeft'` — the exported `directionDelta()` maps each to its `{dRow, dCol}` step;
  only 4, not 8, since a straight run of cells reads identically from either end and matching
  already checks both directions, so e.g. "left" is just "horizontal" read backwards, not a
  separate axis). Each term is placed once at a random direction + in-bounds position; a word
  may cross another only where the letters agree; remaining cells get random filler letters.
  Grid size is derived from the longest term + total letter count, grown and retried (up to
  `MAX_GRID_GROWTH_ATTEMPTS`) if a layout can't fit everything — adding the 2 diagonal axes
  didn't require growing this further (verified empirically: grid size range was identical
  before/after, 11×11–17×17 across 300+500 simulated rounds). Returns `{ rows, cols, cells:
  string[][], placements: {term, row, col, direction}[] }` instead of the old one-row-per-term
  shape.
- `src/lib/wordSearchMatch.ts` — `matchTermFromSelection(letters, terms, found)` checks the
  dragged letters against every still-hidden term, forwards **and backwards** (a player may
  trace a word from either end). Purely geometry-agnostic (just an array of letters in, a
  term or null out), so it needed zero changes when diagonals were added.
- `src/lib/wordSearchSelection.ts` (new) — pure drag-selection geometry, deliberately kept out
  of any Reanimated worklet so it stays trivially Jest-testable: `snapDragEnd` picks whichever
  of the 4 axes best fits a raw (possibly wobbly) drag delta by comparing deviation-from-each-axis
  error terms; `cellsBetween` enumerates the straight run between two cells on any of those axes.
- `src/components/wordsearch/WordSearchGrid.tsx` — real drag-to-select via
  `react-native-gesture-handler`'s `Gesture.Pan()`: press the first letter, drag straight to the
  last (any of the 4 axes, either reading direction), release. **Worklet stays minimal by
  design**: `.onStart`/`.onUpdate`/`.onEnd` only convert touch position to a clamped row/col and
  throttle (`runOnJS` only fires once per cell moved into, not once per touch-move frame) — all
  actual axis-snapping/cell-enumeration happens in plain JS via `wordSearchSelection.ts`, never
  inside the worklet, avoiding any risk from calling cross-module functions on the UI thread.
  Uses the gesture event's `x`/`y` (relative to the gesture's own attached view) directly — no
  `measure()` needed, unlike Level 2's cross-component drag, since selection and rendering happen
  in the same component here.
- **Flow changed from "select a scenario, then find its row" to free-form** (confirmed with the
  user via AskUserQuestion before building): no pre-selection at all now — drag any word you
  spot anywhere in the grid; if it matches a still-hidden term it locks in and its scenario card
  checks itself off automatically. `src/components/wordsearch/ScenarioList.tsx` is now a pure
  display list (no `Pressable`/selection state).
- **Gesture-vs-ScrollView conflict, handled proactively:** a `Gesture.Pan()` nested inside a
  `ScrollView` is a well-known conflict zone (both want to own vertical drags), and vertical
  selection is now a core feature, not an edge case. Applied the same fix already proven
  elsewhere in this repo for Level 2's drag (`app/level2.tsx`'s `scrollEnabled={draggingTermId
  === null}`): `WordSearchGrid` reports `onDragActiveChange(active)` (derived from its own
  selection state via a `useEffect`, not a new gesture callback), and `app/level3.tsx` disables
  its `ScrollView` (`scrollEnabled={!isSelectingGrid}`) for the duration of a drag.

**How to avoid regressing this:** if Level 3's term pool ever needs a genuinely huge word (much
longer than today's ~15-letter max), watch `MAX_GRID_GROWTH_ATTEMPTS`/`MAX_PLACEMENT_ATTEMPTS` in
`wordSearchLayout.ts` — a pathological pool could still throw `WordSearchLayoutError` if it can't
be fit; the static fallback tier in `questionsService.ts` already has a defensive final catch for
this (same as Level 1). Any future gesture-based interaction nested inside a `ScrollView`
anywhere in this app should use the same `scrollEnabled` toggle pattern rather than rediscovering
the conflict.

---

## Ad hoc `ensurePlayer()` calls (challenge/room create+join flows) never wrote the resolved `playerId` back into the store

**Found:** while building Stage 2 (Live Host Room)'s host screen, which needs to compare the
current device's `playerId` against `room.host_player_id` to decide whether to show host
controls. Realized that `app/challenge/create.tsx`, `app/challenge/join.tsx`, and the
`submitChallengeRun` helper added to `app/level1.tsx`/`level2.tsx`/`level3.tsx` in the prior
(Stage 1) session all call `ensurePlayer(deviceId, displayName)` directly whenever the store's
`playerId` is still `null`, use the returned id locally for that one Supabase call, and then
**never persist it** — `useGameStore`'s `playerId` field has no setter besides the one buried
inside `flushPendingSync`'s own internal `ensurePlayer` call. Caught this by inspection before
writing any Stage 2 screen, not from a failure — no user-facing symptom had occurred yet, since
`ensurePlayer` is idempotent per `device_id` (every ad hoc call resolves to the *same* row), so
Stage 1's own behavior was correct, just wasteful, and the store staying stale is silent as long
as nothing later reads `playerId` for an identity comparison rather than an insert.

**Root cause:** `useGameStore.ts` never exposed a way to write `playerId` from outside the
`flushPendingSync` flow, so every "resolve identity ad hoc, right before this Supabase call"
pattern had no correct place to feed the result back.

**Fix:** added a `setPlayerId(playerId: string)` action to `useGameStore.ts` and called it after
every ad hoc `ensurePlayer` success across all six call sites (`challenge/create.tsx`,
`challenge/join.tsx`, `level1.tsx`/`level2.tsx`/`level3.tsx`'s `submitChallengeRun`, plus the new
`room/create.tsx`/`room/join.tsx`/`room/[code]/play.tsx` added this session). No behavior change
for Stage 1 (still resolves the same player row either way) — this fix is what makes Stage 2's
`isHost = playerId === room.host_player_id` check reliable.

**How to avoid regressing this:** any new screen that resolves a `playerId` via a direct
`ensurePlayer(deviceId, ...)` call (rather than going through `completeLevel`/
`flushPendingSync`) must call `useGameStore.getState().setPlayerId(...)` (or the hook form) on
success, so the store never silently drifts from the last-resolved identity.

---

## Uninstalling and reinstalling the app creates a duplicate `players` row instead of recovering the original

**Found:** user reported that after uninstalling and reinstalling the app, it prompts for a
display name again and creates a *new* account rather than recognizing the same person — even
though nothing about the physical device changed. Confirmed against a live data pull from
`players`: duplicate `display_name`s ("Anonymous Pharmacist" ×4, "jhhzqy" ×3, "Phathu" ×2), each
row on a different `device_id`, several minted minutes apart — consistent with exactly this
happening repeatedly during testing.

**Root cause:** `src/lib/deviceId.ts`'s `getOrCreateDeviceId()` stored the anonymous `device_id`
*only* in AsyncStorage. AsyncStorage is deleted when an app is uninstalled (iOS and Android
alike), so on reinstall `getOrCreateDeviceId()` found nothing cached and minted a brand-new random
id. `ensurePlayer()` in `scoreSync.ts` then looked that new id up in `players`, found no match,
and inserted a fresh row — orphaning the original row and its score history. The schema comment
in `supabase/schema.sql` ("One row per device/session") documents device-scoped identity as the
intent, but AsyncStorage is install-scoped, not device-scoped, so the storage layer didn't match
the intent.

**Fix:** when AsyncStorage is empty (fresh install *or* reinstall — indistinguishable from inside
the app), fall back to a platform store that actually outlives an uninstall, checked against the
versioned Expo SDK 57 docs rather than assumed:
- **Android:** `Application.getAndroidId()` (`expo-application`) reads
  `Settings.Secure.ANDROID_ID`, which is stable across reinstall (same signing key, no factory
  reset) — used directly as the `device_id`, no storage needed.
- **iOS:** the Keychain (unlike UserDefaults/AsyncStorage) is not cleared on uninstall when the
  app is reinstalled with the same bundle ID. Switched to `expo-secure-store` (Keychain-backed):
  on an empty AsyncStorage, check the Keychain first — a reinstall recovers the previous id
  exactly; only mint+store a new random id there on a genuine first install.
- **Web:** unchanged (AsyncStorage/localStorage) — there's no meaningful "uninstall" concept.
- Any read/write failure on the platform store falls through to the old behavior (a fresh random
  id), so this can never regress below what existed before.
- Existing installs are untouched: `getOrCreateDeviceId()` still returns the cached AsyncStorage
  id immediately when one is present, so shipping this fix doesn't fragment anyone already mid-use.

Added `src/lib/__tests__/deviceId.test.ts` covering: cached-id short-circuit, Android happy path +
empty-id fallback + throw fallback, iOS Keychain-recovery + first-install-mint + read-throw +
write-throw fallback, and web's unchanged behavior.

**How to avoid regressing this:** never revert `device_id` generation to a single
AsyncStorage-only source — that's exactly what breaks reinstall recovery. This is a best-effort
fix, not a guarantee: Android ID still resets on factory reset or an app signing-key change, and
Apple doesn't officially guarantee Keychain-survives-uninstall behavior (though Expo's own docs
rely on it). It also does not let a player recover their account on a *different* device — only
reinstall-on-the-same-device — that would require real auth (email/magic-link), a separate,
larger feature. The already-duplicated rows from before this fix (see the sample above) are not
retroactively merged — that would need a one-off manual cleanup pass in Supabase, not code.

---

## Web target: clicking "Play" on any level (solo or via a multiplayer/challenge attempt) shows a white screen

**Found:** user reported that on the web build (`npm run web`), tapping Play on any level — and
also via the multiplayer flow — turned the screen completely white, with a console error:
`Uncaught TypeError: n.default.resolveAssetSource is not a function` inside a minified
`Array.forEach`.

**Root cause:** `src/components/LevelInstructions.tsx`'s image-prefetch effect (added in the
"overlay flashes the previous step's mascot" fix, logged above) called
`Image.resolveAssetSource(s.image.source)` for every instruction step with an image, to get a
URI to hand to `Image.prefetch`. `Image.resolveAssetSource` is a **native-platform-only** static
utility (it turns a `require()`'d numeric asset id into a real `{uri, width, height, scale}`) —
`react-native-web`'s `Image` export doesn't implement it at all, so on web it's `undefined`, and
calling it throws a `TypeError`. This ran inside a `useEffect`, and since this app has no error
boundary anywhere, an uncaught error there unmounted the *entire* React tree — hence a blank
white screen rather than a contained failure.

This reproduced on **every** level with at least one instruction image (Level 1 has 4, in
`LEVEL1_INSTRUCTIONS`) — explaining both repro paths the user reported as separate: opening a
level directly, and "Play" from the multiplayer/challenge flow, since a challenge attempt
(`challengeId` route param) reuses the exact same `app/level1.tsx`/`level2.tsx`/`level3.tsx`
screens, which mount the same `LevelInstructions` component on first visit.

This crash is web-only and was never caught by the assistant's own type-checking (`Image` is
still a valid import, `resolveAssetSource` exists in React Native's own type definitions — the
break is purely a *runtime* platform gap, invisible to `tsc`), and per AGENTS.md rule 5 hands-on
UI verification is the user's job, not something driven automatically each session — this is
exactly the kind of bug that only surfaces on an actual run.

**Fix:** guarded the whole prefetch effect to skip on web (`Platform.OS === 'web'`), rather than
trying to hand-roll a web-safe URI resolver for a purely cosmetic optimization. This means web
reverts to the pre-existing, already-documented (non-crashing) "flash of the previous mascot on
Next" behavior instead of prefetching — native platforms (where `resolveAssetSource` is required
and actually works) are completely unaffected.

**How to avoid regressing this:** never call `Image.resolveAssetSource` (or any other
native-only static RN API) without checking it's actually needed on web first — react-native-web
does not implement every static utility React Native ships, and a crash inside a `useEffect` with
no error boundary in this app takes down the whole screen, not just the feature that used it. If
a genuinely web-safe prefetch is wanted later, derive the URI from the resolved `source` prop
directly (on web, a `require()`'d image typically already resolves to a plain string/URL at
bundle time, no `resolveAssetSource` call needed) rather than branching platform behavior inside
a shared native API call.

---

## Realtime never fires: host clicks START and nothing happens until a manual refresh

**Found:** user reported that on web, clicking START on a Rapid Round did nothing — no phase
change on the host's own screen, nothing on the players' screens — until the page was manually
refreshed, and even then it didn't feel immediate. Reported as "the real-time is not working
properly".

**Root cause — two independent defects that compounded into this one symptom:**

**1. The tables were never added to the `supabase_realtime` publication.** Supabase only emits
`postgres_changes` events for tables that are explicit members of that publication, and tables
are *not* added automatically when created. `supabase/schema.sql` created `challenge_rooms` (and
later `room_invites`) but never ran `alter publication supabase_realtime add table ...`, so every
`subscribeToRoom`/`subscribeToInvites` channel connected, reported `SUBSCRIBED`, and then
delivered exactly zero events forever. Confirmed against Supabase's own postgres-changes docs
before changing anything, not assumed. **This is a genuinely silent failure mode** — there is no
error, no warning, and the subscription status looks perfectly healthy, which is precisely why it
survived the original build and its review.

**2. The host's own screen depended on the realtime echo of its own write.** `handleStart` in
`app/room/[code].tsx` was `() => room && void advancePhase(room.id, 'question', 0)` — it wrote
the new phase to Postgres and never touched local state, waiting for the change to come back
around via `subscribeToRoom` to re-render. So with defect 1 in play, the host's own START button
was completely inert; and even with realtime healthy it would still have added a needless
round-trip of dead time on every host action. It was also fire-and-forget (`void`), so a failed
`advancePhase` produced no feedback whatsoever — a silent failure on the single most important
button in the feature, contrary to AGENTS.md's "every action must have a visible, predictable
result" and "the worst error is a silent failure".

The "even when I refresh it doesn't show immediately" part is explained by defect 2: a refresh
refetches the room, but if the host's own advance never actually landed (or the host had to
re-click), there was nothing new to fetch.

**Fix (three parts — the first is the root cause, the other two make the feature degrade
gracefully rather than silently):**
- `supabase/schema.sql` — adds `challenge_rooms` and `room_invites` to the `supabase_realtime`
  publication, wrapped in a `do $$ ... $$` idempotency guard (ALTER PUBLICATION has no
  `IF NOT EXISTS` and errors on a re-run; this file is meant to be re-runnable) plus a guard for
  the publication itself existing at all.
- `advancePhase` now returns the updated row (`.select().single()`), and every host action in
  `app/room/[code].tsx` goes through a `runAdvance` helper that applies that returned row to
  local state immediately, disables the control while in flight, and renders an inline error
  beside the button on failure. The host no longer depends on realtime to see its own action.
- **A polling safety net**, in the new shared `src/hooks/useRoomSync.ts` (now used by both room
  screens): alongside the realtime subscription, it refetches the room every
  `ROOM_POLL_INTERVAL_MS` (3s). This is deliberately **not** gated on realtime reporting an
  error — the actual failure here was a channel that reported `SUBSCRIBED` and delivered nothing,
  so status-gated polling would not have rescued it. All updates (realtime and poll alike) funnel
  through `shouldApplyRoomUpdate`, which rejects stale and byte-identical updates so a slow poll
  response can never snap the room backwards (e.g. 'question' → back to 'lobby') or re-render the
  countdown every 3s.
- Also fixed while in here: the countdown auto-advance effect could fire several duplicate
  `advancePhase` calls, since `now` ticks every 250ms while the phase stays `'question'` until
  the write resolves. Now guarded by a ref keyed on room+question+phase_started_at.

**How to avoid regressing this:** any new table that a client subscribes to via
`postgres_changes` **must** be added to the `supabase_realtime` publication in `schema.sql` —
adding the table and its RLS policies is not enough, and nothing will error to tell you.
Separately, never let a client's own write depend on the realtime echo to update that same
client's UI: apply the authoritative row the write returns, and treat realtime as the mechanism
for informing *other* clients. Note that the schema changes here (like every prior multiplayer
session's) must be applied to the live Supabase project before any of this takes effect.

---

## Room lobby's "CONNECTED" player list never updates, no matter how long you wait

**Found:** user reported the connected-players count in a live room's lobby "isn't real time" —
distinct from the earlier START-button realtime bug (already fixed).

**Root cause:** `app/room/[code]/play.tsx` (the player's own screen) never called
`subscribeToPresence`. Only the host's screen (`app/room/[code].tsx`) tracked itself on the
room's presence channel — and it used that same subscription both to track the host's own
presence *and* to render the "CONNECTED (N)" list. Since no joining player ever tracked itself on
that channel, the host's list could only ever show the host, regardless of how many players
joined or how long anyone waited — this was never a timing/latency issue, presence for players was
simply never wired up.

**Fix:** `play.tsx` now calls `subscribeToPresence` for itself once `roomId`/`playerId` are known
(discarding the roster callback — the player doesn't need to render it, just needs to *be* in it).

**How to avoid regressing this:** a presence channel only reflects the clients that actually call
`.track()` on it — subscribing and rendering the sync callback on one screen doesn't do anything
for who shows up in it. Any screen representing a "participant" in a live room needs its own
track call, not just the screen doing the displaying.

---

## Rapid Round game-loop change: player screen now shows the question text, and reveal no longer stops at a per-question leaderboard

**Not a bug** — two feature changes requested together, logged here because they touched the same
core phase machinery as the two fixes above (`RoomPhase`, `advancePhase`, both room screens).

1. **Question text now shows on the player's phone**, not just the shared/host screen. This was a
   deliberate design choice from the original Stage 2 build (see the "Multiplayer Stage 2" section
   in `HANDOFF.md` — phones showed *only* answer buttons, no prompt, so a player had to look at the
   shared screen to know what was being asked). Reversed on explicit request; `app/room/[code].tsx`
   (the shared/host screen) is otherwise unchanged — it still shows no options.
2. **Removed the standalone per-question `'leaderboard'` phase.** The old loop was
   `question → reveal → (host taps "Show Leaderboard") → leaderboard → (host taps "Next
   Question") → question…`, showing full standings after *every* question. Per the user's explicit
   spec ("reveal answer, count 5 seconds, then show next question"), `reveal` now auto-advances on
   its own after `REVEAL_DURATION_MS` (5s, in `roomService.ts`) straight to the next question, or to
   `'ended'` on the last one — no host tap, no per-question standings screen. The full leaderboard
   still shows exactly once, on the final `'ended'` results screen (unchanged).

**Implementation notes for future reference:**
- `RoomPhase` is now `'lobby' | 'question' | 'reveal' | 'ended'` — `'leaderboard'` removed from
  both the TS type and the `challenge_rooms` DB check constraint. Since `ADD CONSTRAINT` validates
  *existing* rows, `schema.sql` first does `update challenge_rooms set phase = 'ended' where phase
  = 'leaderboard'` so a room already mid-leaderboard from before this change doesn't break the
  constraint add.
- `getPhaseDurationMs(room)` (`roomService.ts`) is the one place that knows "'question' is timed by
  `room.question_duration_ms`, 'reveal' is timed by `REVEAL_DURATION_MS`, everything else isn't" —
  both room screens' countdown/auto-advance logic read through it instead of each re-deriving which
  duration applies to which phase.
- The host's auto-advance effect (`app/room/[code].tsx`) now drives *two* transitions off one timer
  (question→reveal, reveal→next-question-or-ended) instead of one, keyed by
  `room.id:phase:questionIndex:phase_started_at` so it can't double-fire either transition.
- Also fixed while touching this: the auto-advance path previously called `advancePhase` directly
  and silently dropped a failure (the same silent-failure shape as the START-button bug above, just
  never applied to the *automatic* transitions). It now surfaces the same inline error the manual
  buttons do, and clears its own dedupe key on failure so the next tick retries instead of getting
  permanently stuck.

**How to avoid regressing this:** if a "host acts, room advances" path is added anywhere else in
this room flow, route it through error-visible state (like `runAdvance`/the auto-advance effect's
own `.then` branch here) rather than a bare `void advancePhase(...)` — a swallowed failure there
reads to the user as the room being stuck, not as an error.
