# Slice 3b review: Upload an audio file (US-16)

Reviewer: fresh eyes, base = slice 3. Inputs: IMPL.md slice 3b + section 1 constants/COPY, PRD.md US-16, `.superpowers/main-flow/slice-3b.diff`, `reports/slice-3b-engineer.md`.

## Verdict

**Approve after two Important fixes.** The pure module (`src/client/upload.js`) matches the interface spec almost line for line, the queue changes keep slice 3's Listen behaviour, escaping is safe (nothing user-supplied is rendered as HTML), and the tests are real and pass the coverage gate. The two Important findings concern runtime behaviour the unit tests cannot see: typed lines get stuck behind a whole upload, and the 40 MiB byte cap does not bound decode memory for compressed files.

Verified by running:
- `npm test`: 328 tests, 324 pass, 0 fail, 4 todo (pre-existing).
- `npm run coverage`: exit 0. All files 97.56 % lines / 98.06 % branches / 95.89 % functions. `upload.js` 100 / 96.77 / 100; `queue.js` 100 / 100 / 87.50 (the default `sleep` is never called). These match the engineer's figures.

## Important

**I1. A typed line sent during an upload waits behind every remaining clip (up to about 2 min). The queue rule meant to stop that would also break the 13 s pacing if it were fixed naively.**
`src/client/app.js:275` pushes every clip of the upload at Send. A typed line is then pushed at the end of the queue, after all the remaining clips and their 13 s gaps. For an 8-clip file, a line typed just after Send is answered about 100 s later. The spec says typed lines "still work in every mode (they queue between clips, with no gap before or after them)", and the acceptance criteria say "typed lines work throughout". The queue test `test/queue.test.js:216` only shows the intended behaviour because it pushes `c1, t, c2` by hand, an order `app.js` never produces.

Second half (latent today, live once the first half is fixed): `uploadGap` (`src/client/upload.js`, `uploadGap`) and the queue (`src/client/queue.js:35-36`) only look at the item just before. If a text item ever sits between two upload clips, both gaps are 0, so the two clips go out a few seconds apart. That breaks the acceptance criterion "clips of one upload are at least 13 s apart unless the previous one was cached", and a few typed lines could make one upload trip the 5-a-minute guard.

*Fix:* (a) Let text items jump ahead of waiting upload clips: `push` puts a `kind: "text"` item before the first waiting item that has an `uploadId`. Or have `app.js` feed upload clips one at a time from `onResult`. (b) Make pacing time-based: record when the last uncached upload clip was sent (per `uploadId`), and before sending the next clip of that upload, sleep `max(0, UPLOAD_GAP_MS − elapsed)`. Tests: "a text pushed during an upload is sent before the next waiting clip"; "two clips of an upload with a text between them are still ≥ 13 s apart (fake clock)".

**I2. The 40 MiB byte cap does not prevent huge decodes for m4a/mp3, so a long compressed file can crash the tab before the 120 s check runs.**
`src/client/upload.js:13` (byte cap) and `src/client/app.js:246` (`prepareUpload(await decodeFile(file))`): the duration is only known after `decodeAudioData` has decoded the whole file. The spec's reasoning for 40 MiB ("so a huge file is never decoded"; 120 s of 24-bit WAV is 34.6 MB) holds only for WAV. A 40 MiB mp3 at 128 kbps or m4a at 64 kbps is about 40 to 85 minutes long. Decoded at a 48 kHz stereo context rate in float32, that is roughly 1 to 2 GB of PCM. On an iPhone, Safari will kill the tab, and on desktop it stalls for many seconds, all to show "over 2 minutes". A 1-hour meeting memo is a realistic thing for the target user to pick.

*Fix (pick one, keep it pure and tested in `upload.js`):* (a) Use a per-format byte cap: keep 40 MiB for `.wav`/`audio/wav`, and use about 6 MiB for compressed types (120 s at 320 kbps is 4.8 MB). (b) Before decoding, probe the duration with an `<audio>` element on `URL.createObjectURL(file)` (`loadedmetadata` → `duration`). Pass that to `checkDuration`, and fall back to decoding when it is `NaN`/`Infinity`. Doing (a) as well as (b) is cheapest. Spec owner: update IMPL's `UPLOAD_MAX_BYTES` rationale.

