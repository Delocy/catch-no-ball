# Slice 2 review: Honest when unsure (two readings)

Reviewer: fresh eyes, read-only. Base: reviewed slice 1. Diff: `.superpowers/main-flow/slice-2.diff` (commits 6e1b184, 63b8ae0, 2d315be).

## Verdict

**Approve with one Important fix.** The two-pass flow matches the spec exactly (one retry, context last 1 then last 3, exactly 2 readings required on pass 2, any pass-2 failure becomes `meaning_unavailable`, plain English never triggers a retry and still goes through `enforceVerbatim`). The unsure card is escaped correctly and never shows one guess. One contract value is wrong (`passes` after a failed retry), plus 7 Minor findings.

## Strengths

- `interpret` is small and readable: `callOpenCode` does one call, `interpret` (src/interpret.js:302-309) holds the two-pass policy in 6 lines. The retry is structurally capped at one: there is no loop.
- Pass 2 goes through the same `parseInterpretation` + `enforceVerbatim` path as pass 1, so the M2 guard (plain English never reworded) also covers the retry.
- The retry trigger is `s.hasSinglish && !s.confident` (src/interpret.js:306); plain sentences are normalised to `confident: true` by `plainSentence` anyway (src/interpret.js:17-19), so plain English cannot cause a retry even if the model marks it unsure. Tested (test/interpret.test.js "does not retry when an unsure sentence is plain English").
- Defence in depth on the client: an unsure sentence without exactly 2 readings becomes the `unavailable` card, never a single guess (src/client/cards.js:165-174). This also closes slice-1 reviewer Minor 8.
- The unsure card escapes everything: `said` via `markTerms`, reading meaning/tone via `escapeHtml`, tone class via `toneClass` whitelist (src/client/cards.js:190-203). Tested with `<b>` in a reading.
- Context handling is correct by construction: the queue calls `send` lazily and `onResult` of item n runs before `send` of item n+1 (src/client/queue.js:1-2), so `api.sendText({ ..., context })` in app.js:125 always sees the latest context. `nextContext` is pure and does not mutate.
- app.js stays DOM glue: the only new logic is a one-line call to the tested `nextContext`.
- Tests were written first (RED commit 6e1b184) and match the spec's named tests one for one.

## Spec compliance checklist

| Requirement | Status | Where |
|---|---|---|
| Pass 1 uses `context.slice(-1)`, `requireReadings: false` | OK | src/interpret.js:305 |
| Retry only if a Singlish sentence is unsure | OK | src/interpret.js:306 |
| Exactly one retry, `context.slice(-3)`, `retry: true`, `requireReadings: true`, `passes: 2` | OK | src/interpret.js:307-308 |
| Retry failure (HTTP, timeout, parse, not 2 readings) throws `InterpretError` → `meaning_unavailable` | OK, except "exactly 2" (Minor 1) and `passes` (Important 1) | src/interpret.js:46-48, src/pipeline.js:34-36 |
| Retry wording exact | OK | src/prompt.js:326 |
| `nextContext(prev, sentences, keep = 3)` incl. plain | OK | src/client/session.js:3-6 |
| `CardModel` `unsure` shape | OK | src/client/cards.js:171 |
| `COPY.couldMean` / `COPY.or` used | OK | src/client/cards.js:197-199 |
| `CONTEXT_KEEP` constant in `src/client/session.js` | Missing (Minor 4) | src/client/session.js:3 |
| At most 2 OpenCode Go calls per line | OK | src/interpret.js:302-309 |

## Findings

### Critical

None.

### Important

**I1. `passes` is wrong after a failed retry.** src/pipeline.js:36 always returns `passes: 1` for `meaning_unavailable`. When pass 1 was unsure and pass 2 failed, two OpenCode Go calls were made. The `ChunkResult` contract says `passes` is "OpenCode Go calls made for this result", and the slice-6 evals and the Q3 usage check rely on it; as is, every failed retry is invisible (it looks like a first-pass failure). Also, a pass-1 failure from a missing key makes 0 calls but reports 1.
*Fix:* give `InterpretError` an optional `passes` (`new InterpretError(msg, { passes })`). In `interpret`, wrap the second `callOpenCode` in try/catch and rethrow with `passes: 2` (pass-1 failures carry `passes: 1`; the missing-key error `passes: 0`). In `handleText`, use `e.passes ?? 1`. Tests: `interpret` "a failed retry throws with passes 2"; pipeline "a failed retry becomes meaning_unavailable with passes 2". The current pipeline test "a failed retry becomes meaning_unavailable" (test/pipeline-text.test.js:474) only re-checks slice-1 behaviour (any throw → unavailable), so it would then test something real.

### Minor

**M1. "Exactly 2 readings" is really "at least 2".** src/interpret.js:33 slices readings to 2 *before* the check at :46, so a pass-2 reply with 3 readings is accepted and silently truncated. The spec says "still not exactly 2 readings → throw". Either check `rawReadings.length` in the `requireReadings` branch, or keep the truncation and write it down as a deliberate choice (I would keep truncation: a third reading is not a confident wrong guess, and failing the whole clip for it is worse UX). Add a test either way.

