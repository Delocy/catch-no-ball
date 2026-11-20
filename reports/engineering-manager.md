# engineering-manager: final report

## What I produced
- `IMPL.md` at the repo root: the 1-week implementation plan, cut into 9 vertical slices from `PRD.md`. It replaces `docs/superpowers/plans/2026-11-20-catch-no-ball-v1.md` (used as input only; not deleted, that's the controller's call).
- Contents: header (goal, architecture, stack, final layout, exact npm scripts, coverage exclusions, config/secrets per slice, pitfalls, shared contracts `Sentence` / `ChunkResult` / endpoints, constants, exact UI copy), the per-slice process (engineer → fresh reviewer → fix → user demo → commit), day-0/1 user checks with what each blocks, a slice overview, the 9 slices, risks R1–R14, assumptions, and 3 questions for the user.

## Slices
1. Type a line, get a card (US-2, US-4 typed, US-5, US-8 typed box, US-11). Needs only the OpenCode key: demoable on day 1.
2. Honest when unsure: retry with context, two readings (US-6, B5).
3. Listen and get cards, Whisper only (US-3, US-4, US-7, US-8 mic blocked).
4. Landing page and deploy to workers.dev; phone checks (US-1).
5. MERaLiON first, Whisper backup, KV cache (US-10, B2, B6). Blocked by R3.
6. Rate guard, monthly budget, demo key, `/api/budget` (US-12, B3, B3a).
7. Evals: score table, particle comparison, M3 timings, E1 cards page (US-13).
8. Connection drops: banner, auto-resume, "Missed some speech" (US-9).
9. Should, optional: term sheet and home-screen manifest (US-14, US-15).

## Key decisions (marked "my call" in IMPL.md)
- Coverage thresholds 81 (Node passes at exactly the threshold; PRD says over 80%). Verified the flags on Node v22.10.0 in a scratch project: a miss exits 1, and **never-imported files are not reported**, so `test/all-modules.test.js` imports every non-excluded module. Exclusions: `src/index.js`, `src/client/app.js`, `evals/run.js` only; `test/config.test.js` checks index.js wiring and the DO export/binding pairing.
- M2 guard `enforceVerbatim`: a fully plain clip shows `transcript.trim()`; plain sentences in mixed clips show the exact transcript span or are dropped. Evals' plain check runs through the real card view code.
- Retry failure → whole clip "Meaning unavailable, tap to retry". Empty transcript from a non-silent clip → "Couldn't catch that". Guard failure → Whisper (never unguarded MERaLiON). `FORCE_WHISPER` beats `x-asr`.
- Cache key includes the recogniser (`asr:meralion:<sha>` / `asr:whisper:<sha>`) so eval comparisons aren't polluted.
- Deploy moved early (slice 4) so every later slice is tried on a real phone over HTTPS. Deployed `FORCE_WHISPER` stays "true" until the guard exists (slice 6).
- Added `GET /api/budget` so the presenter can check MERaLiON minutes left; demo key read from `?demo=` and removed from the address bar.

## Unsure about
- Workers AI Whisper input schema (base64 `audio`) and Worker CPU time for base64 of a ~480 KB clip (R9, measured in slice 4).
- MERaLiON format until R3.
- Whether 9 feedback rounds fit the week (R13); slices 5+6 may be merged.
- Q3 (OpenCode Go key limits) is still open.

## Revision 1 (user feedback: "the main model should be meralion though, i dont want to be using whisper, maybe only as a fall back")