## Minor

1. **`sleep` can't be cancelled.** `src/client/queue.js:36`: after **Cancel upload** during a 13 s gap, the loop is still asleep, so a typed line sent right after the cancel waits up to 13 s. Also, the default `sleep` is never exercised (functions 87.5 %). Give `drop` the job of waking a pending sleep (keep the resolver; `drop` calls it when it removes the head), and add a test.
2. **The 120 s cap is exact, but decoders add padding.** `checkDuration` refuses anything over 120.000 s. AAC (2112 priming samples) and mp3 (encoder delay) often decode a little longer than the displayed length, so a voice memo shown as "2:00" can be refused. Consider a small tolerance (for example 120.5 s, which still gives at most 8 sendable clips, since a tail under 0.5 s is dropped), or accept this and note it in the copy or spec.
3. **An unexpected throw leaves the page stuck.** `src/client/app.js:237-263`: `planConfirm` and the DOM writes after the `try` blocks are unguarded. A throw there (for example a 200 `/api/budget` body without `limits`) is an unhandled rejection with `mode` stuck at `decoding`, so both Listen and Upload stay disabled until reload. Likewise, `src/client/app.js:86`: if `renderResult`/`insert` throws in `onResult`, the upload bookkeeping is skipped and `mode` stays `sending`. Wrap the handler body so that any throw ends in `backToIdle(COPY.uploadUnreadable)`, and do the upload bookkeeping before rendering (or in a `finally`).
4. **Retries during an upload are a little off.** A retried upload clip keeps `uploadId/index/total` (`retryOf` spreads the item). Its result rewrites the status to "Sending clip k+1 of n" (a step back), and **Cancel upload** drops a pending retry and deletes its card entirely, so the failed card and its retry are lost. Strip `uploadId` from retry items, or exclude `retry` items in the `drop` predicate.
5. **`checkUpload` checks size before type** (`src/client/upload.js:13`), so a 50 MB PDF gets "This file is over 2 minutes" instead of "Couldn't read this file". Check type first.
6. **Decode context.** `decodeFile` opens a realtime `AudioContext` per upload. An `OfflineAudioContext` (or one reused context) avoids Safari's limit on hardware contexts and output-device side effects. Older `webkitAudioContext.decodeAudioData` is callback-only, so it falls through to "Couldn't read this file". That is acceptable, but worth knowing.
7. **The copy differs between PRD and IMPL.** PRD.md:259-260 says "This file is longer than 2 minutes. Pick a shorter one." and "Couldn't read this audio file. Try an m4a, mp3 or wav.", while IMPL.md:314-315 (and the code) say otherwise. The code follows IMPL, which is the COPY authority. Sync the PRD.
8. **Test gaps.** There is no explicit "silent tail" case (for example 40 s with the last 10 s at zero → 2 clips, 30 s). There is no "120 s at 44.1/48 kHz → exactly 8 clips" case. The `app.js` glue (mode transitions, Cancel upload removing pending cards, status text) has no automated test, so demo steps 8 and 10 are the only check. They haven't been run (the engineer report says so).

## Spec compliance (checked)

| Item | Status | Where |
|---|---|---|
| `#upload`, hidden `#upload-file` with the exact `accept`, `#upload-confirm`, `#upload-status role=status` | OK | src/pages/app.html |
| `upload.js` exports, constants and signatures | OK; all 15 functions match the interface section | src/client/upload.js |
| `CLIP_SECONDS` imported from clipper.js; `resampleTo16k`/`clipToSend` reused | OK | upload.js:2-3 |
| Resample once, then split (exact 15.000 s boundaries) | OK; `clipToSend(c, 16000)` does not resample again | upload.js `prepareUpload` |
| `seconds` = the sent clips only, `(len−44)/32000` | OK; matches what the guard charges (`wavInfo` seconds) | upload.js |
| N rounded up, M rounded down, budget-out on any of the three limits, null budget → no-M copy | OK | upload.js; app.js:251-257 |
| Confirm shown before any send; Send guarded against a double tap (`mode !== "confirming"`) | OK | app.js:267 |
| A new `sessionId` per upload; context carries on | OK | app.js:272 |
| Gap 13 s between clips of one upload, 0 after `cached: true`, 0 for Listen/text | OK as a function; see I1 for the adjacency issue | upload.js, queue.js:35 |
| `drop` never drops the in-flight item; head re-read after the gap | OK (identity check on `inFlight`; `while` re-reads `items`) | queue.js |
| `buttonsFor` table | OK, exact | upload.js |
| Typed lines between clips | **Not met** (I1) | app.js:275 |
| "A huge file is never decoded" | **Not met for compressed formats** (I2) | upload.js:13 |
| No server file changed | OK (diff touches only client, page, index.js, tests, reports) | |
| DoD: `reports/slice-3b-feedback.md`; demo steps 6, 8, 9, 10 (pacing, busy rule, real memo, cancel) | **Open**: not done yet (user steps) | |