**M2. Multi-sentence retry can drop a plain sentence that pass 1 kept.** Pass 2 re-interprets the whole transcript and replaces pass 1 wholesale (src/interpret.js:307-308). If pass 2 rewrites a plain sentence's `said`, `enforceVerbatim` drops it (src/interpret.js:115-116), even though pass 1 had it verbatim. Never reworded (M2 holds), but the line vanishes from the card. Same for a Singlish sentence whose `said` is rewritten on pass 2: it is kept with the model's wording (slice-1 behaviour, src/interpret.js:115). Not a spec breach; the retry doubles the exposure. No cheap safe merge exists (sentence alignment can change), so: add a test that documents it (mixed clip, sentence 2 unsure, pass 2 rewrites the plain sentence 1 → dropped), and leave the behaviour.

**M3. Retry edge cases untested.** Missing: retry timeout (only 500 and bad readings are tested), retry reply that is not JSON, a multi-sentence clip where only one sentence is unsure (assert exactly 2 calls and the plain sentence survives verbatim), pass 1 unsure with 0 readings still retries (the `unsure()` fixture always has 2 readings, so pass-1 leniency is not exercised), and that call 1's system prompt does *not* contain "Reconsider" (only the `buildMessages` unit test checks this, not `interpret`). Each is a few lines with the existing `fakeFetch`.

**M4. `CONTEXT_KEEP` is duplicated as a bare literal.** The spec puts `CONTEXT_KEEP = 3` in src/client/session.js; it is `keep = 3` (src/client/session.js:3) while `src/prompt.js:3` also defines `CONTEXT_KEEP = 3`. The engineer is right that the browser cannot import prompt.js. *Fix:* `export const CONTEXT_KEEP = 3` in session.js, use it as the default, and add a test asserting it equals prompt.js's `CONTEXT_KEEP` so the two cannot drift.

**M5. A failed line never enters context.** app.js:129 updates context only on `ok`. After `meaning_unavailable` the transcript is known (it is in the result) but is not added, so the next line loses it as context. Matches the spec's wording ("appends each sentence's said"), so optional: `nextContext(context, [{ said: result.transcript }])` for `meaning_unavailable` would be a one-liner in app.js, but that adds a decision to DOM glue; better as `contextAfter(prev, result)` in session.js with a test.

**M6. A tapped retry is sent with newer context.** The retried item goes to the end of the queue and reads `context` at send time (app.js:125), so it sees lines typed after it, and its result is then appended to context out of order. Harmless in practice for typed text; note for slice 3 (clips).

**M7. Per-sentence `unavailable` fallback has a dead retry button.** In a multi-sentence result, the fallback card for sentence i>0 gets id `card-n-i` (src/client/cards.js:119) and its button looks up `texts.get("card-n-i")` (app.js:59), which does not exist, so tapping does nothing; for i = 0, retrying resubmits the whole text but leaves siblings in place. Unreachable today (the server always sends 2 readings after pass 2), so only a note; if it matters, give the fallback a non-retry kind (for example render the said text without a button).

## Engineer's concerns

**"can meh" gives two readings with the same tone (doubtful).** Recommend a prompt-only fix in the base rules, not the retry line (so the spec's exact retry wording stays): change the last rule in src/prompt.js:18 to "...give exactly 2 plausible readings that differ from each other, each with its own meaning and tone; use two different tones when the tones could differ." Do **not** enforce different tones in code: two readings with the same tone and different meanings are still honest, and rejecting them would turn a valid answer into `meaning_unavailable`, which is worse for the user. A cheap code guard that *is* worth adding: reject (throw on pass 2) two readings that are exact duplicates (same tone and same meaning after trim/lower-case); that is "not two readings". Add a prompt test for the new wording. Check the effect on `can meh` by hand before keeping it.

**"can lor" stays unsure after the retry.** Leave the code alone. The result (reluctant or casual, two readings) is exactly what the anti-goal asks for: never one confident wrong tone, and the reluctant reading is shown. Note that in the demo script the retry cannot help: with only one earlier sentence, pass 1 (`slice(-1)`) and pass 2 (`slice(-3)`) send the same context, so pass 2 differs only by the reconsider line. Do not add a "lor after a request means reluctant" hint to the prompt to pass the demo; that is tuning to the test. Tune it with the R1 result and the slice-6 evals instead, and tell the user that demo step 2 is model-dependent.

## Commands run

| Command | Result |
|---|---|
| `npm test` | exit 0; 133 tests, 129 pass, 0 fail, 4 todo |
| `npm run coverage` | exit 0; all files 99.62% lines, 98.67% branches, 98.28% funcs; interpret.js uncovered 70-71 (invalid-JSON catch), cards.js 97.92% branches |

No network calls, no wrangler, `.dev.vars` not read, no git state changed. The engineer's test and coverage numbers are confirmed; the smoke-test claims (live model replies) were not re-run.