What changed in IMPL.md:
- **MERaLiON is the recogniser from the first spoken card.** The new slice 3 (Listen, and MERaLiON transcribes) builds the client audio together with `callMeralion`, the Durable Object guard (5/min plus the 2700 s monthly normal budget), the KV transcript cache and `GET /api/budget`. Until slice 4 a guard refusal shows "Couldn't catch that" + text box. Whisper is never the default.
- **R3 moved into slice 3 as step 0**, run by the engineer with the user's key from `.dev.vars`: a 3 s macOS `say` clip plus one wrong-key request (2 requests, about 3 s of audio). It saves fixtures and `reports/r3-meralion-format.md`. If MERaLiON doesn't answer, the engineer stops and the user decides.
- **New slice 4 (Backup mode):** Whisper only as the automatic fallback when the guard refuses or MERaLiON fails, with the "Backup mode" label (US-10). The only explicit Whisper request is `x-asr: whisper` from the eval runner's particle comparison; the app never sends it.
- **`FORCE_WHISPER` removed** (no switch makes Whisper the default; in an emergency the budget guard already falls back by itself).
- **MERaLiON development practice** added to section 1: fakes only in unit tests (a test trap makes real fetches fail), typed text for prompt work, short clips (Stop sends the partial), cache for repeats, per-slice spend in engineer reports. Planned spend is about 15 of the 45 normal minutes.
- **Renumbered:** 5 = landing + deploy (was 4), 6 = demo key and reserved 15 minutes (was the guard slice; the guard moved to 3), 7 evals, 8 connection drops, 9 Should, unchanged.
- **Both phones** (iPhone Safari and Android Chrome) are named in the phone checks of slices 5, 6, 8, 9 and the release check. The phones question is removed.
- Updated: config table, pitfalls 1–2, endpoint table (`/api/budget` in slice 3), day-0 table (D1 keys incl. MERaLiON; D1b login by day 2; R3 at slice 3), overview, risks R3/R7/R9/R10 and new R15 (local and deployed guards count separately against one MERaLiON hour) and R16 (MERaLiON slower or less available with no Whisper-first mode to hide it), assumptions.

Unsure about: slice 3 is now the largest slice (client audio plus guard plus cache). It stays one feedback round because the first MERaLiON call must ship with its guard. Local Durable Objects and KV are assumed to run in `wrangler dev` without a Cloudflare login.

## Revision 2 (option B and a 3-person team)

What changed in IMPL.md:
- **Option B.** MERaLiON hears each clip and returns the exact transcript plus its own reading, `Hint = { meaning, tone, confidence }`. OpenCode Go gets that hint with the context, checks it, and writes every card. Typed text still goes to OpenCode Go alone; slices 1–2 are unchanged except that `interpret()` and `buildMessages()` gain `hint = null` in slice 3. `ChunkResult.hint` carries the reading for evals and is never rendered (tested). The final tone must be in TONES even if MERaLiON says something else (tested). A hint never makes plain English Singlish (tested).
- **Step 0 of slice 3** now checks which models are served (MERaLiON-3 10B?), the transcription shape, whether chat/completions accepts audio and its shape, tokens per clip, and the error shape (at most 8 requests, about 20 s of audio). It sets `MERALION_MODE`:
  - `combined`: one call, 15 s clips. This is preferred, as in the PRD.
  - `two_call`: transcription, then chat; 25 s clips.
  - `transcript_only`: the option A fallback if audio chat isn't available; 15 s clips.
