# Slice 3 review: Listen, and MERaLiON transcribes

Reviewer: fresh eyes. Branch `a/slice-3-listen` (HEAD `4c75e4a`), diff `.superpowers/main-flow/slice-3.diff` against slices 1-2. Inputs: IMPL.md slice 3 + section 1, PRD US-3/4/7/8, anti-goals, B6, `meralion-step0.md`, `reports/slice-3-engineer.md` (treated as unverified). No network calls, `.dev.vars` not read, dev server untouched.

## Verdict

**Changes requested (3 Important, 0 Critical).** The slice is close: the MERaLiON request matches step 0 exactly, the guard logic is right as pure functions, the cache spends nothing on a hit, privacy holds, the client audio path is correct, and the tests are real. But the guard Durable Object has a lost-update race, the Worker trusts the WAV header for duration while sending all the bytes to MERaLiON, and the M6 context change makes back-to-back lines lose their previous line (engineer's concern 1 is a real bug).

## Strengths

- `src/meralion.js:19-43`: exactly the step 0 shape (JSON `audio_url` data URI, `x-api-key`, no `authorization`, no model id, `choices[0].message.content` trimmed, `usage.total_tokens`), 20 s timeout, error bodies never parsed or echoed; the key never appears in a message or log (`test/meralion.test.js:90`).
- `src/guard.js:11-49`: `decide` / `recordTokens` / `budgetStatus` are pure, month reset is by UTC `YYYY-MM`, the window drops entries at or before `now − 60000`, a refusal returns the unchanged state, counting happens before the call. Tests pin each boundary (3585+15 allowed, 3590+15 refused, 999/1000, 100000 tokens, Nov 30 → Dec 1).
- `src/guard.js:94-105`: `reserveMeralion` fails closed (no binding, throw, odd reply → `{allow:false, reason:"guard"}`).
- `src/hear.js:40-63`: cache lookup first and returns before `reserve` or `fetch` (a hit spends nothing); only `{ transcript }` is stored, TTL 604800; KV failures never fail the request.
- `src/pipeline.js:59-95`: format checks, 413, the 0.5 s `silent` short-circuit and the empty-transcript → `uncaught` rule all happen before MERaLiON/interpret as specified.
- Client: `encodeWav` header is correct (RIFF size 36+n, fmt 16, PCM 1, mono, 16000, byteRate 32000, blockAlign 2, 16 bits); the worklet posts a copy; the clipper splits frames across the boundary and hands out a fresh buffer; `clipToSend` keeps silence and <0.5 s on the phone; AudioContext is created and resumed inside the tap; Stop flushes, stops tracks, closes the context, releases the wake lock and hides the banner; mic errors map to the right copy.
- Transcripts reach the DOM only through `escapeHtml` / `markTerms` (`src/client/cards.js:5-37, 62-117`).
- wrangler.toml binding + migration + `export { MeralionGuard }` together (pitfall 1); KV placeholder; no `[ai]`.

## Findings

### Important

**I1. The guard Durable Object can lose updates, so the 5-a-minute and monthly limits can be exceeded under concurrency.**
`src/guard.js:59-80`: `fetch` does `await this.ctx.storage.get("state")` and only then `await request.json()`, then `decide` and `put`. Input gates only hold new events while a *storage* operation is in flight; the `request.json()` await reads the request body (I/O), so a second `/reserve` can be delivered in between, read the same old state, and both `put` a state with one extra request. Reproduced against the same Map-backed fake the tests use: 8 concurrent `/reserve` calls → **8 of 8 allowed, stored `requests: 1`** (scratch script `race.mjs`). The rate check is the only protection of the account-wide quota for an unauthenticated endpoint (IR-13), so this matters.
Fix: parse the body *before* `storage.get` (then get → decide → put has no non-storage await in between and is atomic under the input/output gates), or wrap the read-modify-write in `this.ctx.blockConcurrencyWhile`. Apply the same order to `/tokens`. Add a test that fires 6+ concurrent `/reserve` fetches and expects exactly 5 allowed and `requests: 5`.

**I2. Duration and size come from the WAV header, but every uploaded byte goes to MERaLiON: the 30 s cap and the audio-seconds budget can be bypassed, and there is no body limit.**
- `src/audio.js:35-36`: `seconds = dataSize / byteRate` uses the header's `byteRate` without checking it equals `sampleRate × channels × bits/8`. A 10 s clip with `byteRate` ×20 reads as 0.5 s (reproduced); 10 minutes of audio can be declared as 30 s.
- `src/audio.js:28-30`: `dataSize = min(header size, remaining)`, but bytes *after* the data chunk are ignored for duration and still sent: a header saying 1 s followed by 60 s of samples reads as 1 s (reproduced, 1.92 MB body).
- `src/hear.js:48-54`: `reserve` is charged `wavInfo(bytes).seconds`, while `callMeralionTranscribe(bytes)` sends the whole buffer.
- `src/pipeline.js:62-68`: `formData()` and `arrayBuffer()` run on any size of body (up to the platform's 100 MB), then base64 in a 10 ms CPU budget.
Fix: in `wavInfo` (or `handleChunk`) reject unless `byteRate === sampleRate*channels*bitsPerSample/8` and `blockAlign === channels*bitsPerSample/8`, and the data chunk ends at (or within a few bytes of) the end of the file; or derive seconds from `bytes.length − dataOffset` and send only `header + data`. Reject `content-length` above ~1.1 MB (30 s × 32000 B/s + slack) before `formData()`, and re-check `bytes.length` after. Tests: lying `byteRate` → 400; trailing samples → 400 (or counted); oversize body → 413.

**I3. Engineer concern 1 is a real bug: a line created while the previous one is in flight never sees that line.**
`src/client/app.js:66, 82, 99` copy the live `context` when the item is created (`withContext`), as IMPL's M6 says, but the queue is serial (`src/client/queue.js:1-2`) and `context` is only updated in `onResult` (`app.js:48`). With 15 s clips and the 6–32 s replies measured in the engineer report, clip n+1 is usually created before clip n's result arrives, so it carries context without clip n. Worse, pass 1 sends only `context.slice(-1)` (`src/interpret.js:160`), so the tone of "can lor" is judged against the line *before* the previous one: exactly demo step 3's case. Slice 2 did not have this (it read context at send time). The plan's M6 wording over-reached: only retries needed a frozen context.
Fix (keeps M6's tests green): first tries take the context at send time, retries keep their original. E.g. push items without context, and in `send` use `item.retry ? item.context : [...context]`, storing that snapshot on the item (`item.context = …`) so a later retry re-sends it. Since `onResult(n)` runs before `send(n+1)`, every first try sees all earlier lines. Update IMPL's M6 sentence to "copied when first sent". Add a queue/app-level test: push A and B while A is in flight; B's send sees A's line.

### Minor

- **m1. (engineer concern 2)** `src/client/session.js:14`: `retry: true` skips the append even when the first try produced no transcript (network/5xx error), so a line that only succeeded on retry never enters context. Fix: on retry, append when the *first* try had no transcript (e.g. flag `item.inContext` set when the first result was `meaning_unavailable`).
- **m2.** `src/client/cards.js:125-131` + `api.js:20`: a 400 `bad_audio` / 413 `too_long` on a clip becomes "Meaning unavailable, tap to retry", which can never succeed. Show `uncaught` (type instead) for a clip's 4xx.
- **m3.** `src/pages/app.html:18-19` hard-codes "Translating" and the tell-the-table line instead of rendering `COPY.translating` / `COPY.tellTable`: two sources of the same copy. Either set the text from `COPY` in `app.js` or have a test pin the HTML against `COPY`.
- **m4.** `src/hear.js:45-61`: two identical clips in flight at once both miss the cache and both call MERaLiON. Negligible for the phone (serial queue); worth knowing for eval re-runs in parallel.
- **m5.** `src/client/wav.js:20-27`: 44.1 kHz → 16 kHz linear interpolation has no low-pass, so content above 8 kHz aliases. Acceptable for ASR; a 3-tap average before interpolation would be cheap.
- **m6.** `src/client/app.js:112`: `noiseSuppression: true` can attenuate other people's voices across a meeting table (the browser tunes it for the near talker). Worth A/B-ing in the demo; not in the spec either way.
- **m7.** Plan inconsistency: IMPL section 1 ("Cache on") says a cache hit serves "transcript and reading", but slice 3's `hearClip` spec (and the code) caches the transcript only, so a cached repeat still pays OpenCode Go (16.8 s in the smoke check). Pick one in IMPL.
- **m8.** `evals/fetch-clips.js` is at 34.88% lines, under the 60% per-file flag (Person B's file; totals pass).
- **m9.** `src/client/app.js:152-153`: `onmessage = null` before `flush()` drops the few worklet frames still queued in the port at Stop (a few ms). Harmless; flush after a microtask if it ever matters.

## Concerns 1–3: recommendations

1. **Concern 1: real bug (I3).** Resolve context at send time for first tries; freeze it only for retries.
2. **Concern 2 (MERaLiON `Can (loh)`): normalise, don't strip.** Add a pure `cleanTranscript(text)` in `src/meralion.js`, applied in `callMeralionTranscribe` before returning (so the cache, `interpret`, `enforceVerbatim` and the card all see the same string): replace a parenthesised single short word (`/\s*\(([A-Za-z]{1,6})\)/g` → ` $1`, then collapse spaces) — "Can (loh) I do it tomorrow?" → "Can loh I do it tomorrow?". Keeping the particle matters (it carries the tone); the brackets carry nothing. Optionally restrict to a particle list (lah, leh, lor, loh, meh, mah, hor, sia, ah, liao) to avoid touching real parentheses. Unit-test it with the smoke-check string. Do not rely on the prompt to drop brackets: `said` must be a verbatim span of the transcript, so the transcript itself has to be clean.
3. **Concern 3 (6–32 s, mostly OpenCode Go).** It matters more than it looks: the queue is serial, so once replies exceed 15 s the backlog grows every clip and M3 (card within 15 s of clip end) fails. Cheap, spec-compatible steps, in order:
   - Measure first on `/api/text` (no MERaLiON spend): log OpenCode's `usage` (completion and any reasoning tokens) and wall time. If `deepseek-v4.1-flash` is emitting reasoning, turn it off if the endpoint allows, and set a `max_tokens` cap (the JSON for 1–2 sentences fits in ~400).
   - Cache the interpretation in KV next to the transcript, keyed by `sha256(transcript + context[-1])` (pass 1 only sees `context[-1]`), so cached repeats and eval re-runs are instant; this is what IMPL section 1 already promises (m7).
   - Keep sends serial (parallel sends would break context, I3); pass 2 (the 32 s case) is a spec requirement and stays.

## Spec compliance summary

All interfaces in IMPL slice 3 exist with the specified names and behaviour. Deviations: `clipToSend` and `fixItem` (extra, tested, reasonable), `silent`/`uncaught` carry `source: "meralion"` (fine), guard `/reserve` 400 on bad seconds (fine). Missing: none functionally; the M6 wording itself causes I3. Acceptance criterion "no more than 5 in any 60 s" is not guaranteed under concurrency (I1); "rejects anything that is not 16 kHz mono PCM16 WAV of at most 30 s" is not guaranteed against a crafted header (I2). Hand-only items (real mic, "Translating" visible exactly while tracks are live, R2 live/recap) were not verifiable here; the engineer also could not test a real mic.

## Commands run

| Command | Result |
|---|---|
| `npm test` | 275 tests, 271 pass, 0 fail, 4 todo (Person B's) |
| `npm run coverage` | all files 97.07% lines / 98.19% branches / 95.58% funcs (gate 81: passes). Per file: every `src/` file ≥ 96.8% lines; `evals/fetch-clips.js` 34.88% (m8). Exit code not captured separately (output was piped), but every total is far above the gate. |
| `node scratchpad/race.mjs` (scratch, imports `src/guard.js` and `src/audio.js`, no network) | 8 concurrent `/reserve` → 8 allowed, stored `requests: 1` (I1); `wavInfo` of a 10 s clip with byteRate ×20 → `seconds: 0.5`; header 1 s + 60 s of bytes → `seconds: 1` (I2) |

Tests are real: they use fakes for fetch/KV/DO, `test/meralion.test.js` makes `globalThis.fetch` throw, boundaries are asserted with exact values. Gaps: no concurrency test for the DO (I1), no crafted-header or oversize-body tests (I2), no test that a line pushed while another is in flight sees it (I3).
