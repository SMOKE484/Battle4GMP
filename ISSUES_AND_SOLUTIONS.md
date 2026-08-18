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
