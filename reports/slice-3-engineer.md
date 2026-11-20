# Slice 3 engineer report: Listen, and MERaLiON transcribes

Branch `a/slice-3-listen`, built test-first from IMPL.md revision 5. Step 0 was not re-run.

## What was built

Server
- `src/audio.js`: `wavInfo` (walks RIFF chunks, so LIST and other chunks such as the `FLLR` chunk that macOS `afconvert` writes are skipped), `sha256Hex`, `bytesToBase64` (32 KB `btoa` chunks), `MIN_CLIP_SECONDS` / `MAX_CLIP_SECONDS` / `REQUIRED_SAMPLE_RATE`.
- `src/meralion.js`: `callMeralionTranscribe` sends the step 0 shape exactly: `POST https://api.meralion.ai/v1/audio/transcriptions`, `content-type: application/json`, `x-api-key`, body `{"audio_url":"data:audio/wav;base64,…"}`, no `authorization` header and no model id. It reads `choices[0].message.content` (trimmed) and `usage.total_tokens`. A non-2xx, a network error, a timeout (20 s) or a 200 without a string transcript throws `MeralionError` with `status`. Error bodies are never parsed or echoed.
- `src/guard.js`: pure `decide` / `recordTokens` / `budgetStatus` (5 in any 60 s; per UTC month 3600 s, 1000 requests, 100,000 tokens; a refusal changes nothing), the `MeralionGuard` Durable Object as a plain class (`/reserve`, `/tokens`, `/status`), and `reserveMeralion` (no binding, a throw or an odd reply → `{ allow: false, reason: "guard" }`), `recordMeralionTokens` (best effort), `guardStatus`.
- `src/hear.js`: `hearClip`: KV `hear:<sha256>` → guard reserve with the clip's real seconds → MERaLiON → record tokens → cache non-empty text for 7 days. Only text is cached. A missing or failing KV is never an error.
- `src/pipeline.js`: `handleChunk` (400 `bad_audio` for missing, non-WAV, not 16 kHz / mono / 16-bit; 413 `too_long` over 30 s; under 0.5 s → `silent`; `hearClip` throws or empty transcript → `uncaught`; interpret throws → `meaning_unavailable` with the transcript) and `handleBudget`. `handleText` and `handleChunk` share one `explain` step. The `hint: null` field is gone from every result (revision 5).
- `src/index.js`: imports the 4 new client files and exports `MeralionGuard`; `wrangler.toml`: the `MERALION_GUARD` binding and `v1` `new_sqlite_classes` migration (same commit as the export), and `[[kv_namespaces]] binding = "CACHE"` with a placeholder id. No `[ai]`.

Client
- `src/client/wav.js` (`resampleTo16k`, `encodeWav`, `rms`, `isSilent`, plus `clipToSend`, below), `clipper.js` (`createClipper`, `CLIP_SECONDS = 15`), `mic.js` (`canRecord`, `micErrorKind`, `micErrorCopy`), `recorder-worklet.js` (`pcm-capture`, posts a copy of channel 0).
- `api.js`: `sendClip` (multipart `audio` as `audio/wav` `clip.wav`, `sessionId`, `context` JSON; no headers at all, so no key and no `x-asr`) and `budget()`.
- `session.js`: `contextAfter` (M5) and `withContext` (M6). `cards.js`: the `uncaught` card ("Couldn't catch that" + a text box) and `fixItem`; a clip's pending card and a clip's API-error card show no empty "said" line.
- `app.js` (glue): Listen/Stop, AudioContext created and resumed inside the tap before any await, worklet → clipper → `clipToSend` → queue; Stop flushes the partial clip, stops the tracks, closes the context, releases the wake lock and hides the banner. Retries re-push the original item with `retry: true`; a "Couldn't catch that" fix is pushed as a text item in place of that card. One `sessionId` per Listen.
- `app.html` / `app.css`: Listen button in the header, sticky "Translating" + "Let the table know you're using a translator" banner (hidden until the mic is live), the mic help line, and the uncaught card style.
- `CLAUDE.md`: the MERaLiON development practice. `.dev.vars.example` already listed `MERALION_API_KEY=`.