## Correctness notes (no finding)

- **Boundaries:** an exact multiple (30 s) gives 2 clips with no empty tail (the loop is `i < length`). A tiny tail (30.3 s) is dropped by `MIN_SEND_SECONDS`. A silent tail is dropped by `isSilent` per clip. At 44.1 kHz, `resampleTo16k` uses `Math.round`, so 120 s gives exactly 1,920,000 samples; any ±1 rounding would make a 1-sample 9th clip, which is dropped anyway.
- **Zero-length decode:** `checkDuration(0)` passes and `splitIntoClips` gives `[]`, so you get `uploadSilent` ("No speech found"). That is acceptable. A buffer with 0 channels throws inside the `try`, giving `uploadUnreadable`. A video file (`video/mp4`, `.mov`) is refused by `checkUpload`. A video with an audio track renamed `.m4a` decodes its audio, which is harmless.
- **Context ordering:** upload clips go through the same `send()`, which calls `sendContext(item, context)` at send time. The gap sleeps after `onResult`, so each clip sees the previous clip's result in its context, the same rule as slice 3.
- **Cancel:** `cancelUpload` drops the waiting items (during the gap the head is droppable because `inFlight` is null), removes their pending cards, and sets `upload = null`, so the in-flight clip renders and doesn't touch mode or status. No stray sends: after `drop`, the loop's `while` finds nothing. A new upload started within the 13 s window is picked up by the same loop. This is correct (see Minor 1 for the delay).
- **Listen vs Upload:** Listen is disabled in decoding, confirming and sending. Upload is disabled while listening and during the mic-permission wait (`app.js:261`). `setListening(false)` only runs from `stop()`, which needs `rec`. They can't overlap.
- **Listen regression:** `uploadGap` returns 0 for items without `uploadId`, and `sleep` is only awaited when the gap is above 0, so the Listen/text loop is unchanged. All slice 3 queue tests still pass.
- **Security:** the file name is never shown. Decode errors are swallowed into a fixed COPY string. Status and confirm text use `textContent`. There is no injection path.

## Tests

The tests exercise real behaviour: real WAV bytes read back with the server's `wavInfo`, real resampling at 3 rates, the silent middle, the tiny tail, the cap at 120/120.01/121 s, the byte cap at ±1, every `planConfirm` branch with the exact copy, and the queue's gap/drop with injected `sleep`. The coverage gate passes. Gaps are listed in Minor 8.

## Engineer's concern: first live send gave `meaning_unavailable`

It is not caused by slice 3b code. The engineer's live check POSTed directly to `/api/chunk` from a script, so no slice-3b client code ran, and the slice changes no server file. `meaning_unavailable` comes only from `explain()` catching an `InterpretError` (src/pipeline.js:60-62): an OpenCode timeout or non-2xx, an unparseable reply, a schema violation, or a failed pass 2 when a sentence came back `confident: false` (exactly 2 distinct readings required). The second send had the same transcript, and the context was presumably the same. It succeeded because failures are not cached in the interp cache, so OpenCode was simply called again. Same input with a different outcome points to model or provider nondeterminism. A Singlish line ending in "leh" is a likely candidate for the stricter pass-2 path. To confirm, read the `interpret failed: <message>` line in the `wrangler dev` output for that request. If it is pass 2 or a schema error recurring, look at slice 2's validation; it is not an upload problem.
