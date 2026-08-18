# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Battle4GMP — Claude Code Context

Battle4GMP is a single Expo/React Native (expo-router) mobile game that quizzes players on GMP
(Good Manufacturing Practice) topics across three levels, backed by Supabase (players/scores/
leaderboard) and DeepSeek (question generation, cached into Supabase as a fallback). It's a
student prototype, not production infra — see the note in `.env.example` about the anon key
shipping in the client bundle.

## Workflow Rules (always follow, every session)

1. **Bugs: investigate before fixing.** When told about a bug, do not rush to patch it. First investigate and find the actual root cause, then propose the fix. The fix must be the correct, permanent fix — not a workaround or a fix that only masks the symptom.
2. **New features: plan before editing.** When asked for a new feature, do not jump straight into code. First lay out the plan — approach, files/areas touched, tradeoffs — and get alignment before making changes.
3. **Verify after every fix.** After applying any fix, confirm it works and that nothing else broke. Run `npx tsc --noEmit` and `npm test`; for UI-touching changes, reason carefully through the code rather than launching Expo yourself (see rule 5 — the user checks those hands-on). If you add non-trivial logic, set up Jest and add real tests for it rather than relying on manual checks going forward.
4. **All logic/functionality needs tests once a test runner exists.** Business logic (scoring, level progression, question caching/fallback, leaderboard queries) should get unit tests as part of the same change that introduces it — not a follow-up. Cover edge cases, not just the happy path — invalid/missing input, boundary values, empty/zero states, offline/API-failure fallback, out-of-order writes. If no test runner is configured yet when you hit this, add Jest first (`npm test` should run it) rather than skipping coverage.
5. **Don't hands-on verify UI changes yourself.** The user checks `app/` and `src/components/` changes themselves in Expo Go / the web target — don't spend time launching dev servers or driving a headless browser for this. Type-check (`npx tsc --noEmit`) and reason carefully about golden path and edge cases (empty states, long/overflowing content, error states, offline) in the code itself, then hand it off.
6. **Log every bug in `ISSUES_AND_SOLUTIONS.md`** (repo root). This file doesn't exist yet — create it the first time you log a bug. When a bug is found, add an entry; when it's fixed, record the fix in that same entry. Before fixing a new bug, check this file (if it exists) so a previously-fixed bug doesn't get silently reintroduced.
7. **Update `HANDOFF.md` every 10-15 messages, and remind the user to start a new chat.** Proactively keep it current so a new chat can pick up the work without re-deriving context or hallucinating state — don't wait to be asked. Once it's updated, tell the user it's a good point to start a fresh chat so the next session isn't dragging a bloated context window. Create the file the first time it's needed.
8. **Hard-to-pin-down bugs: add logging to trace the real execution path before guessing at a fix.** When a bug's root cause isn't obvious from reading the code alone (e.g. something that appears to hang, fails silently, or only reproduces intermittently — including DeepSeek API timeouts/fallback and Supabase sync issues), add temporary diagnostic logging at the suspected points of failure and have the user reproduce it, rather than proposing fixes on speculation. Use what comes back to narrow down the actual cause before changing behavior. Keep the logging afterward if it has ongoing diagnostic value (e.g. a previously-silent failure path); strip it out if it was purely one-off scaffolding.

## UX Rules (applies to all UI: `app/`, `src/components/`)

**UI is what the app looks like; UX is how it behaves.** Good UI (colors, buttons, layout) attracts people; good UX keeps them. A beautiful app that's hard to use still loses users — friction causes people to leave, while predictable, graceful behavior builds trust in the product.

- **Every action must have a visible, predictable result.** A button that does nothing visible when clicked makes users retry, get confused, blame themselves, and leave. If something fails, the user finds out gracefully — never silently.
- **Never build only the happy path.** AI tools default to building what the screen looks like when everything goes perfectly. The builder knows the app inside-out and unconsciously uses it "correctly" — real users won't. Deliberately build for the user who takes the wrong path: the loading state, the empty state, the error state.
- **Users should be able to figure out what to do without instructions.** If a flow needs explaining, the flow is the problem.

### Loading states