Files changed: 40 (2059 insertions, 48 deletions) across `src/`, `test/`, `wrangler.toml`, `CLAUDE.md`. Nothing in `public/`, `evals/` or `docs/presentation/`.

### Deviations and my calls
- `clipToSend(samples, inputRate)` in `wav.js` (not in the plan): the "send it only if ≥ 0.5 s and not silent" rule at Stop would otherwise be a decision in `app.js`. Tested.
- `fixItem(cardId, value)` in `cards.js` (not in the plan): the trim/empty rule for the uncaught card's text box, tested, so `app.js` stays glue.
- A `silent` or `uncaught` result from `/api/chunk` carries `source: "meralion"` (the only speech path in this slice).
- `MeralionGuard /reserve` answers 400 for a missing, negative or non-finite `seconds` (a bad request is never counted).
- The fix typed into a "Couldn't catch that" card is sent with the live context (it is a new line), not the failed clip's context.
- Recap mode (R2) is not built: there is no `reports/r2-*.md` yet, so the app runs live. If R2 says "only after", only `app.js` changes.

## Tests and coverage

```
npm test
# tests 275
# pass 271
# fail 0
# todo 4      (Person B's evals todos)

npm run coverage   (exit 0)
# file                  | line % | branch % | funcs %
#  audio.js             | 100.00 |   100.00 |  100.00
#  client/api.js        | 100.00 |   100.00 |  100.00
#  client/cards.js      | 100.00 |    98.36 |   94.74
#  client/clipper.js    | 100.00 |   100.00 |  100.00
#  client/mic.js        | 100.00 |   100.00 |  100.00
#  client/recorder-worklet.js | 100 | 100 | 100
#  client/session.js    | 100.00 |   100.00 |  100.00
#  client/wav.js        | 100.00 |    96.43 |  100.00
#  guard.js             | 100.00 |    96.72 |  100.00
#  hear.js              |  96.83 |    96.30 |  100.00
#  meralion.js          | 100.00 |   100.00 |  100.00
#  pipeline.js          | 100.00 |    98.18 |  100.00
#  evals/fetch-clips.js |  34.88 |    50.00 |    0.00   (Person B's file, see concerns)
# all files             |  97.07 |    98.19 |   95.58
```

## TDD evidence

RED (commit `83a6c99`, tests and fixtures only): 135 tests, 108 pass, **23 fail**, each for the right reason: the new test files could not import `src/audio.js`, `meralion.js`, `guard.js`, `hear.js`, `client/wav.js`, `clipper.js`, `mic.js`, `recorder-worklet.js`; `sendClip`/`budget`, `contextAfter`/`withContext`, the uncaught card, `handleChunk` did not exist; the config tests found no `MERALION_GUARD`, no `CACHE` and no `handleChunk` wiring; the hint tests failed because `handleText` still sent `hint: null`; the page tests found no Listen button or banner.

GREEN: after the server and client commits (`25e65c5`, `291ff80`), 273 tests, 0 fail (one test-helper bug fixed on the way: `chunk({ sessionId: undefined })` fell back to the default, so "missing" now uses `null`). `clipToSend` had its own cycle: RED `does not provide an export named 'MIN_SEND_SECONDS'`, then GREEN 13/13 in `test/wav.test.js` (`f69a036`).

## Live smoke check and MERaLiON spend

The dev server needed a restart (below). Clips are macOS `say` voices only, in `/private/tmp/claude-501/-Users-zares-DSTA-thinkertanker-catch-no-ball-catch-no-ball--claude-worktrees-catch-no-bal-project-ideas-0bea04/c9519746-0f9f-4263-b2a1-05fb212f576d/scratchpad/slice3-clips/`; raw replies are in its `responses/` folder (Person B can take 2–3 of them for `evals/fixtures/`).