- New modules: `src/meralion.js` (HTTP and `parseHearing`), `src/hear.js` (`hearClip`, which replaces `transcribe`), `src/whisper.js`.
- **Guard** counts every MERaLiON request by kind (`combined`/`asr`/`hint`), adds audio seconds per request, and tracks requests and tokens (`recordTokens`). Limits are 2700/3600 s, 750/1000 requests and 75k/100k tokens. In `two_call` mode a reading call leaves one rate slot free for the next transcript. `/api/budget` shows all three counters.
- **Dev practice and budget table** were redone. Planned spend is about 20 min of counted audio and under 250 requests. The eval gap is 13 s per MERaLiON call.
- **Slice 4:** Whisper fallback gives `hint: null`, so cards come from the transcript alone, with "Backup mode". A skipped reading in `two_call` mode is not a fallback.
- **Evals (slice 7)** add `hintTone` (MERaLiON's tone vs the reference), MERaLiON columns in the CSV, `validateReferences` and `--check` for Person B, and they consume B's clips and references.
- **Team split section** added near the top:
  - Person A owns all code and the shared files.
  - Person B owns R1, R2, the clips, `evals/references.json` (exact schema given) and E1 (my call).
  - Person C owns `src/pages/landing.html`, `src/pages/logo.svg`, `icon-180.png` (slice 9) and `docs/presentation/**`, with an exact contract enforced by `test/pages.test.js`.
  - B and C work on branches and open PRs that A merges; A's approved slices go straight to main.
  - Slice 5 consumes C's work and slice 7 consumes B's, with placeholders (or `todo` tests) if their work is late.
- Privacy line updated to the PRD's new wording. Risks now use the PRD's R1–R11 numbers, plus IR-1…IR-9 for risks only this plan adds (IR-9 is teammates' work arriving late). New question for the user: what to do if only `two_call` works or MERaLiON-3 10B isn't served.

Conflict to flag: PRD.md B2a still says "A setting forces Whisper during development". IMPL follows the user's revision-1 instruction (no Whisper in development or demos) and states this in its assumptions. The product manager should drop that sentence from the PRD.

## Revision 3 (team split by folder ownership)

What changed in IMPL.md:
- **Team split rewritten** to the approved folder ownership. A owns `src/`, `test/` and the shared root files. B owns `evals/` (all of it, including the slice 7 code and tests) and `reports/r1-*.md` / `r2-*.md`. C owns `public/` and `docs/presentation/`. The rules: each person edits only their own folders; the shared files are A-only; B and C work on `b/...` and `c/...` branches and open PRs; A's session pulls `main` before each push; only A holds API keys; B's real run uses A's deployed URL plus the `ACCESS_CODE`, which A shares privately, and the MERaLiON run waits for A's go after checking `/api/budget`.
- **Static assets.** `public/` is served as Cloudflare Workers static assets. A adds `[assets] directory = "./public"` and `run_worker_first = ["/app", "/api/*", "/client/*"]` in slice 1. I checked both against the wrangler 4.158 config schema: `run_worker_first` takes a boolean or an array of patterns, and the defaults are `not_found_handling = "none"` (unmatched paths go to the Worker) and `html_handling = "auto-trailing-slash"` (so `/` serves `index.html`).
  - The Worker serves only `/app`, `/client/*` and `/api/*`. The router no longer serves `/`, `/logo.svg`, the manifest or the icon.
  - Removed: `src/manifest.js`, the `.svg` Text glob, the PNG Data rule, `assets.logo`, slice 1's landing placeholder, and every `src/pages/landing.html`, `logo.svg` and `icon-180.png` path.
  - New pitfall 8 and risk IR-10: a file in `public/` could shadow a Worker route. Config tests now reject `app`, `app.html`, `app/`, `api/` and `client/` in `public/`.
- **C's contract** now uses `public/index.html`, the committed `public/logo.svg` (full logo) and `public/logo-mark.svg`, which is the favicon (**my call**: the full logo is 700×240 and unreadable at 32 px).
  - The content rules are unchanged: tagline, example card, exact privacy line, "Open the app" → `/app`, no scripts or external URLs, phone-first, dark mode.
  - For slice 9, C adds `public/manifest.webmanifest`, `public/icon-180.png` and three `<head>` tags.
  - C previews with any static server. `test/pages.test.js` reads `public/` and is written in slice 1. Its landing tests are `todo` until C's file exists, and slice 5 removes the `todo`. The video prompt path is `docs/presentation/VideoPrompt.txt`.
- **Evals moved to B.** The Team split now has a precise contract for B:
  - B codes against the fixed `ChunkResult`/`Hint` shapes, using fixtures in `evals/fixtures/`.
  - The API call is `/api/chunk` multipart with `x-access-code`, plus `x-asr: whisper` only for the Whisper run, and a 13 s gap per MERaLiON call. A 401 stops the run.
  - The CLI flags are `--check`, `--base`, `--asr`, `--limit` (**my call**, for smoke runs) and `--compare`.
  - The outputs are the console table, JSON, CSV, the cards page and the particle CSV. B also writes `evals/RESULTS.md` (**my call**: the committed summary C builds slides from, inside B's folder).
  - The coverage rule covers every `evals/*.js` except `run.js` and the tests.
  - The contract also lists what B needs from A and when: slices 1–3 modules on `main`, real `/api/chunk` replies after slice 3, then the deployed URL and access code after slice 5.
- **Slice 7 changes.** B writes everything. A's part is to run the fresh-context `slice-7-reviewer` on B's PR, merge it, deploy, give the go and walk the demo. There is no Worker-side work, because `x-asr` shipped in slice 4. A's record of this goes in `reports/slice-7-integration.md`.
- **Tests and coverage.** B's tests live in `evals/*.test.js`. The npm `test` and `coverage` scripts now glob both `test/**/*.test.js` and `evals/**/*.test.js`, and coverage excludes the eval test files. `all-modules.test.js` skips `*.test.js`. I verified on Node 22.10 in a scratch project:
  - An empty eval glob doesn't fail.
  - The exclude works.
  - `node --test "evals/*.test.js"` runs ES-module tests with no `package.json`.
  - `node --test evals/` (the bare folder) fails, so the plan uses the glob.
- **Other sections updated.** The day-0 table gains D2b (B's eval code, day 1–4) and D5 (C's manifest and icon), and D4 is updated. Also updated: the slice overview and dependencies, repo layout, config table, copy table, section 2's note on B and C, slices 1, 5, 7 and 9, the release check, risks (IR-5 and IR-9 updated, new IR-10, IR-11 and IR-12) and assumptions.
- **Unchanged:** option B, MERaLiON as the primary model, and the order of slices 1–9.

Decisions for the user: none blocking. Two small points to confirm:
- Slice 5 may deploy before C's landing page has merged, so the public `/` returns 404 until it lands.
- The favicon is `logo-mark.svg`, not the full logo.

## Revision 4: no access code, no demo key

Applied the 2026-11-20 user update in `decisions.md` to `IMPL.md` (PRD.md untouched; it keeps US-2 and US-12 as Removed).

- **Secrets:** only `OPENCODE_API_KEY` and `MERALION_API_KEY`. Removed `ACCESS_CODE`, `DEMO_KEY`, `src/auth.js`, the `x-access-code` / `x-demo-key` headers, `POST /api/check`, the 401 path with its tests and copy (`codeWrong`), the client code prompt and `src/client/storage.js` (nothing left to store), and `readDemoKey`/`isDemo`.
- **Guard:** keeps 5 requests/min plus monthly limits at the full free tier (3600 s audio, 1000 requests, 100,000 tokens); no `demo` parameter anywhere; past a limit clips fall back to Whisper with "Backup mode". `/api/budget` is kept (a public usage counter, and now also the slice 7 offline probe, replacing `api.check`).
- **Slices:** the old slice 6 (demo key) had nothing left, so it was dropped and the later slices renumbered: 6 Evals, 7 Connection drops, 8 Term sheet and home screen (Should). Overview, dependencies, report names, risks and the "merge slices 5 and 6" note updated to match.
- **Team split:** B's real eval run needs only the deployed URL. Config table, day-0 D1 (two keys in `.dev.vars` at the project root), contracts, constants, copy, release check, assumptions and the user question updated.
- **New risk IR-13:** anyone with the public link can use the quota; mitigation is keeping the link private, and the rate guard still applies (it covers MERaLiON only; `/api/text` and OpenCode Go have no limit of their own).
- Remaining mentions of the removed items are only the revision note, the config-table sentence and IR-13, which explain the removal.
- **Branches:** Person A's slices are built on `a/slice-<n>-<name>` branches and merged into `main` by PR after the user's feedback (not pushed straight to `main`). Team split rules, section 2, IR-12 and the assumptions are updated; docs-only changes may still go to `main` directly.

## Revision 5: transcript-only MERaLiON, no deploy for now

Applied the `decisions.md` updates ("MERaLiON transcript-only", "no deploy for now") and `.superpowers/main-flow/meralion-step0.md` to `IMPL.md` and `README.md` (document edit only: no code, no commit; `PRD.md` untouched, the PM is editing it).

- **Step 0 is done.** Slice 3's step 0 is now a "Step 0 results" box: model `MERaLiON/MERaLiON-3-3B-ASR-CTM` only, `MERALION_MODE = "transcript_only"`, `CLIP_SECONDS = 15`, `POST /v1/audio/transcriptions` with JSON `{"audio_url":"data:audio/wav;base64,..."}`, header `X-API-Key`, transcript at `choices[0].message.content`, 401 `{"detail":"Invalid API key"}`, about 345 tokens per clip, particles mixed. The request does not carry a model id. The engineer does not re-run it.
- **Option B removed everywhere:** the `hint` object and its `ChunkResult` field, the `combined` and `two_call` modes and branches, `HINT_SPARE_SLOTS` and the `kind` argument of the guard, `callMeralionChat`/`parseHearing`/`HEAR_PROMPT`, the hint tests (prompt, interpret, hear, pipeline, cards), the "hint never shown" rules, the 25 s clip row, and B's `hintTone`, `callsPerClip` and MERaLiON-tone columns. `interpret()` is unchanged: spoken text is handled from the transcript alone, as in slices 1-2.
- **Budget recheck (one call per clip):** 15 s clips give 4 calls a minute (limit 5); requests never the first limit; audio about 240 full clips; tokens about 290 calls (100,000 / 345), so tokens run out first only when the average clip is under about 12 s. Caveat noted: the flat 330-token prompt suggests MERaLiON pads to 30 s, so if audio is counted that way the 3,600 s limit allows about 120 clips; the release check compares `/api/budget` with MERaLiON's console. The planned-spend total drops from about 19 to about 16 minutes.
- **Slices 1-2 marked built** (slice 1 merged, slice 2 is PR #3), with a "Where things stand" overview. Slice-2 minors **M5** (`contextAfter` in `session.js`: a failed line's transcript enters context) and **M6** (`withContext`: each queued item carries its own context; a retry reuses it and does not re-append) are folded into slice 3 with tests and a demo step, pointing to `reports/slice-2-reviewer.md` (on the slice 2 branch until PR #3 merges).
- **Deploy deferred:** slice 5 is retitled "Landing page, logo and static assets (local; deploy deferred)"; the KV namespace id, secrets, `wrangler deploy`, observability, CPU check and iPhone/Android checks are marked deferred until the user asks. The `[assets]`/`public/` wiring stays and is checked on localhost. Slices 6-8, the release check, risks and assumptions follow (evals are run by A locally against `http://localhost:8787`).
- **No removed keys:** a search of slice 3 and the plan finds no `ACCESS_CODE`/`DEMO_KEY` use; slice 3 now has a config test that fails if either appears or if `.dev.vars.example` lists anything but the two real secrets.
- **Open for the PM/PRD:** the landing privacy line ("transcribed and understood", PRD L1, copy table and Person C's contract) still says MERaLiON also understands; with transcript-only it should say "transcribed". Left unchanged because it is a PRD/C contract.
- **README:** the "Speech" bullet now says MERaLiON-3 (3B ASR) turns Singlish audio into an exact transcript and OpenCode Go explains the meaning and tone; no "hears and explains" wording was present.