**Every screen has four states, and all four must be designed and built: Loading, Success, Error, and Empty.** Don't ship a screen that only handles the success case — users hit the other three constantly, and a missing state reads as a broken app. This matters especially here: question generation calls DeepSeek over the network and score/leaderboard reads/writes hit Supabase — both can be slow or fail.

A good loader is invisible in the sense that users don't consciously notice it — but when it's *missing*, they notice immediately and assume something is broken. (Skeleton screens work because the brain starts processing the layout before the data arrives.)

Match the loading feedback to how long the wait actually is:

| Expected wait | What to show |
|---|---|
| < 1 second | Nothing — just show the result. A spinner that flashes for a split second makes the app feel *slower* and glitchy. |
| 1–5 seconds | A plain spinner (no text) is fine. |
| 5–10 seconds | Spinner + text. Static text ("Loading…", "Generating questions…") buys a little patience; **changing** text ("Contacting DeepSeek…" → "Almost ready…") buys significantly more, because it feels like progress is happening. |
| > 10 seconds | Looped animations stop working and start actively frustrating users — switch to a progress bar, step-by-step indicator, or similar determinate feedback. |

- Never show a blank screen with no feedback — users abandon within 2–3 seconds.
- On failure, surface the error immediately. Never leave the user staring at a spinner only to then say "sorry, that didn't work." If DeepSeek is unreachable, fall back to `cached_questions` transparently where possible — but if even that fails, say so.

Pick the loading pattern by what kind of thing is loading:

| Pattern | When to use it |
|---|---|
| Skeleton screen | A whole screen or large section is loading (scoreboard, leaderboard list). Shows the layout first — "the structure is here, the data is coming" — then content fills in. |
| Progress bar | The duration/progress is knowable (e.g. multi-question generation). Users need to see how far along they are; a spinner reads as "stuck". |
| Inline spinner | Small, contained actions — a button just tapped, one card refreshing. A local "we're working on it", not a whole-screen takeover. |
| Optimistic UI | Low-risk, likely-to-succeed actions (answer selection feedback, local score increment): apply the change in the UI immediately, sync with Supabase in the background, and roll back with a notice if it fails. Feels instant. |

### Graceful degradation (sections load and fail independently)

A screen looks like one thing, but its sections usually come from different sources loading at different speeds (player/score state from AsyncStorage, questions from DeepSeek or cache, leaderboard from Supabase). Like ordering delivery from three restaurants: if one order is late or missing, you don't throw away the food that arrived — you eat what showed up. **The app keeps working with whatever it has.**

- **Show what's ready as it becomes ready.** Don't gate a whole screen behind one loading state that waits for everything — e.g. render the level UI while questions are still generating if some are already available.
- **Each section owns its own data, its own loading state, and its own errors.** If the leaderboard fetch fails, it shows its *own* error and retry, not a full-screen crash — the rest of the app (gameplay) must stay usable.
- **Serve cached/stale content while fresh content loads in the background.** `cached_questions` exists exactly for this — prefer showing a recent cached set instantly over blocking on a live DeepSeek call, then it's fine if the app doesn't even bother swapping in a fresher set mid-play.
- **Plan for partial failure from the start**: decide up front what a level looks like when DeepSeek is down but Supabase is up (or vice versa), and make that state feel intentional, not broken.

### Success states

When an action completes — submitting an answer, finishing a level, saving a score — the user must *know* it worked. That uncertainty (did my score save? should I retry?) is the worst feeling for a user, and even a small success confirmation completely changes how they feel.

- **Scale the confirmation to the significance of the action.** Big moments (finishing all three levels, hitting the grand reward screen) can earn a full celebratory treatment — but don't overdo it or it loses meaning.
- **Most confirmations should be small, intuitive signals** — a quiet "yep, that worked" (a correct-answer flash, a score tick up). Often the cleanest confirmation is the visible result of the action itself.
- Pick by weight: score/leaderboard submission (ambiguous, matters to the user) needs an explicit confirmation; per-question feedback needs only the state change itself to be visible.

### Error states

A good error message does three things: **what happened, why it happened, and what to do next.** Instead of "Something went wrong" when a score fails to save, say: "Your score didn't save — we couldn't reach the server. It's saved on this device; we'll retry automatically" (or give an explicit retry button). The user knows exactly what happened, why, and what's next.