Free checks (no MERaLiON call, budget stayed at 0):
| Clip | Reply |
|---|---|
| 0.4 s tone | 200 `{"status":"silent","source":"meralion","transcript":"","sentences":[],"passes":0,"cached":false}` |
| 31 s | 413 `{"error":"too_long"}` |
| stereo WAV | 400 `{"error":"bad_audio"}` |
| AIFF sent as audio/wav | 400 `{"error":"bad_audio"}` |

MERaLiON clips (`/api/chunk`, 4 requests):
| # | Clip | Result | Time |
|---|---|---|---|
| 1 | `r3-singlish.wav` ("Eh the deadline confirm cannot shift one lah") | `cached: false`, transcript `A. The deadline confirm cannot shift one leh.`; card said "The deadline confirm cannot shift one leh.", tone **firm**, passes 1 | 12.6 s |
| 2 | same clip again | **`cached: true`**, same transcript, no MERaLiON request (budget unchanged) | 16.8 s (OpenCode Go only) |
| 3 | `r3-plain.wav` | transcript `Let's move on to the next agenda item.`, plain (`hasSinglish: false`), passes 1 | 5.8 s |
| 4 | `r3-canlor.wav` ("Can lor, I do it tomorrow"), with 2 lines of context | transcript `Can (loh) I do it tomorrow?`; unsure, 2 readings (casual / **reluctant**), passes 2 | 32.4 s |

`GET /api/budget` after the smoke check:
```json
{"month":"2026-11","used":{"seconds":6.2055625,"requests":3,"tokens":1029},"limits":{"seconds":3600,"requests":1000,"tokens":100000},"recentRequests":2}
```
**Spend: 3 MERaLiON requests, 6.21 s of audio, 1,029 tokens** (343 per call, as step 0 said). Under the 4-request cap and the slice target (under 30 requests, under 2 minutes). The step 0 spend (8 requests, about 10 s) is separate; the local guard started at 0.

Browser (the preview pane, no real microphone): `/app` loads every client module with no console errors from the new code; Listen in the pane, where the mic is blocked, shows the `COPY.micBlocked` help and moves focus to the text box, and the button comes back (demo step 10).

## Dev server

Restarted. When `wrangler.toml` changed, wrangler did reload it and listed `MERALION_GUARD` and `CACHE`, but that rebuild ran before the new client files existed, failed with ENOENT, and did not recover when they appeared (requests hung). I stopped only that preview server ("catch-no-ball", port 8787) and started it again through the same preview launcher, so it is still on `localhost:8787` and still in the user's Browser pane.

## How to try it (desktop Chrome, `localhost:8787/app`)

1. Open `http://localhost:8787/app` and tap **Listen**. Chrome asks for the microphone; allow it. The button turns into **Stop** and a pinned bar shows **Translating** and "Let the table know you're using a translator".
2. Say "Eh the deadline confirm cannot shift one lah" and tap **Stop** straight away (the short clip is sent; that saves quota). A "Translating…" card appears, then the card: MERaLiON's words, the meaning and a tone from OpenCode Go. Expect particles to drift (step 0 and this smoke check both got "leh" for "lah").
3. Keep listening for more than 15 s: a clip is sent every 15 s while recording carries on; cards arrive in order. Silence is never sent.
4. Mumble or cover the mic: "Couldn't catch that" with a text box; type what you heard and press Send, and it becomes a normal card in its place.
5. Stop: the bar disappears and Chrome's mic indicator goes off.
6. Block the mic in site settings and tap Listen: the "microphone is blocked" help and the text box gets focus.
7. `curl -s localhost:8787/api/budget` shows requests, audio seconds and tokens used. Every real sentence costs one request (about 345 tokens); re-sending the same clip is free.
In dev tools → Network, each `/api/chunk` reply shows `source: "meralion"`, `transcript`, `cached` and the cards; nothing else from MERaLiON.

## M5 and M6 (from slice 2's review): fixed

- M5: `contextAfter` appends a `meaning_unavailable` line's transcript, so the next line sees it. `app.js` calls it after every result.
- M6: every queued item carries a copy of the context from when it was created (`withContext`); "tap to retry" re-pushes the original item with that context and `retry: true`, so its result is not appended to the context again. Tested in `session.test.js` and `queue.test.js`.

## Concerns

