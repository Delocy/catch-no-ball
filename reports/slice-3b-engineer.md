# Slice 3b engineer report: Upload an audio file (US-16)

## Built
Upload is a second feed into slice 3's queue; no server file changed.
- `src/client/upload.js` (new, pure): constants, `checkUpload`, `checkDuration`, `downmix`, `splitIntoClips`, `prepareUpload`, `estimateMinutes`, `minutesLeft`, `budgetOut`, `formatCopy`, `planConfirm`, `uploadItems`, `uploadGap`, `progressText`, `buttonsFor`.
- `src/client/queue.js`: `gapMs`, `sleep`, `drop(pred)` (head re-read after the gap; the in-flight item is never dropped).
- `src/client/copy.js`: the 13 upload keys. `src/pages/app.html`: `#upload`, hidden `#upload-file`, `#upload-confirm`, `#upload-status`. `src/client/app.css`: button, panel, disabled states (uses the theme variables, so dark mode follows). `src/client/app.js`: glue (mode, file input, decode, confirm, send, cancel). `src/index.js`: serves `upload.js`.
- Tests: `test/upload.test.js` (new), additions to `queue`, `copy`, `pages` tests.

## Tests and coverage
`npm run coverage`: 328 tests, 324 pass, 0 fail (4 todo, pre-existing). All files 97.56 % lines, 98.06 % branches, 95.89 % functions; `upload.js` 100 / 96.77 / 100, `queue.js` 100 / 100 / 87.5.

## TDD
RED commit `test: slice 3b upload ...`: `test/upload.test.js` failed to load (module missing) plus 5 queue/copy/pages failures (6 fail). GREEN commit `feat: upload audio file (US-16) ...`: all pass. One test of mine had a wrong assertion (downmix of a single `[0.5]`); fixed the test, not the code.

## Live check and spend
Synthetic file: `say` then `afconvert` to m4a (15.45 s), and a 16 kHz mono WAV of it. The browser decode can't run in Node, so a script ran `prepareUpload` on the WAV (16 kHz so no resample) and POSTed the clip to `/api/chunk` on 8787, as the page does.
- Send 1: `source: meralion`, `cached: false` (OpenCode step gave `meaning_unavailable`, transcript still from MERaLiON).
- Send 2 (same file): `cached: true`, status ok, "A the deadline confirm cannot shift one leh."; `/api/budget` unchanged.
- Spend: 1 MERaLiON request, about 15 s of audio, 342 tokens (budget went 7 to 8 requests, 23.0 to 38.0 s, 2403 to 2745 tokens).
- Not run live: the multi-clip 13 s pacing and Cancel upload (unit-tested only). The 15.45 s file gave one clip because `say` made the silence shorter than the demo script assumes (tail 0.45 s dropped).

## Try it
`localhost:8787/app` in desktop Chrome. Tap Upload audio, pick an m4a, mp3 or wav (an AirDropped iPhone voice memo `.m4a` works; the picker lists the extension because iOS may give an empty MIME type). See "Reading the file", then the confirm panel with minutes, then Send. Pending cards appear in file order, with about 13 s between clips unless cached. Cancel upload removes clips not yet started. Demo files from IMPL's script; the one I made is at `/private/tmp/claude-501/-Users-zares-DSTA-thinkertanker-catch-no-ball-catch-no-ball--claude-worktrees-catch-no-bal-project-ideas-0bea04/c9519746-0f9f-4263-b2a1-05fb212f576d/scratchpad/slice3b/u-short.m4a`.

## Concerns
- `app.js` was not driven in a browser by me (excluded from coverage by design); DOM glue is untested beyond `node --check`.
- Real m4a decoding in Chrome/Safari is unverified here.
- Cancelling while a clip is in flight lets that card render, per spec; the status then says cancelled.

## Review fixes
Reviewer: `reports/slice-3b-reviewer.md`. Tests first (RED commit), then fixes (GREEN).
- **I1 fixed.** `queue.push` puts a `kind: "text"` item ahead of waiting upload clips (never the one in flight; typed lines keep their order; Listen clips keep push order) and wakes a pending gap. Pacing is now `createUploadPacer` (replaces `uploadGap`): a clip waits until 13 s after the last clip of its upload was sent, so typed lines in between do not reset or cancel it; a cached result still skips the wait. Tests use the real order app.js produces (8 clips pushed at Send, a typed line pushed from `onResult` of clip 3 and, separately, during the gap) with a fake clock: sent order `c1 c2 c3 t1 c4..c8`, clips at least 13 s apart.
- **I2 fixed.** `checkUpload` checks type first, then a size cap per format: 40 MiB for wav, `UPLOAD_MAX_COMPRESSED_BYTES = 6 MiB` for m4a/mp3 (also Minor 5). `durationVerdict` (pure) refuses a file over the cap from the `<audio>` metadata duration before any decoding; an unknown duration (NaN/Infinity/timeout 4 s) falls back to decoding and the check after decode.
- **Minors fixed:** 1 (`drop` wakes a pending gap, default `sleep` now tested); 2 (cap is `< 120.5 s`: `UPLOAD_PADDING_SECONDS = 0.5`, strict, so the tail is under 0.5 s and dropped, never a 9th clip); 3 (change handler wrapped, any throw ends in `backToIdle`; a bad budget body falls back to the no-budget confirm; upload bookkeeping in a `finally` in `onResult`); 5; 8 (silent-tail and 120 s at 44.1/48 kHz tests added).
- **Deferred:** 4 (retry of an upload clip keeps `uploadId`, so Cancel can delete it): needs a change in session.js `retryOf` semantics, rare, no data loss beyond a card; 6 (OfflineAudioContext): needs a real Safari to verify, left until the iPhone check; 7 (PRD copy sync): PRD.md belongs to the PM.
- **Definition of done:** `reports/slice-3b-feedback.md` is the user's, to be written after they try it. Demo steps 2-5 (cap, unreadable, silence, confirm/cancel) are free but need a browser with decoding; I did not run them (no file-picker automation here). Steps 6, 8, 9, 10 need the user (real iPhone m4a in Chrome/Safari; 9 and 10 spend MERaLiON). No further MERaLiON quota was used in the fixes (still 1 request).
- **Results:** `npm test` exit 0 (336 tests, 332 pass, 0 fail, 4 todo). `npm run coverage` exit 0: all files 97.63 / 98.28 / 96.10; `queue.js` 100/100/100, `upload.js` 100/98.67/95.65.