- **Never dump raw Supabase/DeepSeek errors on screen.** A player can't parse a Postgres or HTTP error, and exposing backend internals is unnecessary exposure. Log the technical detail (console/dev tools), show the user a human message.
- **But don't over-correct to a bare "Something went wrong" either.** It's especially bad when the outcome is ambiguous — after a score submit, the user must be told whether it went through or not.
- **The worst error is a silent failure** — the user taps submit, nothing visibly changes, and they can't tell if it worked or broke. Every failure path must produce visible feedback.

**Error placement — choose by severity and proximity.** General rule: the closer the error appears to the thing that went wrong, the better.

| Placement | When to use it |
|---|---|
| Inline (right next to the source) | The default — use most often. Action failures: right next to the button just tapped (e.g. "Retry" appears beside a failed submit — the user's eyes are already there). |
| Toast (pops and auto-dismisses) | Only for messages the user can safely miss. Litmus test: if they look away and miss it, are they still okay? Good for transient/self-resolving info like "Reconnecting…". Never use a toast for a score-loss or level-blocking error. |
| Modal (takes over the screen, blocks until addressed) | Sparingly — only when the user cannot continue without addressing the issue (no questions available at all, no cache and no network). If you block the user, you MUST give a way forward (a "Retry" action), never a dead-end message. |

### Empty states

Empty states aren't glamorous to build, but they're often the **first thing a new player sees** — a fresh device has no scores anywhere. A good empty state does three things: **tells the user why it's empty, shows them what to do next, and doesn't feel broken.**

- **Never leave a blank screen or a bare "no scores" message.** An empty leaderboard or scoreboard with no context strands the user — pair it with what to do next: "No scores yet — play a level to get on the board" + a way to start.
- **Every section of the app that doesn't have content yet** needs this treatment.
- **When empty is the goal, celebrate it** where relevant (e.g. completing all levels with a perfect score) — a pleasant moment, not the same void as "no data yet".

### Forms

There's minimal form input in this app (mostly tap-to-answer), but wherever text input does appear (e.g. a display name):

1. **Disable submit until valid input is present** — make it obvious why (e.g. a visible character limit or required marker), not just a grayed-out button with no explanation.
2. **Validate inline, on blur/as they type**, not only after submit.
3. **Show a live character count** on any field with a length limit.
4. **Prefill what you already know** (e.g. a previously used device display name from AsyncStorage) rather than making the player retype it.

## Dev Commands

Battle4GMP is a single Expo app at the repo root (no subdirectories to `cd` into):

```
npm start          # expo start
npm run android     # expo start --android
npm run ios         # expo start --ios
npm run web         # expo start --web
npx tsc --noEmit    # type check (no dedicated script yet — tsconfig.json is present)
```

There is no `test` script yet. Add Jest (`npm i -D jest ...` + a `test` script) when introducing the
first real unit tests, per Workflow Rule 3/4.

### Backend

- Supabase schema: `supabase/schema.sql` (players, scores, cached_questions, leaderboard view + RLS policies) — this is the source of truth for the DB shape. Apply changes via the Supabase SQL editor or `supabase db push`.
- Supabase client: `src/lib/supabase.ts`.
- Generated/hand-written DB types: `src/types/database.ts`. There's no `gen-types` script configured — if types drift from `schema.sql`, either update `database.ts` by hand or wire up `supabase gen types typescript` as a script.
- Env vars: copy `.env.example` to `.env`. All client-read vars must be prefixed `EXPO_PUBLIC_` (Expo inlines these at build time) — see the security note in `.env.example` about the anon key and DeepSeek key both shipping inside the app bundle.

## Reference Docs (repo root)
- `ISSUES_AND_SOLUTIONS.md` — bug/fix/security/scalability log (see Workflow Rule 6 above). Not created yet; create on first use.
- `HANDOFF.md` — session handoff notes (see Workflow Rule 7 above). Not created yet; create on first use.
- `AGENTS.md` (this file) — also carries the Expo version warning at the top; re-check the versioned docs link before writing Expo/expo-router code, since APIs have changed across versions.