1. **Context is copied at creation (M6, as planned), not read at send time.** A line typed or clipped while the previous one is still in flight no longer sees that previous line (slice 2 did). With 15 s clips and 5–15 s replies this mostly does not matter, but quick typed lines lose context. A possible later change: copy at send time for first tries, keep the original only for retries.
2. **Retry after a network error never enters the context**: `retry: true` skips the append even when the first try failed before any transcript existed. Rare; left as the plan says.
3. **MERaLiON wraps particles**: "Can lor" came back as `Can (loh)`, and the card shows the brackets. Nothing depends on the spelling, but it looks odd; consider telling the prompt to drop brackets, or leave it as what MERaLiON heard.
4. **Speed**: replies took 6–32 s, almost all of it OpenCode Go (the cached repeat took 16.8 s with no MERaLiON call; the two-pass "can lor" took 32 s). MERaLiON itself was about 1 s in step 0.
5. **The worklet is kept running through a zero-gain node to the speakers**, so Chrome and Safari keep pulling frames. Not exercised with a real microphone (the preview pane blocks it); the mic path needs the user's hand check.
6. **`evals/fetch-clips.js` (Person B) is at 34.88% lines**, under the reviewer's 60% per-file flag. It is B's file, so I did not touch it; the totals still pass.
7. The guard counts the clip's real seconds; step 0's flat 330-token prompt suggests MERaLiON may count each call as 30 s. Compare `/api/budget` with MERaLiON's console at release, as section 1 says.

## Review fixes (reports/slice-3-reviewer.md)

All test-first: RED commit `27f876a` (230 tests, **14 failing**: the 4 forged-header `wavInfo` tests, the 2 guard concurrency tests, the clip-4xx card, the banner-copy test, the hear cleaning test, and the meralion, pipeline-chunk, pipeline-text, queue and session files that import the missing `cleanTranscript`, `MAX_CHUNK_BYTES`, `interpKey`/`INTERP_TTL_SECONDS`, `sendContext`/`enteredContext`), then GREEN `be58b36` (server) and `0dd4376` (client). `retryOf` had its own RED (`does not provide an export named 'retryOf'`) then GREEN.

| Finding | Fix |
|---|---|
| **I1** guard race | `MeralionGuard.fetch` parses the body before touching storage, and does get → decide → put inside `ctx.blockConcurrencyWhile` (same for `/tokens`). New tests with a locking fake: 8 concurrent reserves → exactly 5 allowed, stored `requests: 5`, `seconds: 75`; 6 concurrent `/tokens` all counted. |
| **I2** trusted header | `wavInfo` now requires `blockAlign === channels*bits/8` and `byteRate === sampleRate*blockAlign`, and the data chunk must run exactly to the end of the body (one pad byte allowed for an odd size): no trailing bytes, no short data. `/api/chunk` returns 413 `too_long` when `Content-Length` > `MAX_CHUNK_BYTES = 1,100,000` (before the body is read) or the audio file is bigger (real size). All before any MERaLiON call. Tests use forged headers (byteRate ×20, wrong blockAlign, 1 s header + 60 s of samples, 2 extra bytes, short data) and oversize bodies. Live: trailing bytes → 400 in 16 ms, 1.2 MB → 413 in 11 ms. The `afconvert` fixtures (with their FLLR chunk) still pass. |
| **I3** context | A first try now reads the context when it is **sent** (`sendContext` in `session.js`, stored on the item); only retries reuse it. Because the queue sends one at a time after the previous `onResult`, a clip created while the previous one is in flight sees that line. Tests wire the real queue + `contextAfter` + `sendContext`: A and B pushed together → B is sent with `["A"]`; a retry after later lines re-sends `[]`. `withContext` stays exported but `app.js` no longer uses it. IMPL's M6 sentence is the coordinator's to fix. |
| m1 | `retryOf(item, result, error)`: a retry always re-sends its first context (`retry: true`) and carries `inContext`, true only if its first try was `meaning_unavailable` with words (`enteredContext`). `contextAfter` skips the append only when `inContext`, so a line whose first try hit a network error enters the context when the retry succeeds. |
| m2 | `renderResult`: a clip whose request got a 4xx (`bad_audio`, `too_long`) shows "Couldn't catch that" + text box, not a retry that can never work. Network/5xx errors stay retryable. |
| m3 | `app.js` sets the banner text from `COPY.translating` / `COPY.tellTable`; a page test pins the HTML fallback to the same strings. |
| Concern 2 | `cleanTranscript` in `meralion.js`: a single bracketed word loses its brackets (`Can (loh) I do it tomorrow?` → `Can loh I do it tomorrow?`); real parentheses ("(the new guy)") are kept. Applied in `callMeralionTranscribe` (so the cache stores clean text) and on a cache hit (cleans entries stored before this fix). Live: the cached "can lor" clip now returns `Can loh I do it tomorrow?` with no MERaLiON call. |
| Concern 3 | See below. |

