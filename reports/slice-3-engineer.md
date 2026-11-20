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