Deferred minors: **m4** (two identical clips in flight both miss the cache): the phone sends one at a time; only parallel eval runs could hit it, and B's runner is serial with a 13 s gap. **m5** (44.1 kHz aliasing): fine for ASR, desktop Chrome and iPhone run at 48 kHz (block average path). **m6** (`noiseSuppression`): needs a real meeting A/B, not a code change on guesswork. **m7** (IMPL "transcript and reading" wording): IMPL is the coordinator's; the code now caches the interpretation too, so a cached repeat is instant. **m8** (`evals/fetch-clips.js` 34.88%): Person B's file. **m9** (a few ms dropped at Stop): harmless.

### Concern 3: latency, measured

OpenCode usage is now logged by `interpret.js` (token counts only, no content or headers). Before the fix, 3 `/api/text` calls (no MERaLiON):

| Line | Time | Passes | completion / reasoning tokens |
|---|---|---|---|
| Eh the deadline confirm cannot shift one lah | 7.5 s | 1 | 384 / 257 |
| Can lor, I do it tomorrow | 25.6 s | 2 | 652 / 503 and 462 / 316 |
| Wah this one confirm plus chop cannot change already | 9.0 s | 1 | 738 / 581 |

Reasoning is 65–80% of the completion tokens; the prompt (about 435 tokens, 384 cached) is not the cost. **`max_tokens` was not capped**: with 250–580 reasoning tokens before the JSON, a cap near 400 would cut the answer off (the empty-content failure seen earlier). The time is the model thinking.

Fix: interpretations are cached in KV under `interp:<sha256(JSON [transcript, context])>` for 7 days (only `ok` results; KV failures never fail a request); a hit returns `passes: 0` (no OpenCode call). Used by both `/api/text` and `/api/chunk`. After:

| Line (context `["We need the slides by Friday."]`) | First time (miss) | Repeat (hit) |
|---|---|---|
| Eh the deadline confirm cannot shift one lah | 9.1 s, passes 1 | 0.005 s, passes 0 |
| Can lor, I do it tomorrow | 24.5 s, passes 2 | 0.005 s, passes 0 |
| Wah this one confirm plus chop cannot change already | 9.3 s, passes 1 | 0.004 s, passes 0 |

So the cache helps repeats (eval re-runs, retries, demo rehearsals), not new speech. New lines still take 7–25 s, and one live re-run of the Singlish clip timed out at OpenCode's 20 s limit (`meaning_unavailable`). A real fix for new lines needs a non-reasoning model or a reasoning switch, which is a plan decision for the coordinator.

### Commands and spend

- `npm test`: exit 0, 304 tests, 300 pass, 0 fail, 4 todo.
- `npm run coverage`: exit 0, all files 97.31% lines / 98.18% branches / 96.00% functions.
- MERaLiON spend for the review fixes: **0 requests** (the two clips re-sent live were cache hits). `/api/budget` now shows 5 requests, 14.80 s, 1,713 tokens: 3 from my first smoke check and 2 more `/api/chunk` calls (3.6 s and 10.3 s in the wrangler log) that I did not send, most likely the user trying Listen.
- Dev server: not restarted (no `wrangler.toml` change); `src/` changes hot-reloaded.
