# Catch No Ball: implementation plan

**Status:** draft for approval, 2026-11-20
**Source of truth:** [PRD.md](PRD.md), revision 1, "option B" (user stories US-1…US-15 (US-2 and US-12 are marked Removed there; the numbers are kept), requirements A/L/B, metrics M1–M5, tests E1/E2, risks R1–R11). Binding user decisions (including: A works on one branch per slice, merged to `main` by PR after feedback): `.superpowers/main-flow/decisions.md`.
**Replaces:** `docs/superpowers/plans/2026-11-20-catch-no-ball-v1.md` (a horizontal, task-by-task plan for a larger scope). Its interfaces and test ideas are reused here, re-cut into vertical slices. The old file was removed when this plan was approved.
**Deadline:** 1 week. Slices 1–7 are Must. Slice 8 is Should and optional.
**Revisions:** 1: MERaLiON is the main model from the first spoken card; Whisper is only the automatic fallback. 2: option B (MERaLiON hears transcript + meaning + tone of voice; OpenCode Go checks it and writes the card) and a 3-person team split. 3: the team split is by folder ownership, so A, B and C can code at the same time without touching each other's files; `public/` is served as Cloudflare Workers static assets (Person C's); the slice 6 eval code moves to Person B. 4: no access code and no demo key (decisions.md, update 2026-11-20): the only secrets are `OPENCODE_API_KEY` and `MERALION_API_KEY`; the guard uses the whole free tier; the old demo-key slice is gone and the later slices are renumbered (old 7, 8, 9 are now 6, 7, 8).

Labels: **(my call)** marks an engineering decision this plan makes that the PRD leaves open. Each one can be overruled.

---

## Team split (3 people, by folder ownership)

Three people code at the same time. Each person owns folders and files outright, and nobody edits another person's files, so B's and C's PRs never conflict with A's slices.

| Person | Owns (folders/files) | Work | Hands in |
|---|---|---|---|
| **A: the user, with Claude** | `src/`, `test/`, `package.json`, `package-lock.json`, `wrangler.toml`, `.dev.vars.example`, `CLAUDE.md`, plus the other shared root files (`.gitignore`, `README.md`). | App pipeline slices 1, 2, 3, 4, 7, and the Worker/route/deploy half of slices 5 and 8. Integrates and reviews B's eval PR in slice 6. Merges B's and C's PRs. Holds both API keys and the Cloudflare login. | Each slice is built on its own branch `a/slice-<n>-<name>` (for example `a/slice-1-type-to-card`); after the user's feedback it is merged into `main` through a PR and pushed. Docs-only changes may go to `main` directly. |
| **B** | `evals/` (all of it: `score.js`, `runner.js`, `cards-page.js`, `run.js`, their tests `evals/*.test.js`, `evals/fixtures/`, `references.example.json`, `references.json`, `README.md`, `RESULTS.md`), `reports/r1-*.md`, `reports/r2-*.md`. Clips live in `evals/clips/` on B's machine only (gitignored). | Day-1 checks **R1** (particle test) and **R2** (phone-in-meeting test); recording the **15 eval clips** and writing **`evals/references.json`**; **the slice 6 eval scripts and their tests**, built against the fixed contracts below with fixture JSON, so they need no running app until the final run; running the real eval and **E1**. | R1/R2 by day 2 (R2 before slice 3's demo); eval code PR by day 4; clips and references by day 4; full eval run and E1 result by day 6. |
| **C** | `public/` (landing page `public/index.html`, `logo.svg`, `logo-mark.svg`, `icon-180.png`, `manifest.webmanifest`, and any other static file), `docs/presentation/` (video prompt and script, slide notes, a link to the slides). | Landing page, logo, home-screen icon and manifest (the front-end half of slices 5 and 8), the demo video and the presentation. | Landing page by day 3; manifest and icon by day 6 (only needed if slice 8 happens); video by day 6; presentation by day 6. |

**Rules**
- **Each person edits only their own folders and files.** If someone needs a change in another person's file, they ask the owner. The shared files (`package.json`, `package-lock.json`, `wrangler.toml`, `src/index.js`, `src/router.js`, `.gitignore`, `.dev.vars.example`, `CLAUDE.md`, `README.md`) are **A-only**. B's code may *import* A's modules (`src/prompt.js`, `src/client/cards.js`, `src/meralion.js`) and read `src/client/app.css`, but never edits them; C's pages never depend on A's files.
- **B's tests live in `evals/*.test.js`** (inside B's folder, so B's PRs touch only `evals/`). A's npm test glob picks them up: `node --test "test/**/*.test.js" "evals/**/*.test.js"` (section 1). A creates `package.json` in slice 1 (day 1); until it is on `main`, B runs `node --test "evals/*.test.js"` from the repo root (checked on Node v22.10: it detects ES module syntax by itself, so no `package.json` is needed; pass the glob, not the bare folder, which Node 22.10 rejects).
- B and C work on their own branches (`b/...`, for example `b/evals-score`, `b/references`; `c/...`, for example `c/landing`) and open PRs to `main`. A PR touches **only** that person's folders. A (with Claude) reviews it, runs `npm test` and `npm run coverage`, and merges it. B and C pull `main` before opening a PR.
- A's slices are **not** pushed straight to `main`. Each slice lives on its own branch `a/slice-<n>-<name>` (for example `a/slice-1-type-to-card`, `a/slice-3-listen-meralion`). After the user's feedback on the slice, A's session merges the branch into `main` through a PR and pushes. **Before opening that PR it merges `main` into the branch**, so merged PRs from B and C are included and nothing is overwritten. Docs-only changes (plan, reports, README) may still go to `main` directly.
- **Nobody but A holds API keys** (`OPENCODE_API_KEY`, `MERALION_API_KEY`, the Cloudflare login). They stay in A's `.dev.vars` and in deployed secrets. B's real eval run needs **only the deployed URL**: no code and no key. A shares the link with B privately (a direct message, never a PR, issue, file or public chat), because anyone with the link can use the app's MERaLiON quota (IR-13).
- Neither B nor C sends MERaLiON requests from scripts on their own schedule: B's MERaLiON eval run (slice 6) starts only after A checks `/api/budget` and says go. B's fixture-based tests never touch the network. (B's R1 playground test is separate and doesn't use our API key.) Eval clips and consent records are never committed; B shares the clips with A through a private folder (not a public link, not chat).

**Contract for Person B, part 1: `evals/references.json`** (slice 6 reads exactly this; `node evals/run.js --check` validates it with no network call, and B runs it before the PR):
```json
[
  {
    "clip": "01.wav",
    "text": "Eh the deadline confirm cannot shift one lah",
    "hasSinglish": true,
    "meaning": "The deadline is fixed and will not move.",
    "tone": "firm",
    "ambiguous": false,
    "particles": ["lah"]
  }
]
```
- 15 entries: 10 Singlish (the E1 sentences, at least 2 with `"ambiguous": true`, for example "can meh" vs "can lor") and 5 plain English.
- `clip`: `01.wav` … `15.wav`, two digits, matching the files in `evals/clips/`, no duplicates.
- `text`: what the speaker actually said, written out by a Singaporean teammate (the reference transcript).
- `tone`: one of `firm`, `reluctant`, `doubtful`, `joking`, `casual`, `neutral`, as the speaker meant it. For an ambiguous clip, the tone the speaker intended.
- `meaning`: one short plain-English sentence, written by a Singaporean teammate.
- Plain-English entries: `"hasSinglish": false`, `"meaning": ""`, `"tone": "neutral"`, `"ambiguous": false`, `"particles": []`.
- `particles`: the Singlish particles actually spoken, lower case (for example `["lah", "lor"]`), used to count which ones each speech model kept.
- Audio: one sentence per clip, 3–10 s, a quiet room, spoken with the intended tone of voice (MERaLiON now reads tone from the audio). Convert with `afconvert -f WAVE -d LEI16@16000 -c 1 in.m4a evals/clips/01.wav`. Everyone recorded agrees first to their voice going to MERaLiON (A*STAR) and Whisper (Cloudflare); B keeps the consent list privately.

**Contract for Person B, part 2: the eval scripts** (the full interfaces and tests are in slice 6; this is what B builds against and what B needs from A):
- **Code against the fixed shapes in section 1** (`Sentence`, `Hint`, `ChunkResult`, `TONES`). They don't change after this plan; if A ever has to change one, A tells B first. B writes hand-made fixture results in `evals/fixtures/*.json` (at least: a confident Singlish `ok`, an unsure `ok` with 2 readings, a plain `ok`, `meaning_unavailable`, `uncaught`, `silent`, a MERaLiON result with a `hint`, a Whisper result with `hint: null`) and tests everything with them and with a fake `send`. No test makes a network call.
- **The API for the real run:** `POST <base>/api/chunk`, multipart fields `audio` (the clip's WAV bytes as a `Blob` of type `audio/wav`, filename = the clip name), `sessionId` (`eval-<stamp>`) and `context` (`"[]"`); no auth header and no key (the real run needs only the deployed URL); header `x-asr: whisper` **only** for `--asr whisper` (`--asr meralion` sends no `x-asr`, i.e. the app's normal path). Replies: 200 `ChunkResult`; 400 `bad_audio` / 413 `too_long` / 5xx / network errors are recorded as that clip's error row and the run continues. **Wait `EVAL_MERALION_GAP_MS = 13000` × calls per clip between clips for `--asr meralion`** (13 s in `combined` and `transcript_only` mode, 26 s in `two_call`; this keeps under MERaLiON's 5 a minute), 0 for Whisper. Calls per clip come from `MERALION_MODE` in `src/meralion.js` (on `main` after slice 3): 2 for `"two_call"`, else 1.
- **CLI flags** (`evals/run.js`): `--check`; `--base <url>`; `--asr meralion|whisper`; `--limit <n>` (only the first n clips in reference order, for smoke runs; **my call**); `--compare <whisper.json> <meralion.json>`.
- **Outputs:** the score table on the console (`formatTable`: plain English left alone, final tone %, MERaLiON's own tone %, ambiguity honest %, particles kept %, median and max response time, source mismatches); `evals/results/<stamp>-<asr>.json` (raw rows), `.csv` (for the person scoring meaning) and `-cards.html` (the E1 cards page); `--compare` writes `evals/results/<stamp>-particles.csv` (the presentation's particle chart). `evals/results/` is gitignored; B copies the summary tables (score table, particle table, response times, E1 result) into **`evals/RESULTS.md`**, which is committed and is what C builds the slides from.
- **Coverage:** every `evals/*.js` file except `evals/run.js` (the CLI) and the test files counts toward the >80% gate (section 1). B runs `npm test` and `npm run coverage` before every PR once `package.json` is on `main`.
- **What B needs from A, and when:**
  - Day 1 (slice 1 on `main`): `package.json` with the test glob; `TONES` in `src/prompt.js`; `toCardModels`, `cardHtml` in `src/client/cards.js`; `src/client/app.css`. Until then B starts on the pieces that need none of these (`particlesKept`, `toCsv`, `runEval`, `summarise`) with `node --test "evals/*.test.js"`.
  - Day 1–2 (slice 2): the `unsure` card kind.
  - Day 2 (slice 3): `MERALION_MODE`; A also shares two or three real `/api/chunk` replies from the slice 3 demo (made from the `say` samples, so no one's voice), which B adds to `evals/fixtures/` to check the hand-made ones match.
  - Day 3 (slice 5): the deployed URL (in `reports/slice-5-engineer.md`), shared privately; no code or key is needed. B can then do the free 2-clip Whisper smoke run (`--asr whisper --limit 2`) at any time.
  - Day 4–5 (slice 6): A's go for the MERaLiON run (after checking `/api/budget`).
  - B never needs local `wrangler dev`, keys or a Cloudflare login.

**Contract for Person C: `public/`** (Cloudflare serves `public/` as static assets, section 1, so these are plain files: no keys, no Worker and no `npm install` are needed to work on them):
- **Preview:** open the files with any static server from the repo root, for example `python3 -m http.server 8000 --directory public`, then `http://localhost:8000/` (the **Open the app** link 404s there; that is expected). Once slice 1 is on `main`, `npm run dev` also serves `public/` at `http://localhost:8787/` next to the app, still with no keys needed for the landing page.
- **Check before the PR:** `node --test test/pages.test.js` (A's test, on `main` from slice 1; it reads C's files as text, needs no `npm install` and no keys).
- `public/index.html` (served at `/`): one self-contained HTML file. Inline CSS only, **no `<script>`**, no external fonts, images or URLs. **Phone-first:** readable at 375 px with no sideways scrolling, and a **dark mode** via `prefers-color-scheme`. It must contain: `<meta name="viewport" …>`; `<link rel="icon" href="/logo-mark.svg">`; the full logo from `/logo.svg` (an `<img>` with alt text); the name **Catch No Ball**; the tagline **For when you catch no ball.**; a one-paragraph explanation; an **example card** with the sentence **Eh the deadline confirm cannot shift one lah**, a one-line meaning and the tone word **firm**; a link with the text **Open the app** to `/app`; and the **privacy line**, exactly: **Audio is sent to A\*STAR's MERaLiON service to be transcribed and understood, and is never stored by us.** It may link only to `/`, `/app`, `/logo.svg` and `/logo-mark.svg` (plus, for slice 8, `/manifest.webmanifest` and `/icon-180.png`).
- `public/logo.svg` (**already committed**: the full logo) and `public/logo-mark.svg` (**already committed**: the square icon mark, used as the favicon): each a valid `<svg>` with a `viewBox`, no `<script>`, no external `href`, under 20 KB. The logo shows a speech bubble with a small ball inside, hand-drawn style; the mark is readable at 32 px; both read on light and dark backgrounds. C may refine them in later PRs; the paths stay.
- **Reserved paths:** nothing in `public/` may be named `app`, `app.html`, `app/`, `api/` or `client/`. Those paths are the Worker's (`test/config.test.js` checks this).
- **Slice 8 only (Should):** `public/manifest.webmanifest`, valid JSON with exactly `name: "Catch No Ball"`, `short_name: "Catch No Ball"`, `start_url: "/app"`, `display: "standalone"`, a `background_color` and `theme_color`, and `icons: [{ "src": "/logo-mark.svg", "sizes": "any", "type": "image/svg+xml" }, { "src": "/icon-180.png", "sizes": "180x180", "type": "image/png" }]`; `public/icon-180.png`, a 180×180 PNG of the mark (for example `qlmanage -t -s 180 -o . public/logo-mark.svg`, then renamed; committed as a binary, no build step); and, in `index.html`, `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="/icon-180.png">` and a `theme-color` meta.
- **Video and presentation:** in `docs/presentation/` (Markdown, plus a link to the slides; the video prompt is `docs/presentation/VideoPrompt.txt`). They use the deployed URL (slice 5), the 60 s demo script in PRD section 8, and B's `evals/RESULTS.md` (E2 table, particle table, E1 before/after result). The video is recorded on day 6 after the release check.

---

## 1. Header

### Goal

A phone web page that listens in short clips (15 s, or 25 s if MERaLiON needs two calls per clip) and shows one card per Singlish sentence (what was said, what it meant, one tone label). MERaLiON hears each clip and gives the exact transcript plus its own reading of meaning and tone of voice; OpenCode Go checks that reading against the conversation and writes the final card. Plain-English sentences show faded and word-for-word unchanged. It also has a landing page and an eval script. Everything runs on one Cloudflare Worker on the free plan, deployed to `*.workers.dev`.

### Architecture (short)

```
Phone (Safari / Chrome)                          Cloudflare Worker (free plan)
  AudioWorklet → raw PCM                           POST /api/chunk
  15/25 s clip → silent? drop
  → resample 16 kHz → WAV (PCM16 mono)  ──────────►  ├─ wavInfo: reject non-16 kHz-mono / >30 s, <0.5 s = silent
  one request in flight, in order                    ├─ hearClip: KV cache → guard (Durable Object: every MERaLiON call,
  cards rendered from ChunkResult  ◄──────────────   │     5/min + requests, audio, tokens per month)
  typed text → POST /api/text                        │     → MERaLiON: transcript + hint {meaning, tone, confidence}
                                                     │     └─ refused / error ─► Whisper: transcript only, hint null
                                                     ├─ interpret: OpenCode Go checks hint + context → validate
                                                     │     → unsure? retry with more context (typed text: no hint)
                                                     └─ enforceVerbatim → ChunkResult JSON (hint kept, never rendered)
```

- **MERaLiON is the main model for understanding Singlish speech** from the first spoken card (slice 3), in development, in demos and in production (MERaLiON-3 10B if the hosted API serves it). Per clip it returns the exact transcript **plus its own reading** (`hint`: meaning, tone of voice, confidence). Which form the API supports is settled at step 0 of slice 3:
  - `combined` (preferred): one chat call with the audio returns transcript and reading; 15 s clips.
  - `two_call`: the transcription endpoint for the exact words, then a chat call for the reading; 25 s clips so that 2 calls per clip stay under 5 a minute.
  - `transcript_only` (option A fallback, if audio chat isn't available): transcript only, no reading; 15 s clips.
- **OpenCode Go (course key) checks the reading and writes every card.** It gets the transcript, MERaLiON's reading and the previous sentences, overrules the reading when it doesn't fit, and must return a tone from the fixed list. MERaLiON's reading never reaches the screen on its own (PRD B4, US-11). Typed text goes to OpenCode Go alone.
- **Whisper on Workers AI is only the automatic fallback** (slice 4), used when the guard refuses or MERaLiON fails to give a transcript. OpenCode Go then works from the transcript alone, and the app shows "Backup mode". Nothing makes Whisper the default; the only explicit Whisper request is the eval runner's MERaLiON vs Whisper particle comparison (slice 6).
- **The phone does the audio work.** It captures raw PCM with an AudioWorklet and encodes 16 kHz mono WAV. This removes the Safari mp4 vs Chrome webm difference (R4) and keeps CPU off the Worker (10 ms CPU limit).
- **The Worker is a thin pipeline** of pure, injected steps: audio check → hear (MERaLiON) → interpret (OpenCode Go) → verbatim guard. IO functions take their dependencies (`fetchImpl`, `env`, `deps`) as arguments, so every decision is unit-tested in Node.
- **Shared state** lives in one Durable Object (rate guard and monthly budget) and one KV namespace (MERaLiON reply cache). Both ship in slice 3, together with the first MERaLiON call.
- **Client JS** lives in `src/client/*.js`. The Worker imports these files as text (wrangler `[[rules]] type = "Text"`) and serves them at `/client/<name>`. Node imports the same files as ES modules for tests. Only `src/client/app.js` touches the DOM.
- **Static assets (`public/`, Person C's).** `public/` is served as Cloudflare Workers static assets (`[assets] directory = "./public"`, added by A in slice 1). Asset requests are free and unlimited on the Workers free plan, don't run the Worker and use no Worker CPU. It is still the same single Worker deployment (PRD B1). Routing, checked against the wrangler 4 config schema (wrangler 4.158):
  - `run_worker_first = ["/app", "/api/*", "/client/*"]`: these paths always go to the Worker (`src/router.js`), even if a file with a matching name were ever put in `public/`.
  - Every other path is looked up in `public/` first: `/` → `public/index.html` (the default `html_handling = "auto-trailing-slash"` maps `/` to `index.html`), `/logo.svg`, `/logo-mark.svg`, `/manifest.webmanifest`, `/icon-180.png`. Content types come from the file extension (`.webmanifest` → `application/manifest+json`).
  - A path with no matching file falls through to the Worker (the default `not_found_handling = "none"`), and the router answers 404.
  - So the Worker serves only `/app`, `/client/*` and `/api/*`. It never imports or serves the landing page, logo, icon or manifest, and needs no `ASSETS` binding.

### Tech stack

- Cloudflare Workers, plain JavaScript ES modules, `wrangler@^4` (the only dev dependency). No runtime npm dependencies and no build step, as in Lunch Uncle (`/Users/zares/DSTA/thinkertanker/lunch-uncle`).
- Workers AI (`@cf/openai/whisper-large-v3-turbo`), Workers KV, a SQLite-backed Durable Object (the only kind the free plan allows).
- OpenCode Go (OpenAI-compatible chat completions) with the course key. MERaLiON (A*STAR) hosted API: `/v1/audio/transcriptions` and `/v1/chat/completions` with audio.
- Tests: `node --test` on Node v22.10, with Node's built-in coverage.

### Final repo layout (built up slice by slice)

```
package.json  package-lock.json  wrangler.toml  .gitignore  .dev.vars.example  CLAUDE.md  README.md   (Person A)
src/                  (Person A)
  index.js            # imports app.html, app.css and client files as text; export default createRouter(...); export { MeralionGuard }  (coverage-excluded)
  router.js           # createRouter(assets, handlers)  (all routing logic, testable)
  http.js  prompt.js  interpret.js  pipeline.js  audio.js  meralion.js  hear.js  whisper.js  guard.js
  pages/  app.html
  client/ app.js (DOM glue, coverage-excluded)  app.css  copy.js  api.js  queue.js  cards.js
          session.js  wav.js  clipper.js  mic.js  recorder-worklet.js
test/                 (Person A)
        *.test.js   helpers/wav.js (makeWav)   fixtures/ (slice 3 step 0: meralion-transcription.json, meralion-chat.json, meralion-error.json, r3-singlish.wav, r3-plain.wav)
public/               (Person C; Workers static assets)
        index.html (landing, served at /)  logo.svg  logo-mark.svg  icon-180.png (slice 8)  manifest.webmanifest (slice 8)
docs/presentation/    (Person C)  VideoPrompt.txt  video script, slide notes, link to the slides
evals/                (Person B)
        score.js  runner.js  cards-page.js  run.js (CLI, coverage-excluded)
        score.test.js  runner.test.js  cards-page.test.js  fixtures/*.json
        references.example.json  references.json  README.md  RESULTS.md
        clips/ (gitignored)  results/ (gitignored)
reports/  <agent-name>.jsonc  <agent-name>.md   r1-particles.md  r2-phone-in-meeting.md (Person B)
```

### npm scripts (exact)

Verified against `node --help` on v22.10.0: `--experimental-test-coverage`, `--test-coverage-lines`, `--test-coverage-branches`, `--test-coverage-functions`, `--test-coverage-include` and `--test-coverage-exclude` all exist. In a scratch project, a coverage miss made `npm run coverage` exit with code 1.

```json
"scripts": {
  "dev": "wrangler dev",
  "deploy": "wrangler deploy",
  "test": "node --test \"test/**/*.test.js\" \"evals/**/*.test.js\"",
  "coverage": "node --test --experimental-test-coverage --test-coverage-include=\"src/**/*.js\" --test-coverage-include=\"evals/**/*.js\" --test-coverage-exclude=\"src/index.js\" --test-coverage-exclude=\"src/client/app.js\" --test-coverage-exclude=\"evals/run.js\" --test-coverage-exclude=\"evals/**/*.test.js\" --test-coverage-lines=81 --test-coverage-branches=81 --test-coverage-functions=81 \"test/**/*.test.js\" \"evals/**/*.test.js\""
}
```

- Two test globs: A's tests in `test/`, Person B's in `evals/*.test.js` (Team split). Both are run by `npm test` and both count for coverage. `evals/**/*.test.js` is excluded from the coverage totals so B's test files don't count as covered code. `public/` holds no `.js` (C's pages have no scripts), so it is outside the coverage include on purpose.

- `npm test` runs the tests. `npm run coverage` runs them with coverage and **fails (exit 1) below 81% lines, branches or functions**. The threshold is 81, not 80, because Node passes at exactly the threshold and the PRD says *over* 80% (M4). Node prints an "ExperimentalWarning: glob" line; it is harmless.
- The thresholds apply to the totals across all included files. The reviewer also flags any single non-excluded file under 60% lines.
- If port 8787 is taken (it was during the earlier attempt), use `npx wrangler dev --port 8799`.

### Coverage exclusions (kept minimal) and why

| Excluded | Why | How the risk is covered instead |
|---|---|---|
| `src/index.js` | It imports `.html`, `.css`, `.svg` and client `.js` files as text through a wrangler rule. Node cannot import those, so tests cannot load this file. | It holds only imports, `export default createRouter(assets)` and `export { MeralionGuard }`. All routing is in `src/router.js` (tested). `test/config.test.js` reads `index.js` as text and checks the wiring (below). |
| `src/client/app.js` | Browser-only DOM glue: `document`, `getUserMedia`, `AudioContext`, `navigator.wakeLock`, events. | Rule for the engineer and reviewer: `app.js` makes no decisions. Every branch (what card to show, when to scroll, what an error means, when to show a banner) lives in a tested module (`cards.js`, `session.js`, `queue.js`, `mic.js`, `api.js`). Checked by hand in each slice's demo. |
| `evals/run.js` (Person B) | CLI wrapper: reads argv, files and env, makes real network calls. | All logic is in `evals/runner.js`, `evals/score.js` and `evals/cards-page.js` (tested with fakes and fixture JSON by B's `evals/*.test.js`). |
| `evals/**/*.test.js` (Person B) | B's test files, not code under test. | They are run by `npm test`; only the modules they test count. |
| HTML, CSS, SVG, the manifest (`src/pages/app.html`, `src/client/app.css`, everything in `public/`) | Not JavaScript, so Node coverage does not measure them. | `test/pages.test.js` reads them as text (C's files from `public/`) and asserts the required copy, links, tags and, in slice 8, the manifest JSON. |

**Files that are never imported are invisible to Node's coverage** (checked in a scratch project). So `test/all-modules.test.js` walks `src/` and `evals/` (an `evals/` that doesn't exist yet is fine), and dynamically imports every `.js` file except the three excluded ones and `*.test.js` files (importing a test file would run its tests twice). An untested module then shows up at 0% instead of being silently skipped. Before importing, it stubs `globalThis.registerProcessor` and `globalThis.AudioWorkletProcessor` so the worklet file can load.

### Configuration and secrets (who adds what, when)

Secrets come only from `env`: `.dev.vars` locally (gitignored) and `npx wrangler secret put <NAME>` for deploys. Never in code, `wrangler.toml` or any committed file (B7). **There are exactly two secrets: `OPENCODE_API_KEY` and `MERALION_API_KEY`.** There is no access code and no demo key: anyone with the public link can use the app (IR-13).

| Item | Kind | Added in | Value / note |
|---|---|---|---|
| `OPENCODE_API_KEY` | secret | Slice 1 | The course key. One of the two secrets, in `.dev.vars` at the project root. |
| `[[rules]] type = "Text"` | wrangler.toml | Slice 1 | `globs = ["**/*.html", "**/*.css", "**/client/*.js"]`, `fallthrough = false` (wrangler resolves rule globs relative to `src/`, so a `src/` prefix matches nothing; found in slice 1) (no `.svg`: the logo is a static asset now) |
| `[assets] directory = "./public"`, `run_worker_first = ["/app", "/api/*", "/client/*"]` | wrangler.toml | Slice 1 | Serves Person C's `public/` as static assets (routing in section 1). Added by A in slice 1 because `public/logo.svg` and `public/logo-mark.svg` are already committed; C needs nothing from A for it and just edits files in `public/`. |
| `MERALION_API_KEY` | secret | Slice 3 | The user's key (Q2). Put in `.dev.vars` by the user; the slice 3 engineer reads it from there for the R3 check. |
| `[[durable_objects.bindings]]` + `[[migrations]]` | wrangler.toml | Slice 3 | `name = "MERALION_GUARD"`, `class_name = "MeralionGuard"`; `tag = "v1"`, `new_sqlite_classes = ["MeralionGuard"]`. **Added in the same change as `export { MeralionGuard } from "./guard.js"` in `src/index.js`.** The guard ships with the first MERaLiON call. |
| `[[kv_namespaces]] binding = "CACHE"` | wrangler.toml | Slice 3 | Placeholder id in slice 3 (local dev accepts any id and needs no login); the real id from `npx wrangler kv namespace create CACHE` in slice 5, before the first deploy. |
| `[ai] binding = "AI"` | wrangler.toml | Slice 4 | The slice that adds the Whisper fallback. Workers AI always runs remotely, even in `wrangler dev`, so it needs `npx wrangler login`. |
| `[observability] enabled = true` | wrangler.toml | Slice 5 | Used to read CPU time per request in the dashboard. |

`compatibility_date = "2025-08-01"`, `name = "catch-no-ball"`, `main = "src/index.js"` (same as Lunch Uncle). There is **no** `FORCE_WHISPER` or other switch that makes Whisper the default (the earlier plan's development default is removed).

### MERaLiON quota (free tier: 5 requests/min, 1,000 requests/month, 1 hour of audio/month, 100k tokens/month)

**Every MERaLiON request is counted** by the guard, whatever it is for. Budget check for option B (matches the PRD's table):

| Mode (set at slice 3 step 0) | Calls per clip | `CLIP_SECONDS` | Calls a minute while listening | Fits 5/min? | Monthly audio counted | Notes |
|---|---|---|---|---|---|---|
| `combined` | 1 | 15 | 4 | Yes | 1× the speech | Preferred |
| `two_call` | 2 | 25 | 4.8 | Yes, barely; the reading call yields when only 1 slot is left (`HINT_SPARE_SLOTS = 1`), so some clips get no reading | 2× the speech (audio is sent on both calls) | Slower cards (R5) |
| `transcript_only` | 1 | 15 | 4 | Yes | 1× | Option A fallback |

Guard limits (PRD B3a: the whole free tier is usable, nothing is held back): 5 requests in any minute, and per calendar month (UTC) audio 3600 s, requests 1000, tokens 100,000, whichever runs out first. Past a limit the clip goes to Whisper and the app shows "Backup mode". Tokens per clip are measured at step 0; at about 240 clips a month, more than about 400 tokens per clip means tokens run out before audio, and step 0 flags it.

Development uses the same quota as the evals and the demo. Practice for every engineer and for the user:
- **Unit tests never call MERaLiON.** They use fakes; `test/meralion.test.js` replaces `globalThis.fetch` with one that throws, so an accidental real call fails the test run.
- **Interpretation and prompt work uses the typed-text path** (`/api/text`), which spends no MERaLiON quota. (A typed line has no MERaLiON reading; to test the hint path, use the saved step-0 chat fixture in unit tests.)
- **Short test clips:** say one sentence and tap Stop (the partial clip is sent), about 3–5 s instead of 15–25 s. For curl smoke tests use the step-0 `say` samples (about 3 s each).
- **Cache on:** re-sending the same WAV is served from KV (`cached: true`, transcript and reading) and costs nothing, so repeat curl tests and eval re-runs reuse saved clips.
- **Watch the counter:** `GET /api/budget` shows requests, audio seconds and tokens used. Each slice's engineer report records its MERaLiON spend. Planned spend (guess, counted audio): slice 3 under 2 min (plus step 0, about 20 s), slice 4 under 1 min, slice 5 under 2 min, slice 6 about 2 min per MERaLiON run (4 in `two_call`), rehearsals about 8 min: about 19 min and under 250 requests of the 60 min / 1,000 requests.
- The local guard (`.wrangler/state`) and the deployed guard count separately, while MERaLiON's quota is one account-wide pool (IR-7). Never delete `.wrangler/state`, and add local usage from the engineer reports when judging what is left.

### Pitfalls found in the earlier attempt (baked into the slices)

1. **A Durable Object binding plus `[[migrations]]` breaks `wrangler dev` unless `src/index.js` exports the class.** Slice 3 adds the binding, the migration and the export together. `test/config.test.js` fails if `wrangler.toml` mentions `MeralionGuard` but `src/index.js` does not export it.
2. **Add `[[kv_namespaces]]` and `[ai]` only in the slice that first uses them** (KV in slice 3, AI in slice 4).
3. **Tested code must not import `.html` files or `"cloudflare:workers"`.** Logic lives in importable modules. `MeralionGuard` is a plain class with `constructor(ctx, env)` and `fetch(request)`, not `extends DurableObject`.
4. **Client JS is served as text and unit-tested in Node.** `src/client/*.js` uses relative imports (`./wav.js`). These resolve to `/client/wav.js` in the browser and to the file in Node. `index.js` imports each client file as text into a `client` map. `test/config.test.js` checks that every file in `src/client/` is imported in `index.js`, so a new file never 404s in the browser.
5. **Raw PCM via AudioWorklet, 16 kHz mono WAV encoded on the phone.** No `MediaRecorder`.
6. **Interpreter normalisation:** a plain-English sentence becomes `confident: true`, `readings: []`, `tone: "neutral"`, `meaning: ""`, `terms: []`, whatever the model said. Otherwise a stray `confident: false` on plain English triggers a needless retry. `context` that is `null`, not an array, or holds non-strings becomes `[]` / is filtered.
7. **One test helper for WAVs:** `test/helpers/wav.js` exports `makeWav(seconds, { sampleRate = 16000, channels = 1, fill = 0 } = {})`. Used by server and client tests. It is outside the test glob, so it is not run as a test file.
8. **A static asset can shadow a Worker route.** With `[assets]`, a file in `public/` whose path matches a request is served instead of the Worker (for example a stray `public/app.html` would replace the app at `/app`). `run_worker_first = ["/app", "/api/*", "/client/*"]` sends those paths to the Worker first, and `test/config.test.js` also fails if `public/` contains `app`, `app.html`, `app/`, `api/` or `client/`. The Worker never imports anything from `public/`.

### Shared contracts (later slices depend on these exact shapes)

```js
// Tone: one of TONES, exactly, in this order:
TONES = ["firm", "reluctant", "doubtful", "joking", "casual", "neutral"]

Sentence = {
  said: string,          // exact span of the transcript where it can be found (enforceVerbatim)
  hasSinglish: boolean,
  meaning: string,       // "" when hasSinglish is false
  tone: Tone,            // "neutral" when hasSinglish is false
  confident: boolean,    // always true when hasSinglish is false
  readings: Array<{ meaning: string, tone: Tone }>,  // [] when confident; exactly 2 after the retry pass
  terms: Array<{ term: string, gloss: string, known: boolean }>  // [] when hasSinglish is false
}

// MERaLiON's own reading of a clip (option B). Unchecked: an input to OpenCode Go only, never rendered.
Hint = {
  meaning: string,       // trimmed, at most 300 characters ("" allowed)
  tone: string,          // lower-case free text, at most 30 characters; NOT forced into TONES here
  confidence: number | null  // 0..1, or null if MERaLiON gave none
}

ChunkResult = {
  status: "ok" | "silent" | "uncaught" | "meaning_unavailable",
  source: "text" | "whisper" | "meralion",
  transcript: string,    // "" for silent; the transcript for meaning_unavailable
  sentences: Sentence[], // [] unless status is "ok"
  passes: 0 | 1 | 2,     // OpenCode Go calls made for this result
  cached: boolean,       // MERaLiON/Whisper reply served from KV (false for typed text)
  hint: Hint | null      // MERaLiON's reading as sent to OpenCode Go; null for text, Whisper, transcript_only or a skipped reading. For evals; never rendered.
}

// The OpenCode Go step (slice 1; hint added in slice 3):
interpret({ transcript, context, sessionId, hint = null }, env, fetchImpl) -> Promise<{ sentences: Sentence[], passes: number }>
```

| Endpoint | Slice | Request | Responses |
|---|---|---|---|
| `POST /api/text` | 1 | JSON `{ text, sessionId, context: string[] }` | 200 `ChunkResult` (`source: "text"`) · 400 `{ error: "bad_text" }` |
| `POST /api/chunk` | 3 | multipart `audio` (WAV), `sessionId`, `context` (JSON `string[]`); header `x-asr: whisper` (slice 4; eval runner only, never sent by the app) | 200 `ChunkResult` · 400 `{ error: "bad_audio" }` · 413 `{ error: "too_long" }` |
| `GET /api/budget` | 3 | — | 200 `{ month, used: { seconds, requests, tokens }, limits: { seconds: 3600, requests: 1000, tokens: 100000 }, recentRequests }` |

There is no authentication on `/api/*`: anyone with the link can call it (accepted by the user, IR-13). The only protection of MERaLiON's quota is the guard (5 a minute plus the monthly limits), which `/api/chunk` passes before every MERaLiON call; `/api/text` and OpenCode Go have no limit of their own (IR-4). All API responses send `cache-control: no-store`. Unknown paths return 404.

### Constants (exact values from the PRD and decisions)

| Constant | Value | File |
|---|---|---|
| `TONES` | as above | `src/prompt.js` |
| `SETTING` | `"Office meeting"` (A1), with the hint that "confirm" means "definitely" | `src/prompt.js` |
| `OPENCODE_BASE_URL` / `OPENCODE_MODEL` | `"https://opencode.ai/inference/go/v1"` / `"deepseek-v4.1-flash"` | `src/interpret.js` |
| `USER_AGENT` | `"CatchNoBall/1.0"`; every call also sends `x-opencode-session: <sessionId>` | `src/interpret.js` |
| `INTERPRET_TIMEOUT_MS` | `20000` | `src/interpret.js` |
| `MAX_TEXT_CHARS` | `1000` **(my call)** | `src/pipeline.js` |
| `MIN_CLIP_SECONDS` / `MAX_CLIP_SECONDS` / `REQUIRED_SAMPLE_RATE` | `0.5` / `30` / `16000` | `src/audio.js` |
| `WHISPER_MODEL` | `"@cf/openai/whisper-large-v3-turbo"` | `src/whisper.js` |
| `MERALION_BASE` / `MERALION_TIMEOUT_MS` | `"https://api.meralion.ai/v1"` / `20000` | `src/meralion.js` |
| `MERALION_MODEL` / `MERALION_MODE` | the model id served (MERaLiON-3 10B wanted) / `"combined"`, `"two_call"` or `"transcript_only"`, both set from slice 3 step 0 | `src/meralion.js` |
| `CACHE_TTL_SECONDS` | `604800` (7 days) | `src/hear.js` |
| `RATE_LIMIT_PER_MIN` / `RATE_WINDOW_MS` / `HINT_SPARE_SLOTS` | `5` / `60000` / `1` | `src/guard.js` |
| `LIMITS` | `{ seconds: 3600, requests: 1000, tokens: 100000 }` (the full free tier per calendar month, UTC) | `src/guard.js` |
| `CLIP_SECONDS` | `15` (`combined`, `transcript_only`) or `25` (`two_call`) | `src/client/clipper.js` |
| `SILENCE_RMS` | `0.01` | `src/client/wav.js` |
| `CONTEXT_KEEP` | `3` | `src/client/session.js` |
| `RETRY_MS` | `3000` | `src/client/queue.js` |
| `EVAL_MERALION_GAP_MS` | `13000` per MERaLiON call (so 13 s or 26 s between clips; keeps under 5 a minute) | `evals/runner.js` (Person B) |

### User-facing copy (exact; in `src/client/copy.js` as `COPY`, asserted by `test/copy.test.js`)

| Key | Text | Story |
|---|---|---|
| `translating` | `Translating` | US-3 |
| `tellTable` | `Let the table know you're using a translator` | US-3 |
| `uncaught` | `Couldn't catch that` | US-7 |
| `unavailable` | `Meaning unavailable, tap to retry` | US-11 |
| `couldMean` / `or` | `Could mean:` / `or` | US-6 |
| `reconnecting` | `Subtitles paused, reconnecting` | US-9 |
| `missed` | `Missed some speech while offline` | US-9 |
| `backup` | `Backup mode` | US-10 |
| `cantListen` | `This browser can't listen. Type instead.` | US-8 |
| `micBlocked` | `The microphone is blocked. iPhone Safari: tap aA, then Website Settings, then Microphone: Allow. Android Chrome: tap the icon left of the address, then Permissions, then Microphone: Allow. Or type below.` **(my call: wording)** | US-8 |
| `newToMe` / `learnMore` | `New to me` / `Learn more` | US-14 |
| landing tagline (in Person C's `public/index.html`) | `For when you catch no ball.` | US-1 |
| landing privacy line (in Person C's `public/index.html`) | `Audio is sent to A*STAR's MERaLiON service to be transcribed and understood, and is never stored by us.` | L1 |

---

## 2. How each slice is run (stated once)

Every slice follows the same loop. Subagents work only in the repo's worktree, never use `git stash`, and **never commit or push**: the controller commits to the slice's own branch `a/slice-<n>-<name>` and, after the user OKs the slice, merges it into `main` through a PR (docs-only changes may go to `main` directly).

1. **Build (implementation subagent, a senior software engineer).** Name: `slice-N-engineer`. Input: this file's header (section 1) plus the slice's section, `PRD.md`, `decisions.md`. Works **test-first**: write the slice's tests, run `npm test` and see them fail for the right reason, implement, see them pass. Then:
   - run `npm run coverage` (must exit 0);
   - start `npx wrangler dev` and walk the slice's demo script as far as possible without a phone or a human voice (curl, desktop browser);
   - write `./reports/slice-N-engineer.jsonc` (status updates, format below) and `./reports/slice-N-engineer.md` (final report: what was built, the red and green test runs, the coverage totals, what was walked in the demo, deviations from this plan with reasons, open concerns).
2. **Review (fresh-context code-review subagent).** Name: `slice-N-reviewer`. It does not see the engineer's conversation. Input: the diff (`git diff HEAD` plus untracked files), the slice's section of this plan, the PRD stories it delivers. It checks:
   - spec: every acceptance criterion and exact value in the slice;
   - tests: they assert behaviour, cover the edge cases listed, and use the PRD's exact values;
   - the pitfalls list above; `app.js` contains no untested decisions;
   - security: no secrets in code or config, HTML escaping of model output, every MERaLiON call goes through the guard;
   - conventions: no runtime dependencies, no build step;
   - `npm test` and `npm run coverage` actually pass when it runs them.
   Findings are graded **Critical / Important / Minor** in `./reports/slice-N-reviewer.jsonc` and `./reports/slice-N-reviewer.md`.
3. **Fix.** The engineer (continued with its context, or a new `slice-N-engineer-fix` given both reports) fixes every Critical and Important finding, fixes Minors or says why not, re-runs tests and coverage, and adds a "Review response" section to its `.md`. If a Critical finding needed a design change, the reviewer re-checks just that change.
4. **Show the user.** The controller gives the user the slice's demo script. The user tries it (browser, then both phones, iPhone Safari and Android Chrome, from slice 5 on) and gives feedback. The controller records it in `./reports/slice-N-feedback.md`. Small feedback is fixed in this slice (back to step 3). Bigger feedback becomes a note on a later slice.
5. **Merge and continue.** After the user's OK, the controller merges `main` into the slice branch, re-runs `npm test` and `npm run coverage`, opens the PR to `main`, merges it and pushes `main`. **The next slice starts only after this feedback.**

Persons B and C don't run this loop themselves: their PRs are reviewed and merged by A (see Team split), after `npm test` and `npm run coverage` pass on the PR branch merged with `main`. The slices that consume their work check it: slice 5 (C's `public/` landing page, via `test/pages.test.js`), slice 6 (B's `evals/` PR: A's controller runs the fresh-context `slice-6-reviewer` on B's diff, B fixes the findings on their branch, then A merges) and slice 8 (C's manifest and icon).

**Status file format** (decisions.md): `./reports/<name>.jsonc` is a JSONC array of `{ "time": ISO-8601, "step": string, "status": "started" | "progress" | "done" | "blocked", "note": string }`, `//` comments allowed. Create it when starting; rewrite the array at each meaningful step.

**Standard Definition of done** (every slice's DoD includes this, plus its own items):
- [ ] `npm test` passes; `npm run coverage` exits 0 (over 80% lines, branches and functions).
- [ ] `npx wrangler dev` starts with no errors and the slice's routes answer.
- [ ] Every Critical and Important finding from `slice-N-reviewer` is addressed and recorded.
- [ ] The user has tried the demo script and their feedback is recorded in `reports/slice-N-feedback.md`.
- [ ] No secrets in the diff; `.dev.vars.example` lists every new env name with an empty value.
- [ ] From slice 3 on: the MERaLiON seconds spent in the slice (from `/api/budget`) are in the engineer report.

---

## 3. Day-0 / day-1 checks

These run before or alongside slice 1, except R3, which the slice 3 engineer runs as that slice's first step. The owner column follows the Team split. Each row says which slice it blocks.

| # | Check (owner) | When | How | Pass | Blocks |
|---|---|---|---|---|---|
| D1 | **Keys** (A) | Day 0 | Put the only two secrets, `OPENCODE_API_KEY` and `MERALION_API_KEY`, in `.dev.vars` at the project root (gitignored). | — | `OPENCODE_API_KEY` blocks **slice 1**. `MERALION_API_KEY` blocks **slice 3**. |
| D1b | **Cloudflare login** (A) | By day 2 | Run `npx wrangler login` and register a `workers.dev` subdomain in the Cloudflare dashboard (free). | `npx wrangler whoami` shows the account. | **Slice 4** (Workers AI fallback needs login, even locally) and **slice 5** (deploy). |
| R1 | **Particle test** (B) | Day 1 | Record 5 office Singlish clips in the MERaLiON playground (studio.meralion.ai) and count how many keep lah / lor / meh / siam. Also note whether the playground's own description of the tone matches what was meant (an early look at option B). | 4 of 5 keep the particles. | **Nothing.** MERaLiON stays either way (user decision). The result goes in `reports/r1-particles.md` and the presentation. If it fails, the slice 2 prompt's "infer tone from wording and context when particles seem missing" line is what we rely on. |
| R3 + R9 + R10 | **MERaLiON check** (A, run by the slice 3 engineer) | Start of slice 3 | Step 0 of slice 3, with the user's key from `.dev.vars`: which models are served (MERaLiON-3 10B?), the transcription request/response, whether chat/completions accepts audio and its request/response shape, tokens per clip, the error shape. At most 8 requests, about 20 s of audio. The user only needs the key in place. | Mode decided: `combined`, `two_call` or `transcript_only` (option A). | **Slice 3** cannot build any MERaLiON code until it is done. Output: fixtures and `reports/r3-meralion-format.md`. Slices 1–2 are not blocked. |
| R2 | **Phone-in-meeting test** (B) (the brief's riskiest bet) | Day 1–2 | The brief's 3-minute mock meeting with 3–5 non-Singaporean classmates, translations typed into a shared doc they follow on their phones. | 3 of 5 would use it during or right after, and at most 1 finds it too awkward. | **Slice 3's demo** (live vs recap). If most say "only after", slice 3 holds cards and shows them all at Stop (recap). Same pipeline; only `app.js` changes. Slices 1–2 are not blocked. |
| D2 | **Eval clips and references** (B) | Day 2–4 | Singaporean teammates record the 10 E1 Singlish sentences (at least 2 deliberately ambiguous, e.g. "can meh" vs "can lor") and 5 plain-English office sentences, with the intended tone of voice and with consent to send them to MERaLiON and Cloudflare. A Singaporean teammate writes `evals/references.json` in the Team split schema. | 15 WAVs plus `references.json` passing `node evals/run.js --check`. | **Slice 6's run** (not its build). |
| D2b | **Eval scripts** (B) | Day 1–4 | Build `evals/score.js`, `runner.js`, `cards-page.js`, `run.js` and their tests against the Team split contract, with fixture JSON (no running app, no keys). Uses A's slice 1–3 modules from `main` as they land. | `npm test` and `npm run coverage` pass on B's branch merged with `main`; PR open by day 4. | **Slice 6** (A reviews and merges it there). |
| D3 | **E1 participants** (B) | Book by day 3 | 3–5 non-Singaporean classmates for day 5–6. | — | E1 itself (after slice 6). |
| D4 | **Landing page** (C) (the logo and icon mark are already in `public/`) | Day 1–3 | Per the Team split contract, in `public/index.html`; preview with any static server. | `node --test test/pages.test.js` passes on C's branch (once slice 1 is on `main`). | **Slice 5's demo and deploy** (slice 5 can build without it; `/` 404s until it lands). |
| D5 | **Manifest and icon** (C) | By day 6, only if slice 8 is planned | `public/manifest.webmanifest`, `public/icon-180.png` and the three `<head>` tags in `public/index.html`, per the contract. | `node --test test/pages.test.js` passes. | **Slice 8** only. |

---

## 4. Slice overview

| Slice | Delivers | Shows the user | Suggested day |
|---|---|---|---|
| 1 | US-4 (typed), US-5, US-8 (typed box), US-11 | Type a Singlish line in the browser, get a card; plain English shows faded | Day 1 |
| 2 | US-6 (+ B5 context) | Ambiguous lines show "Could mean: … or …" | Day 1–2 |
| 3 | US-3, US-4 (speech), US-7, US-8 (mic blocked); B2, B3, B3a, B4 (hint), B6 | Step 0 decides the MERaLiON mode; tap Listen on the laptop, speak, MERaLiON's transcript and reading → OpenCode Go → card; `/api/budget` shows the spend | Day 2 |
| 4 | US-10 (B2a) | Break the MERaLiON key or hit 5 a minute: Whisper takes over, cards from the transcript alone, "Backup mode" shows | Day 3 |
| 5 | US-1, deploy (goal 4); consumes C's `public/` (landing page, logo) | Landing page and the live app on your iPhone (Safari) and Android (Chrome) | Day 3 |
| 6 | US-13 (E2, feeds E1); consumes B's `evals/` PR (eval code and tests), clips and references; A integrates and reviews | One command prints the score table (incl. MERaLiON's tone vs the final card's), the particle comparison and the E1 cards page | Day 4–5 |
| 7 | US-9 | Go offline mid-listen: banner, cards stay, auto-resume, "Missed some speech" | Day 5 |
| 8 (Should, optional) | US-14, US-15; consumes C's manifest and icon in `public/` | Tap a term for its gloss; add the app to the home screen | Day 7 |

Order rationale: slice 1 needs only the OpenCode key, so it is demoable on day 1. Speech arrives with MERaLiON from the start (slice 3, user decision), so the rate guard, the budget counter and the cache ship in that same slice to protect the free quota; slice 3 begins with the MERaLiON check that picks the option B mode (or the option A fallback). Whisper comes next and only as the fallback (slice 4). Deploying in slice 5 makes every later slice testable on both phones over HTTPS. Evals (slice 6) come before the offline banner (slice 7), because E1 on day 5–6 needs the prepared cards and the clips are a dependency outside our control.

Who codes what, in parallel: A builds slices 1–4 and 7 and the Worker/deploy half of 5 and 8 in order. From day 1, B builds the eval code (slice 6's code) on fixtures and C builds the landing page in `public/`; neither waits for A's slices except to import or test against what is already on `main` (Team split). A's slice 5 and 6 rounds are mostly integration: deploying C's pages, and reviewing, merging and running B's evals.

Each slice keeps its own feedback round. If time runs short, drop the optional last slice first; nothing should be merged.

---

## 5. Slices

### Slice 1: Type a line, get a card

**Stories:** US-4 (card layout and order, from typed text), US-5 (plain English faded and unchanged), US-8 (always-available text box; mic part in slice 3), US-11 (meaning unavailable, tap to retry).
**Depends on:** D1 keys. **User provides:** `OPENCODE_API_KEY` in `.dev.vars` (project root).

**Demo script (feedback checkpoint)**
1. `npm install`, `cp .dev.vars.example .dev.vars`, fill in `OPENCODE_API_KEY`, `npm run dev`. Open `http://localhost:8787/app` in Chrome with device toolbar at 375×812.
2. Type `Eh the deadline confirm cannot shift one lah`: a card shows the sentence with *confirm* and *lah* underlined, a one-line meaning, and the tone chip **firm**.
3. Type `Let's move on to the next agenda item.`: one faded line with exactly those words, no meaning, no tone.
4. Type six more lines. The newest is at the bottom and the page scrolls to it. Scroll up, type another: the page does not jump.
5. Put a wrong `OPENCODE_API_KEY` in `.dev.vars`, restart, type a line: the typed text with "Meaning unavailable, tap to retry". Fix the key, restart, tap the card: it becomes a normal card in place.
6. `curl -s -X POST localhost:8787/api/text -d '{"text":""}'` prints `{"error":"bad_text"}`.
7. Toggle the OS to dark mode: the page follows.
8. Open `localhost:8787/logo.svg`: the logo, served from `public/` as a static asset (the tab shows the icon mark). Open `localhost:8787/`: Person C's landing page if their PR has merged, otherwise a 404 (there is no landing placeholder; `public/` serves `/`).
*Feedback wanted:* Is the card readable at a glance? Is the tone chip clear? Is the faded plain line faded enough? (Ambiguous lines may still show one guess until slice 2.)

**Files**
- Create: `package.json` (scripts exactly as in section 1, including the `evals/**/*.test.js` glob), `wrangler.toml` (the Text rule and the `[assets]` block with `run_worker_first` from the config table; no bindings), `.dev.vars.example`, `CLAUDE.md` (Lunch Uncle's conventions: IO vs pure split, test the pure part, secrets from env only, `npm test` and `npm run coverage` before handing over, no runtime deps; plus, from slice 3 on, the MERaLiON development practice from section 1), `src/index.js`, `src/router.js`, `src/http.js`, `src/prompt.js`, `src/interpret.js`, `src/pipeline.js`, `src/pages/app.html` (with `<link rel="icon" href="/logo-mark.svg">`), `src/client/app.js`, `src/client/app.css`, `src/client/copy.js`, `src/client/api.js`, `src/client/queue.js`, `src/client/cards.js`.
- Check (already committed): `.gitignore` lists `node_modules/`, `.wrangler/`, `.dev.vars`, `.DS_Store`, `evals/clips/`, `evals/results/`; edit only if something is missing. Do **not** create anything in `public/` (Person C's); `public/logo.svg` and `public/logo-mark.svg` are already there.
- Tests: `test/router.test.js`, `test/prompt.test.js`, `test/interpret.test.js`, `test/verbatim.test.js`, `test/pipeline-text.test.js`, `test/cards.test.js`, `test/api.test.js`, `test/queue.test.js`, `test/copy.test.js`, `test/pages.test.js`, `test/config.test.js`, `test/all-modules.test.js`.

**Interfaces produced** (later slices depend on these)
- `src/http.js`: `json(data, status = 200, headers = {}) -> Response` (adds `content-type: application/json` and `cache-control: no-store`); `asset(body, contentType) -> Response`.
- `src/router.js`: `createRouter(assets, handlers) -> { fetch(request, env, ctx) }`
  - `assets = { app: string, client: Record<string, string> }` (no landing page, logo, icon or manifest: those are static assets in `public/`, served before the Worker runs)
  - `handlers = { handleText, handleChunk?, handleBudget? }`, each `(request, env) -> Promise<Response>`
  - Routes: `GET /app`, `GET /client/<name>` (`.js` as `text/javascript; charset=utf-8`, `.css` as `text/css; charset=utf-8`, unknown name 404), `POST /api/text` (slice 3 adds `POST /api/chunk` and `GET /api/budget`). No route checks a code or key. Everything else 404 (including `/` when `public/index.html` doesn't exist yet: static assets answer first, and only unmatched paths reach the Worker).
- `src/prompt.js`: `TONES`, `SETTING`, `buildMessages({ transcript, context = [], retry = false }) -> Array<{ role, content }>` (slice 3 adds `hint = null`) (a system message and a user message).
- `src/interpret.js`:
  - `class InterpretError extends Error`
  - `parseInterpretation(raw: string, { requireReadings = false } = {}) -> { sentences: Sentence[] }` (throws `InterpretError`)
  - `verbatimSpan(transcript: string, said: string) -> string | null`
  - `enforceVerbatim(transcript: string, sentences: Sentence[]) -> Sentence[]`
  - `interpret({ transcript, context, sessionId }, env, fetchImpl = fetch) -> Promise<{ sentences: Sentence[], passes: number }>` (slice 3 adds `hint = null`) (slice 1: always one pass)
- `src/pipeline.js`: `handleText(request, env, deps = { interpret }) -> Promise<Response>` returning a `ChunkResult`.
- `src/client/copy.js`: `COPY` (table in section 1).
- `src/client/api.js`:
  - `class ApiError extends Error` with `kind: "network" | "bad_request" | "server"` and `status: number | null`
  - `createApi({ fetchImpl, base = "" }) -> { sendText({ text, sessionId, context }): Promise<ChunkResult> }` (slice 3 adds `sendClip` and `budget`). The client holds no code or key and sends no auth header. A rejected fetch throws kind `network`; 4xx `bad_request`; 5xx `server`.
- `src/client/queue.js`: `createClipQueue({ send, onResult }) -> { push(item), size(), idle(): Promise<void> }`
  - Items are sent **one at a time, in push order**. `onResult(item, result, error)` for item n is called **before** `send` for item n+1 starts, so the next request sees updated context.
  - `item` is `{ kind: "text", text, replaces?: cardId }` now; slice 3 adds `{ kind: "clip", wav }`.
  - Slice 7 adds `onStatus`, `onMissed`, `probe`, `retryMs`, `sleep` (same function, extra options).
- `src/client/cards.js`:
  - `escapeHtml(s) -> string`
  - `markTerms(said, terms) -> string` (escaped HTML with `<u class="term" data-term="…">` around each term)
  - `toCardModels(result: ChunkResult) -> CardModel[]` where `CardModel` is one of `{ kind: "singlish", said, termsHtml, meaning, tone }`, `{ kind: "plain", text }`, `{ kind: "unavailable", transcript }`; slice 2 adds `unsure`, slice 3 `uncaught`, slice 7 `notice`.
  - `cardHtml(model, id) -> string`
  - `shouldAutoScroll({ scrollTop, clientHeight, scrollHeight }, slackPx = 48) -> boolean`

**Algorithms that are not obvious**
- `parseInterpretation`: strip a ```` ```json ```` fence if present; take the text from the first `{` to the last `}`; `JSON.parse`. Require a non-empty `sentences` array. Each sentence needs a non-empty string `said` and a boolean `hasSinglish`. If `hasSinglish` is false, normalise (pitfall 6) and ignore every other field. If true: `meaning` non-empty string, `tone` in `TONES`, `confident` boolean; `readings` and `terms` default to `[]` when missing but must have the right types when present; `readings` keeps at most the first 2, each with a non-empty `meaning` and a `tone` in `TONES`; `confident: true` clears `readings`; `terms` items need a non-empty `term`, a string `gloss` and a boolean `known` (defaults to `true` when missing). Extra fields are dropped. `requireReadings: true` (slice 2) also requires exactly 2 readings on every unsure Singlish sentence. Any violation throws `InterpretError`.
- `verbatimSpan(transcript, said)`: tokenise both with `/[\p{L}\p{N}']+/gu`, keeping each transcript token's start and end offsets. Compare tokens lower-cased, with curly apostrophes folded to `'`. Find the first contiguous run of transcript tokens equal to `said`'s tokens. Return `transcript.slice(startOfFirst, endOfLast)` extended over trailing punctuation up to the next whitespace. Return `null` if there is no run or `said` has no tokens.
- `enforceVerbatim(transcript, sentences)` (**the M2 guard, my call**):
  - If no sentence has Singlish, return one plain sentence whose `said` is `transcript.trim()`. A fully plain clip always shows the transcript exactly.
  - Otherwise, each sentence's `said` becomes `verbatimSpan(transcript, said)` when found. A **plain** sentence that cannot be found verbatim is **dropped** (it was reworded; the user can follow plain English anyway). A Singlish sentence that cannot be found keeps the model's `said`.
- `markTerms(said, terms)`: match each term as a whole word, case-insensitive, on the **raw** text; longer terms first; no overlaps. Then escape each segment and wrap the matches. Never build HTML before escaping.
- `interpret` request: `POST ${OPENCODE_BASE_URL}/chat/completions` with headers `content-type: application/json`, `authorization: Bearer ${env.OPENCODE_API_KEY}`, `x-opencode-session: <sessionId>`, `user-agent: CatchNoBall/1.0`; body `{ model: OPENCODE_MODEL, messages, temperature: 0.2 }`; `signal: AbortSignal.timeout(20000)`. Do not send `response_format` unless it is checked to work; the parser already tolerates fences and prose. Reply content is `choices[0].message.content`. A non-2xx, a rejected fetch, a timeout or a bad reply all throw `InterpretError`. `context` that is not an array becomes `[]`; non-strings are filtered out; the first pass uses `context.slice(-1)` (B5).
- System prompt (`buildMessages`) must: say the user is a newcomer at a Singapore office, in the setting `Office meeting`, where "confirm" means "definitely"; ask for JSON only in the `{ sentences: Sentence[] }` shape; split the transcript into sentences and **copy each `said` verbatim from the transcript**; mark plain-English sentences `hasSinglish: false` and never reword them; keep `meaning` to one short sentence; restrict `tone` to `TONES`; list Singlish terms (particles included) with a short gloss, `known: false` for unrecognised ones; and say: "If particles seem missing, infer tone from wording and context. Never guess confidently. Use confident:false." The user message holds the context lines labelled `Earlier:` and then the transcript labelled `Transcript:`.
- `handleText`: parse the JSON body (invalid → 400 `bad_text`); `text` must be a string that is non-empty after trimming and at most 1000 characters (else 400 `bad_text`); `sessionId` must be a string of at most 100 characters, else a new `crypto.randomUUID()`. On success: `{ status: "ok", source: "text", transcript: text.trim(), sentences, passes, cached: false }`. If `interpret` throws: `{ status: "meaning_unavailable", source: "text", transcript, sentences: [], passes: 1, cached: false }`.

**Tests** (key assertions)
- `test/router.test.js` (fake assets, spy handlers)
  - `GET /app serves the app page as text/html`; `GET / → 404 from the router` (in production `/` is answered by `public/index.html` before the Worker runs; the router never serves a landing page).
  - `GET /client/app.js is served as text/javascript`; `GET /client/app.css as text/css`; `GET /client/nope.js → 404`.
  - `POST /api/text calls the text handler; no header is needed`.
  - `GET /api/text → 404`; `GET /nowhere → 404`.
  - `API responses carry cache-control: no-store`.
- `test/prompt.test.js`
  - `TONES is exactly firm, reluctant, doubtful, joking, casual, neutral` (deepEqual, in order).
  - `system prompt names every tone, Office meeting, JSON only, verbatim said, never reword plain English, confident:false rule`.
  - `user message includes Earlier: context lines then the transcript`; `context [] omits Earlier:`; `context null does not throw`.
- `test/interpret.test.js` (helper `ok(overrides)` builds one valid reply string)
  - `parses a plain JSON reply` → `tone === "firm"`.
  - `strips a json fence and surrounding prose` → 1 sentence.
  - `rejects a tone outside TONES` (`"angry"`) → throws `InterpretError`.
  - `rejects missing said or hasSinglish`; `rejects an empty sentences array`; `rejects non-JSON`.
  - `plain-English sentences are normalised`: input `hasSinglish:false, tone:"firm", meaning:"x", confident:false, readings:[…], terms:[…]` → `tone "neutral", meaning "", confident true, readings [], terms []`.
  - `keeps at most 2 readings`; `confident true clears readings`; `term known defaults to true`; `drops extra fields`.
  - `interpret sends the session id, user-agent, bearer key and model`: `x-opencode-session === "sess-1"`, `user-agent === "CatchNoBall/1.0"`, `authorization === "Bearer k"`, body `model === "deepseek-v4.1-flash"`, URL `https://opencode.ai/inference/go/v1/chat/completions`.
  - `interpret sends only the last context sentence on the first pass`: context `["s1","s2"]` → user message matches `/s2/`, not `/s1/`.
  - `interpret treats context null or non-array as []`.
  - `non-2xx, rejected fetch and malformed reply all throw InterpretError`.
  - `interpret returns passes 1 for a confident reply`.
- `test/verbatim.test.js`
  - `verbatimSpan returns the exact transcript span`: transcript `"OK. Let's move on to the next item, can?"`, said `"lets move on to the next item"` → `null` (apostrophe matters); said `"let's move on to the next item"` → `"Let's move on to the next item,"`.
  - `verbatimSpan folds curly apostrophes and case`; `returns null when not found or said is empty`.
  - `an all-plain clip becomes one plain sentence equal to transcript.trim()`, even if the model split it in two or reworded it.
  - `a reworded plain sentence in a mixed clip is dropped`; `a matching plain sentence takes the transcript's exact span`; `an unmatched Singlish sentence keeps the model's said`.
- `test/pipeline-text.test.js` (fake `interpret`)
  - `happy path returns status ok, source text, trimmed transcript, sentences, passes, cached false`.
  - `empty, whitespace-only and 1001-character text → 400 bad_text`; `exactly 1000 characters is accepted`; `invalid JSON body → 400 bad_text`.
  - `interpret throwing → status meaning_unavailable with the transcript and no sentences` (US-11).
  - `context and sessionId are passed through; non-array context becomes []; a missing sessionId gets a UUID`.
- `test/cards.test.js`
  - `escapeHtml escapes & < > " '`.
  - `markTerms underlines lah as a whole word, case-insensitive, not inside lahat`; `prefers the longer term when terms overlap`; `escapes model text: <img src=x onerror=alert(1)> stays inert`.
  - `a Singlish sentence becomes a singlish card with meaning and tone`.
  - **M2:** `a plain sentence becomes one plain card whose text is exactly the sentence's said`; `cardHtml for a plain card has class plain and contains no meaning, tone or term elements`.
  - **M2:** `a plain sentence that still carries a meaning is shown without it` (feed a hand-built sentence with `hasSinglish:false, meaning:"x"`; the view ignores `meaning`).
  - `meaning_unavailable becomes an unavailable card with the transcript and "Meaning unavailable, tap to retry"`; `silent becomes no cards`.
  - `the tone chip shows the tone word as text, not colour only`.
  - `shouldAutoScroll is true within 48 px of the bottom and false when scrolled further up`.
- `test/api.test.js`: `sendText posts JSON to /api/text and returns the ChunkResult`; `sends no auth header`; `rejected fetch → kind network`; `400 → bad_request`; `500 → server`.
- `test/queue.test.js`: `sends one at a time in push order when the first send is slow` (onResult order `[1, 2]`; send 2 starts after onResult 1); `an error from send goes to onResult as the error argument and the queue continues`; `idle resolves when nothing is in flight`.
- `test/copy.test.js`: each `COPY` value equals the table in section 1, character for character.
- `test/pages.test.js` (reads files as text; **this is also the contract test Person C runs** with `node --test test/pages.test.js`):
  - `app.html loads /client/app.js as a module, has a viewport meta, <link rel="icon" href="/logo-mark.svg">, and a text input`.
  - `public/logo.svg and public/logo-mark.svg are each an <svg> with a viewBox, no <script>, no external href, under 20 KB` (these files exist already, so these tests run for real from slice 1).
  - The landing contract on `public/index.html`, exactly as in the Team split: `has a viewport meta, <link rel="icon" href="/logo-mark.svg">, an <img> of /logo.svg, the name "Catch No Ball", the tagline "For when you catch no ball.", an example card with the deadline sentence and the word firm, an "Open the app" link to /app, and the exact privacy line`; `has no <script> and no external URLs (no http:, https: or // in src, href or url())`; `references no local paths other than /, /app, /logo.svg, /logo-mark.svg` (slice 8 adds `/manifest.webmanifest` and `/icon-180.png`); `has a prefers-color-scheme: dark rule`. Written in slice 1 so C can run them from day 1; while `public/index.html` doesn't exist they are marked `{ todo: "waiting for Person C" }` (Node reports them without failing). Slice 5 removes the `todo`.
- `test/config.test.js` (reads files as text):
  - `every file in src/client is imported in src/index.js`;
  - `if wrangler.toml declares MeralionGuard, index.js exports it`;
  - `wrangler.toml [vars] has no secret names (OPENCODE_API_KEY, MERALION_API_KEY)`;
  - `wrangler.toml has [assets] directory "./public" and run_worker_first with /app, /api/* and /client/*`;
  - `public/ contains nothing named app, app.html, app/, api/ or client/` (pitfall 8);
  - `package.json's test and coverage scripts include both test/**/*.test.js and evals/**/*.test.js`;
  - `.gitignore lists .dev.vars, evals/clips/, evals/results/`;
  - `package.json has no dependencies, only devDependencies.wrangler`.
- `test/all-modules.test.js`: imports every `.js` under `src/` and `evals/` except the three exclusions and `*.test.js`; a missing `evals/` is fine.

**Acceptance criteria**
- The demo script works end to end in desktop Chrome at 375 px width, light and dark.
- The client holds no secret, code or key; the only secrets are the two server keys.
- A plain-English line shows exactly the typed words, faded, with nothing else (M2).
- Model output is always escaped.

**Definition of done:** standard DoD (section 2), plus: the user has seen a real OpenCode Go card for the PRD demo sentence with tone **firm** (if it isn't firm, note it for the slice 2 prompt work; don't block).

---

### Slice 2: Honest when unsure (two readings)

**Stories:** US-6, plus B5 (previous sentence sent as context).
**Depends on:** slice 1. **User provides:** nothing new. Optionally the R1 result, to shape the prompt wording.

**Demo script**
1. Type `can meh` on its own: a card with "Could mean: … or …", each reading with its own tone chip (for example *doubtful* and *neutral*).
2. Type `Can you finish the slides by Friday?` then `can lor`: one card, tone **reluctant**, no "Could mean".
3. Type `Eh the deadline confirm cannot shift one lah`: still one confident **firm** card.
4. Type a plain-English line: still one faded line, and the response shows `passes: 1` (open dev tools → Network; there is no retry for plain English).
*Feedback wanted:* Are the two readings easy to tell apart at a glance? Does "Could mean" feel honest rather than broken?

**Files**
- Modify: `src/interpret.js` (retry), `src/prompt.js` (retry wording), `src/client/cards.js` (`unsure` card), `src/client/app.js` (keep context, send it).
- Create: `src/client/session.js`.
- Tests: extend `test/interpret.test.js`, `test/prompt.test.js`, `test/cards.test.js`, `test/pipeline-text.test.js`; create `test/session.test.js`.

**Interfaces**
- Produced: `src/client/session.js`: `nextContext(prev: string[], sentences: Sentence[], keep = 3) -> string[]` (appends each sentence's `said`, plain ones included, and keeps the last `keep`).
- Produced: `CardModel` kind `{ kind: "unsure", said, termsHtml, readings: [{ meaning, tone }, { meaning, tone }] }`.
- Changed behaviour of `interpret` (same signature):
  1. First pass: `context.slice(-1)`, `requireReadings: false`.
  2. If **any sentence with `hasSinglish: true`** has `confident: false`: one second call with `context.slice(-3)`, `retry: true`, parsed with `requireReadings: true`. Return it with `passes: 2`.
  3. If the second call fails in any way (HTTP, timeout, parse, or still not exactly 2 readings), throw `InterpretError`. The pipeline then returns `meaning_unavailable` for the whole clip, and the user can tap to retry. **(my call:** simpler and honest; we never show one unsure guess.)
- `buildMessages({ retry: true })` adds: "Reconsider with the extra context. If still unsure, set confident false and give exactly two readings."

**Tests**
- `test/interpret.test.js`
  - `retries once with the last 3 context sentences when a Singlish sentence is unsure`: context `["s1","s2","s3","s4"]`; first reply unsure, second reply unsure with 2 readings → 2 calls; call 1 user message matches `/s4/` and not `/s3/`; call 2 matches `/s2[\s\S]*s3[\s\S]*s4/` and not `/s1/`; result has 2 readings and `passes === 2`.
  - `does not retry when an unsure sentence is plain English` (pitfall 6): `hasSinglish:false, confident:false` → 1 call, `passes === 1`.
  - `does not retry a confident Singlish sentence` → 1 call.
  - `throws InterpretError when the retry still lacks exactly two readings`; `throws when the retry call returns 500`.
  - `rejects a reading whose tone is outside TONES`.
- `test/prompt.test.js`: `the retry prompt asks to reconsider and give exactly two readings`; `the first-pass prompt does not`.
- `test/pipeline-text.test.js`: `a failed retry becomes meaning_unavailable`; `passes is passed through`.
- `test/cards.test.js`: `an unsure sentence renders "Could mean:" A "or" B with a tone chip for each`; `a confident sentence never renders "Could mean"`.
- `test/session.test.js`: `nextContext keeps the last 3 said values in order` (`["a","b"]` + `c`, `d` → `["b","c","d"]`); `includes plain sentences`; `handles an empty start`.

**Acceptance criteria**
- No Singlish card is ever shown with one guess while `confident` is false (anti-goal "Confident wrong tone").
- At most 2 OpenCode Go calls per clip or typed line (keeps Q3 usage modest).
- The previous sentence is sent as context (B5), and the last 3 on retry (US-6).

**Definition of done:** standard DoD, plus: the user has tried at least the `can meh` / `can lor` pair from the PRD and said whether the readings make sense.

---

### Slice 3: Listen, and MERaLiON hears the clip

**Stories:** US-3 (Listen with consent; "Translating" label), US-4 (a card per Singlish sentence from speech, in order; recording continues while clips are processed), US-7 ("Couldn't catch that" + type; silence shows nothing), US-8 (mic blocked or unsupported → explanation + text box). Back-end: B2 (MERaLiON hears each clip: exact transcript **plus its own reading of meaning and tone of voice**), B3 (never more than 5 MERaLiON requests in any minute, counting every call), B3a (monthly budget for requests, audio and tokens), B4 (OpenCode Go checks MERaLiON's reading against context and writes the final card), B6 (MERaLiON reply cache). **MERaLiON is the only speech model in this slice.** Whisper arrives in slice 4, and only as the automatic fallback.

This is the largest slice, because the first MERaLiON call must ship with its rate guard and budget (they protect the free quota from day one) and because option B's reading comes back in the same call in the preferred mode. The engineer may build it in the order step 0 (format check), server, then client, but there is one feedback round.

**Depends on:** slice 2. R2's result (Person B) must be in before this slice's demo (live vs recap).
**User provides:** `MERALION_API_KEY` in `.dev.vars` (the user has it). Their voice, in a quiet room, for the demo. No Cloudflare login is needed yet (local Durable Objects and KV run without it).

**Step 0 (prerequisite, done by the engineer at the start of the slice): the MERaLiON check (PRD R3, R9, R10).** Real requests with the user's key, read from `.dev.vars` by the shell, never printed or written anywhere else. Generate two short samples with macOS text-to-speech (no real person's voice):
```bash
T="${TMPDIR:-/tmp}"
say -o "$T/s1.aiff" "Eh the deadline confirm cannot shift one lah"
say -o "$T/s2.aiff" "Let's move on to the next agenda item"
afconvert -f WAVE -d LEI16@16000 -c 1 "$T/s1.aiff" test/fixtures/r3-singlish.wav
afconvert -f WAVE -d LEI16@16000 -c 1 "$T/s2.aiff" test/fixtures/r3-plain.wav
set -a; . ./.dev.vars; set +a
```
Then, in this order (MERaLiON's docs at `https://api.meralion.ai/v1/docs` decide the exact shapes; the guesses below are OpenAI-style):
1. **Which models are served:** `curl -s https://api.meralion.ai/v1/models -H "Authorization: Bearer $MERALION_API_KEY"`. Is MERaLiON-3 10B listed? Record every model id. (No audio.)
2. **Transcription endpoint**, for each sample: `curl -s -w "\n%{http_code} %{time_total}s\n" https://api.meralion.ai/v1/audio/transcriptions -H "Authorization: Bearer $MERALION_API_KEY" -F file=@test/fixtures/r3-singlish.wav` (add `-F model=…` if required). Record the transcript field, any `usage`, the time.
3. **Chat with audio**, for each sample: `POST https://api.meralion.ai/v1/chat/completions` with `model` = the MERaLiON-3 10B id if served (else the served audio-capable MERaLiON model) and one user message whose content is `[{ "type": "text", "text": HEAR_PROMPT }, { "type": "input_audio", "input_audio": { "data": "<base64 WAV>", "format": "wav" } }]` (build the body with a short `node -e` script into a temp file, then `curl --data @file`). Record: accepted or not; the reply text; whether its `transcript` equals the transcription endpoint's word for word (token comparison as in `verbatimSpan`); the reading (meaning, tone, confidence); `usage` tokens; the time.
4. **Wrong key** once on each endpoint used: the error status and body.

Save fixtures: `test/fixtures/meralion-transcription.json`, `test/fixtures/meralion-chat.json` (if chat worked), `test/fixtures/meralion-error.json`. Write `reports/r3-meralion-format.md` with everything recorded and the **mode decision**:

| What step 0 found | `MERALION_MODE` | Calls per clip | `CLIP_SECONDS` |
|---|---|---|---|
| Chat accepts audio, and its transcript matches the transcription endpoint word for word on both samples | `"combined"` (PRD's preferred form: one call returns transcript + reading) | 1 | 15 |
| Chat accepts audio, but its transcript differs (so it can't be trusted for M2) | `"two_call"` (transcription endpoint for the exact words, then chat for the reading) | 2 | 25 |
| Chat does not accept audio, or no audio-capable MERaLiON model is served | `"transcript_only"` (**option A fallback**: MERaLiON gives the transcript only; OpenCode Go reads tone from words alone; the presentation says so) | 1 | 15 |

If MERaLiON-3 10B is not served but another MERaLiON model hears audio, use it, record its id, and flag it to the controller (the user wanted 3 10B). If tokens per clip exceed 400 (100k tokens over about 240 clips, per the PRD's budget table), flag it: tokens then run out before audio. **Cost of step 0: at most 8 requests and about 20 s of audio.** These calls bypass the guard; add them to the slice's spend. If MERaLiON does not answer at all, stop and tell the controller (the user decides; Whisper is not silently substituted). The controller shows the decision to the user at this slice's demo.

**Demo script** (desktop Chrome on `localhost`; phones need HTTPS, which slice 5 brings)
1. `npm run dev`, open `localhost:8787/app`, tap **Listen**: the browser asks for the microphone. Allow: "Translating" and "Let the table know you're using a translator" appear, pinned at the top.
2. Say `Eh the deadline confirm cannot shift one lah` firmly and tap **Stop** straight after (Stop sends the short partial clip, which saves MERaLiON quota). A card appears a few seconds later: the transcript from MERaLiON, and a meaning and tone written by OpenCode Go after checking MERaLiON's reading.
3. Say `can lor` in a reluctant voice, Stop: ideally **reluctant**. Open dev tools → Network → the `/api/chunk` response: `hint` shows MERaLiON's own reading next to the final card (it is never shown on screen).
4. Listen again; say one plain-English sentence; Stop: a faded line, unchanged.
5. Listen and stay silent for 15 s, then Stop: nothing appears and nothing is sent.
6. Listen and say two sentences about 10 s apart without stopping: both cards arrive in order; recording carried on while the first was processed.
7. Mumble or cover the mic while talking: "Couldn't catch that" with a text box. Type what you heard: it becomes a normal card in its place.
8. Tap **Stop**: the label disappears and the browser's mic indicator goes off.
9. Block the mic in site settings and tap Listen: the "microphone is blocked" help and the text box.
10. `curl -s localhost:8787/api/budget`: requests, audio seconds and tokens this demo spent.
11. If R2 failed: cards are held while listening and all appear at Stop.
*Feedback wanted:* the mode step 0 chose (and the model id); how well MERaLiON keeps your particles; whether its tone reading helps; card speed; whether the label is obvious enough; unwanted "Couldn't catch that" cards from noise.

**Files**
- Create: `src/audio.js`, `src/meralion.js`, `src/hear.js`, `src/guard.js`, `src/client/wav.js`, `src/client/clipper.js`, `src/client/mic.js`, `src/client/recorder-worklet.js`, `test/helpers/wav.js`, the fixtures from step 0.
- Modify: `wrangler.toml` (**in one change with the export below**: `[[durable_objects.bindings]] name = "MERALION_GUARD" class_name = "MeralionGuard"` and `[[migrations]] tag = "v1" new_sqlite_classes = ["MeralionGuard"]`; plus `[[kv_namespaces]] binding = "CACHE"` with a placeholder id until slice 5 creates the real one), `src/index.js` (`export { MeralionGuard } from "./guard.js";` and the new client files), `src/prompt.js` and `src/interpret.js` (the `hint` input), `src/pipeline.js` (`handleChunk`, `handleBudget`), `src/router.js` (`POST /api/chunk`, `GET /api/budget`), `src/client/api.js` (`sendClip`, `budget`), `src/client/cards.js` (`uncaught` card), `src/client/app.js`, `src/pages/app.html`, `src/client/app.css`, `.dev.vars.example` (`MERALION_API_KEY=`), `CLAUDE.md` (the MERaLiON development practice from section 1).
- Tests: `test/audio.test.js`, `test/meralion.test.js`, `test/hear.test.js`, `test/guard.test.js`, `test/pipeline-chunk.test.js`, `test/wav.test.js`, `test/clipper.test.js`, `test/mic.test.js`, `test/worklet.test.js`; extend `test/interpret.test.js`, `test/prompt.test.js`, `test/cards.test.js`, `test/api.test.js`, `test/queue.test.js`, `test/router.test.js`, `test/config.test.js`.

**Interfaces produced**
- `src/audio.js`:
  - `wavInfo(bytes: Uint8Array) -> { sampleRate, channels, bitsPerSample, seconds }`. Reads the RIFF/WAVE header and walks the chunks to `fmt ` and `data` (any `LIST` chunk in between is skipped). `seconds = dataSize / byteRate`. Throws `Error("not_wav")` otherwise.
  - `sha256Hex(bytes) -> Promise<string>` (`crypto.subtle.digest`).
  - `bytesToBase64(bytes: Uint8Array) -> string`: `btoa` over `String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))` chunks (avoids call-stack limits; keep it fast because of the 10 ms CPU limit, IR-1). Needed here for audio in chat.
- `src/meralion.js` (all MERaLiON HTTP and parsing; values from step 0):
  - Constants: `MERALION_BASE = "https://api.meralion.ai/v1"`, `MERALION_MODEL` (the id step 0 chose), `MERALION_MODE` (`"combined" | "two_call" | "transcript_only"`), `MERALION_TIMEOUT_MS = 20000`, `HEAR_PROMPT`.
  - `HEAR_PROMPT` asks for JSON only: `{"transcript": the exact words as spoken, keeping Singlish particles such as lah, lor, meh, leh, siam; "meaning": one short plain-English sentence, or "" if the clip is plain English; "tone": one of firm, reluctant, doubtful, joking, casual, neutral, judged from the tone of voice; "confidence": a number from 0 to 1}`. In `two_call` mode the `transcript` field is left out.
  - `class MeralionError extends Error` with `status: number | null`.
  - `callMeralionTranscribe(bytes, env, fetchImpl = fetch) -> Promise<{ text: string, tokens: number }>`: `POST ${MERALION_BASE}/audio/transcriptions`, `authorization: Bearer ${env.MERALION_API_KEY}`, multipart field `file` (a `Blob` of type `audio/wav`, filename `clip.wav`) plus any field step 0 found required; `tokens` from `usage` if present, else 0. Non-2xx or timeout → `MeralionError`.
  - `callMeralionChat(bytes, env, { wantTranscript }, fetchImpl = fetch) -> Promise<{ raw: string, tokens: number }>`: `POST ${MERALION_BASE}/chat/completions` with the shape step 0 confirmed; `raw` is the reply text.
  - `parseHearing(raw: string, { wantTranscript }) -> { transcript: string | null, hint: Hint | null }`: strip a fence, take the first `{` to the last `}`, `JSON.parse` (failure → `{ transcript: null, hint: null }`). `transcript`: a trimmed string when `wantTranscript`, else `null`. `hint`: `{ meaning, tone, confidence }` where `meaning` is a trimmed string cut to 300 characters, `tone` is lower-cased, trimmed and cut to 30 characters (free text: **not** forced into `TONES` here; OpenCode Go decides the final tone), `confidence` is a number clamped to [0, 1] (a numeric string is parsed) or `null`. `hint` is `null` when both `meaning` and `tone` are empty.
- `src/guard.js` (no `cloudflare:workers` import). **Every MERaLiON request is counted.**
  - Constants: `RATE_LIMIT_PER_MIN = 5`, `RATE_WINDOW_MS = 60000`, `HINT_SPARE_SLOTS = 1`, and `LIMITS = { seconds: 3600, requests: 1000, tokens: 100000 }` (PRD B3a: the whole free tier per calendar month, no part held back).
  - `decide(state, { now: number /* ms */, kind: "combined" | "asr" | "hint", seconds: number }) -> { allow: boolean, reason?: "rate" | "seconds" | "requests" | "tokens", state }`. `state` is `{ recent: number[], month: "YYYY-MM", seconds: number, requests: number, tokens: number }`, or `undefined` for fresh. Order:
    1. drop `recent` entries at or before `now − 60000`;
    2. rate: refuse with `rate` if `recent.length >= 5`, or, for `kind === "hint"`, if `recent.length >= 5 − HINT_SPARE_SLOTS` (a reading call never takes the last slot in the window, so the next clip's transcript can still go to MERaLiON);
    3. if the UTC month of `now` differs from `state.month`, reset `seconds`, `requests` and `tokens` to 0 and set the month;
    4. against `LIMITS`: refuse with `tokens` if `tokens >= LIMITS.tokens`; with `requests` if `requests + 1 > LIMITS.requests`; with `seconds` if `seconds + seconds_of_this_request > LIMITS.seconds`. **Audio seconds are added for every request that carries the clip** (both calls in `two_call` mode), which is safe if MERaLiON counts audio per call (PRD budget table, footnote).
    5. allow: push `now`, `requests += 1`, `seconds += seconds`. A refusal never changes anything.
  - `recordTokens(state, { now, tokens }) -> state` (adds `tokens` after a call, with the same month reset).
  - `budgetStatus(state, now) -> { month, used: { seconds, requests, tokens }, limits: LIMITS, recentRequests }` (same pruning and month reset, without consuming).
  - `class MeralionGuard { constructor(ctx, env); fetch(request) }`: `POST /reserve` with `{ kind, seconds }` returns `{ allow, reason? }`; `POST /tokens` with `{ tokens }`; `GET /status`. State is read and written with `ctx.storage.get("state")` / `ctx.storage.put("state", …)`.
  - `reserveMeralion(env, { kind, seconds }) -> Promise<{ allow, reason? }>`: `env.MERALION_GUARD.get(env.MERALION_GUARD.idFromName("global"))`. **If the binding is missing or the call throws, return `{ allow: false, reason: "guard" }`**, so MERaLiON is never called unguarded.
  - `recordMeralionTokens(env, tokens) -> Promise<void>` (best effort; errors are logged and swallowed); `guardStatus(env) -> Promise<object>`.
- `src/hear.js`:
  - `class HearError extends Error` with `reason: "refused" | "meralion" | "whisper"`.
  - `hearClip(bytes, env, { asr = "auto" } = {}, deps = { fetchImpl: fetch, reserve: reserveMeralion, recordTokens: recordMeralionTokens, whisper: null, mode: MERALION_MODE }) -> Promise<{ transcript: string, hint: Hint | null, source: "meralion" | "whisper", cached: boolean }>`. Order in this slice:
    1. Cache lookup under `hear:<mode>:<sha256>` (value `{ transcript, hint }`). A hit returns `cached: true` with no other calls. A missing `env.CACHE` binding or a throwing `get` means no cache, never an error.
    2. By mode:
       - `combined`: `reserve({ kind: "combined", seconds })` (refused → `HearError("refused")`); `callMeralionChat(…, { wantTranscript: true })`; `recordTokens`; `parseHearing`. No transcript in the reply (bad JSON, missing field) → `HearError("meralion")`.
       - `two_call`: `reserve({ kind: "asr", … })` (refused → `HearError("refused")`); `callMeralionTranscribe`; `recordTokens`. Then, only if the transcript is non-empty: `reserve({ kind: "hint", … })`; if allowed, `callMeralionChat(…, { wantTranscript: false })` and `parseHearing`. A refused or failed reading call gives `hint: null` and never fails the clip.
       - `transcript_only`: `reserve({ kind: "asr", … })`; `callMeralionTranscribe`; `hint: null`.
       Only the chosen mode's path needs to be built and tested; `mode` is injectable so tests can pin it.
    3. A non-empty transcript is cached with its hint under `hear:<mode>:<sha256>`, `{ expirationTtl: 604800 }`. Only text is stored, never audio.
    Slice 4 adds the Whisper fallback without changing the signature.
- `src/prompt.js` and `src/interpret.js` (option B input):
  - `buildMessages({ transcript, context = [], retry = false, hint = null })`. When `hint` is set, the user message adds a block labelled `Speech model's reading (heard the audio; may be wrong):` with the meaning, the tone of voice and the confidence. The system prompt adds: "A speech model may give its reading of the meaning and tone of voice. Check it against the words and the earlier sentences. Use it when it fits; overrule it when it doesn't. The tone you return must still be one of the six labels. Decide hasSinglish from the transcript alone; a reading never turns plain English into Singlish."
  - `interpret({ transcript, context, sessionId, hint = null }, env, fetchImpl = fetch)`. Same flow as slice 2; the hint goes into both passes. Typed text never has a hint.
- `src/pipeline.js`:
  - `handleChunk(request, env, deps = { hearClip, interpret }) -> Promise<Response>`. Order: (1) read `formData()`; missing `audio` → 400 `bad_audio`; (2) `wavInfo`: not WAV, or not 16000 Hz mono 16-bit → 400 `bad_audio`; `seconds > 30` → 413 `too_long`; `seconds < 0.5` → `status: "silent"` (no MERaLiON call); (3) `hearClip` throws → `status: "uncaught"`; (4) empty or whitespace transcript → `status: "uncaught"` (**my call** following PRD US-7: the phone only sends non-silent clips, so an empty transcript means speech that couldn't be made out); (5) `interpret({ transcript, context, sessionId, hint })`; it throws → `meaning_unavailable` with the transcript (MERaLiON's reading is **not** shown instead, PRD US-11); (6) otherwise `ok`. `ChunkResult` carries `source`, `cached` and `hint` from `hearClip`. Malformed `context` JSON is treated as `[]`.
  - `handleBudget(request, env, deps = { guardStatus }) -> Promise<Response>`.
- `src/client/wav.js`:
  - `resampleTo16k(samples: Float32Array, fromRate: number) -> Float32Array`. Returns the input when `fromRate === 16000`. When `fromRate / 16000` is an integer (48000 → 3), average each block of that many samples, which doubles as a cheap low-pass filter. Otherwise use linear interpolation. Output length is `Math.round(samples.length * 16000 / fromRate)`.
  - `encodeWav(samples16k: Float32Array) -> Uint8Array`: PCM16 mono at 16000 Hz, 44-byte header, samples clamped to [-1, 1] (`s < 0 ? s * 0x8000 : s * 0x7fff`).
  - `rms(samples) -> number`; `isSilent(samples, threshold = SILENCE_RMS) -> boolean` (`rms < threshold`).
- `src/client/clipper.js`: `createClipper({ inputRate, clipSeconds = CLIP_SECONDS, onClip }) -> { push(frame: Float32Array), flush() }`. Emits `onClip(Float32Array)` of exactly `inputRate * clipSeconds` samples, splitting frames across the boundary. `flush()` emits whatever is left (if anything) and resets. `CLIP_SECONDS` is the value step 0 chose (15 or 25).
- `src/client/mic.js`:
  - `canRecord(g = globalThis) -> boolean` (needs `g.navigator?.mediaDevices?.getUserMedia`, `g.AudioContext` or `g.webkitAudioContext`, and `g.AudioWorkletNode`)
  - `micErrorKind(err) -> "denied" | "no_mic" | "other"` (`NotAllowedError` and `SecurityError` → denied; `NotFoundError` and `OverconstrainedError` → no_mic)
  - `micErrorCopy(kind) -> string` (denied → `COPY.micBlocked`; unsupported uses `COPY.cantListen`)
- `src/client/recorder-worklet.js`: `class PcmCapture extends AudioWorkletProcessor`, registered as `"pcm-capture"`. `process(inputs)` posts a **copy** of `inputs[0][0]` to `this.port` when present and always returns `true`.
- `src/client/api.js`: adds `sendClip({ wav: Uint8Array, sessionId, context }) -> Promise<ChunkResult>` (multipart: `audio` as a `Blob` of type `audio/wav` named `clip.wav`, `sessionId`, `context` as JSON) and `budget() -> Promise<object>`.
- `src/client/cards.js`: adds `{ kind: "uncaught" }`, rendered with `COPY.uncaught` and a text box. Its submission is pushed as `{ kind: "text", text, replaces: cardId }`. `toCardModels` **never reads `result.hint`**.
- `src/client/app.js` (glue, no decisions): on Listen, inside the tap handler: `getUserMedia({ audio: true })`, create and `resume()` the `AudioContext`, `audioWorklet.addModule("/client/recorder-worklet.js")`, connect `pcm-capture`. Request a screen Wake Lock (best effort; iOS stops audio when the screen locks). For each clip: `isSilent` → drop; else `resampleTo16k` → `encodeWav` → `queue.push({ kind: "clip", wav })`. On Stop: `flush()` (the partial clip is sent if at least 0.5 s and not silent), stop the tracks, close the context, hide the label. One `sessionId = crypto.randomUUID()` per Listen. If `canRecord()` is false, show `COPY.cantListen` and focus the text box.
- If R2 failed (recap): `app.js` holds rendered cards in a list while listening and appends them all at Stop. Nothing else changes.

**Tests**
- `test/helpers/wav.js`: `makeWav(seconds, { sampleRate = 16000, channels = 1, fill = 0 } = {})`.
- `test/audio.test.js`: `wavInfo reads 15 s of 16 kHz mono PCM16` (`seconds === 15`, `sampleRate === 16000`, `channels === 1`); `walks past a LIST chunk before data`; `rejects non-WAV with not_wav`; `sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"`; `bytesToBase64 equals Buffer.from(bytes).toString("base64") for 100,000 random bytes`; `wavInfo reads both step-0 samples as 16 kHz mono`.
- `test/meralion.test.js` (fake `fetchImpl`; **no test reaches the real MERaLiON**: the file replaces `globalThis.fetch` with one that throws)
  - `callMeralionTranscribe posts multipart file to https://api.meralion.ai/v1/audio/transcriptions with the bearer key and returns the fixture's text and tokens`.
  - `callMeralionChat posts the model id, HEAR_PROMPT and the base64 WAV in the confirmed shape to https://api.meralion.ai/v1/chat/completions` (if chat is used).
  - `both throw MeralionError with status on 401 (meralion-error.json), 429 and 500, and on timeout`.
  - `parseHearing reads the chat fixture: transcript, meaning, tone, confidence`; `strips a json fence`; `bad JSON → { transcript: null, hint: null }`; `confidence "0.8" → 0.8, 1.7 → 1, "high" → null`; `tone "Sarcastic " → "sarcastic" (kept as free text)`; `meaning over 300 characters is cut`; `empty meaning and tone → hint null`; `wantTranscript false → transcript null`.
- `test/guard.test.js` (`const T = Date.UTC(2026, 10, 20, 9, 0, 0)`)
  - `allows 5 requests of any kind in a minute and refuses the 6th with reason rate`.
  - `a hint is refused when only one slot is left, while an asr request is still allowed` (4 in the window: `hint` → `rate`, `asr` → allow).
  - `a request 61 s after the first five is allowed again`; `one exactly 60 s later is also allowed (entries at or before now − 60000 are dropped)`.
  - `audio: stops at 3600 s` (state `seconds 3590`, 15 s → `reason "seconds"`); `exactly reaching the limit is allowed` (`3585 + 15 = 3600`).
  - `requests: stops at 1000` (`requests 1000` → `requests`; `requests 999` → allow).
  - `tokens: refused once tokens reach 100000`; `recordTokens adds tokens`.
  - `every request adds its audio seconds` (two allowed requests for one 15 s clip → `seconds 30`, `requests 2`).
  - `budget resets when the UTC month changes`: month `"2026-10"` with everything at its limit → allow, new state month `"2026-11"`, `seconds 15`, `requests 1`, `tokens 0`; `2026-11-30T23:59:59Z → 2026-12-01T00:00:00Z` also resets.
  - `a refused request changes nothing`; `fresh undefined state is allowed`.
  - `MeralionGuard persists state across fetches` (fake `ctx.storage` backed by a Map): 5 reserves allowed, the 6th refused; `POST /tokens` adds; `GET /status` shows `recentRequests 5` and the tokens.
  - `reserveMeralion uses idFromName("global") and posts { kind, seconds }`; `a missing binding or a throwing stub → { allow: false, reason: "guard" }`; `recordMeralionTokens swallows errors`.
- `test/hear.test.js` (fake `fetchImpl`, fake `reserve` and `recordTokens`, Map-backed fake `CACHE` that records `put` arguments; tests pin `mode`)
  - For the chosen mode: `uses MERaLiON when the guard allows → source meralion, transcript, hint, cached false`.
  - `combined`: `reserves once with kind combined and the clip's real duration` (`makeWav(15)` → `{ kind: "combined", seconds: 15 }`); `a reply without a transcript → HearError meralion`.
  - `two_call`: `reserves asr, then hint`; `a refused or failed reading call gives hint null and still returns the transcript`; `an empty transcript makes no reading call`.
  - `transcript_only`: `one asr reservation; hint is always null`.
  - `records the reply's tokens`.
  - `a guard refusal throws HearError refused and never calls MERaLiON`.
  - `second call with the same audio is served from cache: cached true, no fetch, no reserve, same hint`.
  - `cache put uses key hear:<mode>:<sha256>, value { transcript, hint } and expirationTtl 604800`; `empty transcripts are not cached`; `no CACHE binding, or a throwing CACHE.get, still works`.
- `test/prompt.test.js`: `with a hint, the user message has the "Speech model's reading" block with meaning, tone and confidence`; `without a hint there is no such block`; `the system prompt says the final tone must be one of the six labels and hasSinglish comes from the transcript`.
- `test/interpret.test.js`
  - `interpret sends MERaLiON's hint to OpenCode Go` (fake fetch captures the body: the last message contains the hint's meaning and tone).
  - `the hint is sent on the retry pass too`.
  - **`the final tone is from TONES even when MERaLiON says something else`**: hint tone `"sarcastic"`, OpenCode reply tone `"joking"` → `"joking"`; OpenCode reply that echoes `"sarcastic"` → `InterpretError`.
  - **`a hint never turns plain English into a card`**: hint `{ meaning: "x", tone: "firm" }` and an OpenCode reply with `hasSinglish: false` → the normalised plain sentence (no meaning, tone neutral).
  - `no hint (typed text, or backup) behaves exactly as in slice 2`.
- `test/pipeline-chunk.test.js` (fake deps, `makeWav`):
  - `a 0.4 s clip → status silent and hearClip is never called`.
  - `a 31 s clip → 413 too_long`; `a 30 s clip is accepted`.
  - `non-WAV audio → 400 bad_audio`; `a 44.1 kHz WAV → 400 bad_audio`; `a stereo WAV → 400 bad_audio`; `missing audio field → 400 bad_audio`.
  - `hearClip throwing → status uncaught`; `an empty or whitespace transcript → status uncaught, interpret not called`.
  - `interpret receives the hint from hearClip`; `ChunkResult carries hint, source meralion and cached`.
  - `interpret throwing → meaning_unavailable with the transcript; the hint's meaning is not used as the card`.
  - `malformed context JSON → interpret gets []`; `handleBudget returns guardStatus as JSON`.
- `test/wav.test.js`
  - `48 kHz → 16 kHz keeps duration` (48000 samples → 16000); `44.1 kHz → 16000 ± 1`; `16 kHz returns the input`.
  - `encodeWav header says RIFF/WAVE, PCM 1, 1 channel, 16000 Hz, byte rate 32000, 16 bits`; `1 s is 44 + 32000 bytes`.
  - `encodeWav clamps 2.0 → 32767 and -2.0 → -32768`.
  - `isSilent: zeros true; a 0.5-amplitude 440 Hz sine false; rms 0.009 true, 0.011 false`.
  - `round trip: wavInfo(encodeWav(1 s)) reads 1 s, 16000 Hz, mono` (imports `../src/audio.js`).
- `test/clipper.test.js`: `CLIP_SECONDS at 48 kHz in 128-sample frames emits one clip of 48000 × CLIP_SECONDS samples`; `samples are continuous across the boundary` (a ramp keeps its order); `flush emits the remainder; flush with nothing left emits nothing`; `CLIP_SECONDS is 15 or 25 and matches MERALION_MODE` (25 only for `two_call`).
- `test/worklet.test.js` (stub `registerProcessor` and `AudioWorkletProcessor`): `registers pcm-capture`; `process posts a copy of channel 0 and returns true`; `no input → returns true, posts nothing`.
- `test/mic.test.js`: `canRecord false without mediaDevices, AudioContext or AudioWorkletNode; true with all three (webkitAudioContext counts)`; `NotAllowedError → denied; NotFoundError → no_mic; TypeError → other`; `denied copy is COPY.micBlocked`.
- `test/router.test.js`: `POST /api/chunk calls the chunk handler`; `GET /api/budget returns the handler's JSON`.
- `test/api.test.js`: `sendClip sends multipart with audio (audio/wav), sessionId and context JSON`; `budget GETs /api/budget`.
- `test/queue.test.js`: `a clip pushed while a text item is in flight waits its turn` (mixed kinds keep push order).
- `test/cards.test.js`: `uncaught renders "Couldn't catch that" and a text input`; **`the hint is never rendered`** (a result whose `hint.meaning` is `"HINT-TEXT"` produces HTML without `HINT-TEXT`, for `ok`, `uncaught` and `meaning_unavailable`).
- `test/config.test.js`: `wrangler.toml binds MERALION_GUARD with a v1 new_sqlite_classes migration, and index.js exports MeralionGuard`; `wrangler.toml has no [ai] binding yet` (it is added in slice 4); `no FORCE_WHISPER anywhere in wrangler.toml or .dev.vars.example`.

**Acceptance criteria**
- Every spoken card in this slice comes from MERaLiON (transcript, plus its reading unless the mode is `transcript_only`) checked and written by OpenCode Go; there is no Whisper code path yet.
- MERaLiON's unchecked reading never appears on screen; the final tone is always one of the six labels.
- Every MERaLiON request is counted: no more than 5 in any 60 s; MERaLiON use stops at 3600 s of audio, 1000 requests or 100,000 tokens a calendar month (UTC), whichever comes first. A refusal shows "Couldn't catch that" + text box until slice 4 adds the fallback.
- The mode, model id, `CLIP_SECONDS` and tokens per clip are recorded in `reports/r3-meralion-format.md`, and the user has seen them.
- Silence never sends a request (client) and never reaches MERaLiON (server).
- Cards render in recording order; a new clip records while earlier ones are in flight.
- "Translating" is visible for exactly as long as the mic tracks are live (checked by hand: Stop and the browser mic indicator).
- The Worker rejects anything that is not 16 kHz mono PCM16 WAV of at most 30 s.
- `npx wrangler dev` starts with the Durable Object (pitfall 1).

**Definition of done:** standard DoD, plus: `reports/r3-meralion-format.md` exists and the tests use its fixtures; the user has spoken the PRD demo sentence on the laptop and seen a MERaLiON card; MERaLiON spend for the slice (requests, audio seconds, tokens; from `/api/budget` plus the step-0 calls, which bypass the guard) is in the engineer report (target: under 30 requests and 2 minutes of counted audio); the R2 result is recorded and live or recap mode is set to match.

---

### Slice 4: Backup mode (Whisper only as the automatic fallback)

**Stories:** US-10 (the app switches to Whisper by itself when MERaLiON is at its rate limit, over budget or failing, shows "Backup mode" while backup is in use, and cards are then written by OpenCode Go from the transcript alone), plus the "use Whisper rather than wait" half of B3 (PRD B2a).
**Depends on:** slice 3. **User provides:** `npx wrangler login` (Workers AI always runs on Cloudflare, even in `wrangler dev`).

**Demo script** (local)
1. Listen, say a sentence, Stop: a card and **no** "Backup mode" label (MERaLiON).
2. Put a wrong `MERALION_API_KEY` in `.dev.vars`, restart, say a sentence: the card still arrives and "Backup mode" shows; the `/api/chunk` response has `hint: null`. Restore the key, restart, say a sentence: the label goes away.
3. Send the step-0 Singlish sample 6 times within a minute with distinct trailing silence so the cache doesn't answer: `for n in 1 2 3 4 5 6; do node test/helpers/pad-wav.js test/fixtures/r3-singlish.wav $n | curl -s -F audio=@- -F sessionId=t -F context='[]' localhost:8787/api/chunk | grep -o '"source":"[a-z]*"'; done`. In `combined` or `transcript_only` mode the first five say `meralion` and the 6th says `whisper`; in `two_call` mode the first clips say `meralion` with some readings skipped, then `whisper`. (Cost: at most 5 requests, about 20 s of counted audio.)
4. Re-send the same sample once: `"cached": true`, `"source": "meralion"`, no MERaLiON request.
*Feedback wanted:* Is "Backup mode" noticeable but not alarming? Is the backup card on the same sentence noticeably worse?

**Files**
- Modify: `src/hear.js` (fallback), `src/pipeline.js` (pass `asr` from `x-asr`), `src/client/session.js` (`backupLabelVisible`), `src/client/app.js`, `src/pages/app.html`, `src/client/app.css` (label), `wrangler.toml` (`[ai] binding = "AI"`).
- Create: `src/whisper.js`, `test/helpers/pad-wav.js` (CLI used only in the demo; appends `n` × 0.1 s of silence and writes the WAV to stdout).
- Tests: create `test/whisper.test.js`; extend `test/hear.test.js`, `test/pipeline-chunk.test.js`, `test/session.test.js`, `test/config.test.js`.

**Interfaces produced**
- `src/whisper.js`: `WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo"`; `callWhisper(bytes, env) -> Promise<string>`: `env.AI.run(WHISPER_MODEL, { audio: bytesToBase64(bytes) })`, returns `.text` trimmed. Check the model's input schema in the Cloudflare docs before adding optional fields (for example `language: "en"`); only `audio` is required. Throws `HearError("whisper")`.
- `src/hear.js`: `hearClip` (same signature; default `deps.whisper = callWhisper`). Final order:
  1. `asr === "whisper"` is an **explicit opt-in used only by the eval runner** (`x-asr: whisper`) for the MERaLiON vs Whisper particle comparison: cache `asr:whisper:<sha>` → Whisper → cache it; `hint: null`. No guard, no MERaLiON.
  2. Otherwise (`"auto"`, the default and the only mode the app uses): the slice 3 path.
  3. **Fallback:** if the guard refuses or MERaLiON fails before a transcript is obtained (any status, timeout, network, unusable reply), call Whisper and return `source: "whisper"`, **`hint: null`** (OpenCode Go then works from the transcript alone). Cache it under `asr:whisper:<sha>` (never under the MERaLiON key, so a later MERaLiON attempt isn't masked). A missing reading alone (in `two_call` mode) is **not** a fallback: the card is still MERaLiON's, without the label.
  4. If Whisper also throws, throw `HearError("whisper")` (the pipeline returns `uncaught`).
  - There is **no** environment switch that makes Whisper the default. **(my call, per the user's revision-1 instruction:** `FORCE_WHISPER` from the earlier plan is removed. In an emergency, such as the MERaLiON quota being gone, the budget guard already sends everything to Whisper by itself.)
- `src/pipeline.js`: `x-asr: whisper` is passed as `asr: "whisper"`; any other value, or none, means `"auto"`.
- `src/client/session.js`: `backupLabelVisible(prev: boolean, result: ChunkResult) -> boolean`: `source === "whisper"` → true; `source === "meralion"` → false; anything else (text, silent) → `prev`.
- `src/client/api.js` never sends `x-asr`; the app always runs on `auto`.

**Tests**
- `test/whisper.test.js` (fake `env.AI`): `callWhisper calls env.AI.run with @cf/openai/whisper-large-v3-turbo and base64 audio and returns trimmed text`; `AI.run throwing → HearError reason whisper`.
- `test/hear.test.js`
  - `falls back to Whisper on MERaLiON 429, 500, timeout, network error and an unusable reply → source whisper, hint null`.
  - `falls back to Whisper when the guard refuses (rate, seconds, requests, tokens, guard), and never calls MERaLiON`.
  - `MERaLiON success never calls Whisper`.
  - `two_call: a refused reading call is not a fallback (source meralion, hint null)`.
  - `both failing → HearError`.
  - `a Whisper fallback is cached under asr:whisper:<sha256>, not hear:<mode>:<sha256>`.
  - `asr whisper (eval opt-in) skips the guard and MERaLiON`; `the default (no asr) is auto and tries MERaLiON first`.
- `test/pipeline-chunk.test.js`: `x-asr whisper → asr whisper; x-asr bogus or missing → auto`; `in backup, interpret gets hint null`.
- `test/session.test.js`: `backupLabelVisible: whisper → true; meralion → false; text keeps the previous value`.
- `test/config.test.js`: `wrangler.toml has [ai] binding AI`; `[vars], if present, holds no secret names and no FORCE_WHISPER`.

**Acceptance criteria**
- MERaLiON is always tried first in the app; Whisper runs only when the guard refuses or MERaLiON fails to give a transcript. "Backup mode" is visible exactly while the latest spoken card came from Whisper, and those cards come from OpenCode Go on the transcript alone (US-10).
- Over the rate limit, the clip goes to Whisper instead of waiting (B3).
- No configuration makes Whisper the default.

**Definition of done:** standard DoD, plus: the user has seen the backup switch and the label clear again; MERaLiON spend is recorded (target: under 10 requests and 1 minute of counted audio).

---

### Slice 5: Landing page, logo, and the app on both phones (deploy)

**Stories:** US-1 (landing page, L1), deploy to the free `*.workers.dev` address (PRD goal 4), and the phone checks for US-3, US-4 and US-10 on **both iPhone (Safari) and Android (Chrome)**.
**Depends on:** slice 4; login and a registered `workers.dev` subdomain (D1b); **Person C's `public/`** (`public/index.html`, plus the already-committed `public/logo.svg` and `public/logo-mark.svg`; see Team split; `test/pages.test.js` is their contract). `public/` is deployed with the Worker as static assets by the same `npx wrangler deploy`; the engineer never edits or adds files in `public/`. If C's landing page has not merged when this slice starts, the engineer builds and deploys anyway (`/` returns the Worker's 404 until then) and redeploys when C's PR lands. The slice's demo and DoD wait for C's page, with the landing tests passing and their `todo` removed.
**User provides:** run the deploy commands below (or approve the engineer running them), set the secrets, run `npx wrangler kv namespace create CACHE` (or approve it), and test on their iPhone and their Android phone.

**Demo script** (do steps 1–3 on the iPhone in Safari, then again on the Android phone in Chrome)
1. Open `https://catch-no-ball.<subdomain>.workers.dev/` in portrait: the name, the hand-drawn logo (a speech bubble with a small ball inside), "For when you catch no ball.", one paragraph, an example card (the deadline sentence, **firm**), **Open the app**, and the privacy line. No sideways scrolling. Check dark mode.
2. Tap **Open the app**, tap **Listen**, allow the mic, say the demo sentence, tap Stop: a MERaLiON card arrives (no "Backup mode").
3. Listen again and lock the phone for 10 s, then unlock: note what happened (iOS may pause audio; the Wake Lock should keep the screen on).
4. On a laptop: open the dashboard's Workers → catch-no-ball → Observability and note CPU time per `/api/chunk` request.
5. `curl -s https://catch-no-ball.<subdomain>.workers.dev/api/budget`: the deployed counter (it starts at 0; local development usage is not in it, see IR-7).
6. `curl -sI https://catch-no-ball.<subdomain>.workers.dev/logo.svg | grep -i content-type` shows `image/svg+xml` (a static asset); `curl -sI …/app` shows `text/html` from the Worker.
*Feedback wanted:* Does the landing page say what it is in one glance? Is the logo right? Does listening work on both phones? (Landing and logo feedback goes to Person C.)

**Files**
- **Owned by Person C (not edited by the engineer):** everything in `public/`: `index.html` (full page per L1), `logo.svg`, `logo-mark.svg`. Served as static assets; no router or `index.js` change is needed for them.
- Create or update (Person A / engineer): `README.md` (what it is, setup, dev, test, coverage, deploy, the MERaLiON development practice, the team split and folder ownership, where evals live, how C previews `public/`).
- Modify (Person A / engineer): `wrangler.toml` (real KV id; `[observability] enabled = true`). The `[assets]` block is already there from slice 1.
- Tests: extend `test/pages.test.js` (remove the landing tests' `todo`), `test/config.test.js`.

**Interfaces:** none new. No new API, no new route (the Worker still serves only `/app`, `/client/*` and `/api/*`).

**Deploy runbook** (the user runs these or approves them)
```bash
npx wrangler kv namespace create CACHE          # paste the id into wrangler.toml
npx wrangler secret put OPENCODE_API_KEY
npx wrangler secret put MERALION_API_KEY
npm test && npm run coverage && npx wrangler deploy   # prints https://catch-no-ball.<subdomain>.workers.dev
```
Every later slice ends its demo with `npx wrangler deploy`, so the user can test on both phones.

**Tests**
- `test/pages.test.js` (**the contract for Person C**, written in slice 1): the landing tests on `public/index.html` lose their `todo` and must pass; a new `public/index.html exists` test fails if the file is missing, so the deployed `/` can't silently 404.
- `test/config.test.js`: `the KV id is not the placeholder`; `[observability] enabled = true`.

**Acceptance criteria**
- The landing page meets L1 and reads well at 375 px with no horizontal scroll.
- The deployed app listens and shows MERaLiON cards over HTTPS on **both** an iPhone in Safari and an Android phone in Chrome.
- Median CPU time per `/api/chunk` is under 10 ms (base64 of the clip for the MERaLiON chat call now runs on every clip). If not, record it (IR-1).
- Cost stays $0: Workers free plan, no custom domain.
- The link is shared only with the team, the testers and the presenter and is not posted anywhere public, because anyone with it can use the quota (IR-13).

**Definition of done:** standard DoD, plus: the deployed URL is recorded in `reports/slice-5-engineer.md` and A has shared it privately with Person B (no code or key is needed); the user has used it on both phones; MERaLiON spend is recorded (target: under 20 requests and 2 minutes of counted audio across both phones); Person C's landing page and logo are live from `public/`.

---

### Slice 6: Evals (E2) and the E1 cards

**Stories:** US-13 (one command over the 15 clips; score table; MERaLiON vs Whisper particles; MERaLiON's own tone reading vs the final card's; saves cards for E1). Measures M2 (plain English left alone) and M3 (card speed), and produces E1's prepared cards.
**Who does what:** **Person B writes all the code and tests in this slice** (everything under `evals/`), from day 1, against the Team split contract and fixture JSON, on a `b/...` branch, and runs the real evals. **Person A's part is only integration and review:** A's controller runs the fresh-context `slice-6-reviewer` on B's PR diff (same checks as section 2: spec, tests, coverage, security, conventions); B fixes Critical and Important findings on their branch; A runs `npm test` and `npm run coverage` on the branch merged with `main`, merges it, deploys the current `main`, gives B the go for the MERaLiON run, and walks the demo with the user. There is no Worker-side work left: the only server hook the evals need, `x-asr: whisper`, shipped in slice 4, and `/api/chunk` and `/api/budget` are unchanged. If the review finds that the Worker must change (for example a `ChunkResult` field the evals need), A makes that change in `src/` and B adapts.
**Depends on:** slice 5 (the deployed app), and **Person B's deliverables**: the eval code PR (D2b, may merge any time before this slice starts, since it touches only `evals/`), the 15 WAVs in `evals/clips/` (never committed; shared privately), `evals/references.json` in the exact schema in the Team split section (passing `node evals/run.js --check`), and consent from everyone recorded (D2). The code needs from `main`: `TONES` (slice 1), `toCardModels`/`cardHtml` incl. `unsure` (slices 1–2), `src/client/app.css`, `MERALION_MODE` (slice 3). The real run needs only the deployed URL (slice 5), shared privately by A: no access code and no key.
**User provides:** the go for B's MERaLiON run after checking `/api/budget`. Each MERaLiON run spends quota from the monthly allowance: 15 clips × calls per clip (15 or 30 requests), about 2 min of audio per call (so about 4 min counted in `two_call` mode), and the tokens step 0 measured per clip.

**Demo script** (Person B runs steps 1–6 on their machine against the deployed app; A and the user look at the results together)
1. Convert clips: `afconvert -f WAVE -d LEI16@16000 -c 1 in.m4a evals/clips/01.wav` (or `ffmpeg -i in.m4a -ac 1 -ar 16000 -sample_fmt s16 evals/clips/01.wav`). `node evals/run.js --check` passes.
2. `node evals/run.js --base https://catch-no-ball.<subdomain>.workers.dev --asr whisper` (free; the only place Whisper is asked for by name, for the particle comparison), then, after A's go, `--asr meralion` (at least 3.25 min of wall time with one call per clip, 6.5 min with two, because of the gap).
3. The console shows: plain English left alone (M2, must be 100%; otherwise "M2 FAIL" and exit code 1), final tone match %, MERaLiON's own tone match % (from `hint`; shows whether the split helps), ambiguity honest %, particles kept %, median and max response time (M3), and any clip where the source differs from the one asked for.
4. Open `evals/results/<stamp>-meralion-cards.html` in a browser: the prepared E1 cards, one numbered section per clip, with no reference answers on the page.
5. Open `evals/results/<stamp>-meralion.csv` and fill in `meaning_ok` with a Singaporean teammate.
6. `node evals/run.js --compare evals/results/<stamp>-whisper.json evals/results/<stamp>-meralion.json` prints and saves the per-clip particle comparison CSV for the presentation chart.
7. B copies the score table, particle table and response times into `evals/RESULTS.md` (committed in a small PR; later B adds the E1 result there too). C builds the slides from it.
*Feedback wanted:* Is the table what you want to show at the presentation (Person C builds the slides from it)? Are the E1 cards suitable to show participants (Person B runs E1)?

**Files** (all Person B's; A edits none of them)
- Create: `evals/score.js`, `evals/runner.js`, `evals/cards-page.js`, `evals/run.js`, `evals/references.example.json`, `evals/fixtures/*.json` (hand-made `ChunkResult`s per the Team split, plus the real replies A shares after slice 3), `evals/README.md` (consent, conversion, running order: the Whisper comparison run first because it is free, then MERaLiON after A's go; MERaLiON budget per run; how E1 uses the cards page), `evals/RESULTS.md` (after the run).
- Tests: `evals/score.test.js`, `evals/runner.test.js`, `evals/cards-page.test.js` (picked up by `npm test` through the `evals/**/*.test.js` glob).
- Person A: no files. (`.gitignore` already lists `evals/clips/` and `evals/results/`; `test/all-modules.test.js` already imports `evals/*.js`.)

**Interfaces produced**
- Reference entry: exactly the schema in the Team split section (Person B writes `evals/references.json`).
- `evals/score.js`: `validateReferences(refs, clipNames?: string[]) -> string[]` returns readable errors (empty array = valid): not an array of 15; a clip name not matching `^\d{2}\.wav$` or duplicated; a missing or wrongly typed field; `tone` not in `TONES`; a plain entry (`hasSinglish: false`) with a non-empty `meaning`, a tone other than `neutral`, `ambiguous: true` or particles; fewer than 2 `ambiguous` entries; fewer than 10 Singlish or 5 plain entries; when `clipNames` is given, any reference without a clip or clip without a reference.
- `evals/score.js`:
  - `particlesKept(particles: string[], transcript: string) -> number | null`: fraction of particles found as whole words, case-insensitive; `null` when `particles` is empty.
  - `scoreClip(reference, result: ChunkResult) -> { plainLeftAlone: boolean | null, tone: boolean | null, hintTone: boolean | null, ambiguityHonest: boolean | null, particlesKept: number | null }`
    - `plainLeftAlone` (only when `reference.hasSinglish === false`): true only if `status === "ok"` and `toCardModels(result)` is exactly one `plain` card whose text equals `result.transcript.trim()`. This uses the real view code, so it checks what the user would see.
    - `tone` (Singlish references only): the first Singlish sentence's `tone` equals `reference.tone`; for an unsure sentence, true if either reading's tone matches. `false` if there is no Singlish sentence or the status isn't `ok`.
    - `hintTone` (Singlish references only, and only when `result.hint` is not null): `result.hint.tone === reference.tone`. `null` in `transcript_only` mode and for Whisper results.
    - `ambiguityHonest` (only when `reference.ambiguous`): the first Singlish sentence has `confident === false` and exactly 2 readings.
  - `summarise(scores) -> { n, plainLeftAlone, tone, hintTone, ambiguityHonest, particlesKept }`: each a percentage (0–100, one decimal) over the non-null values, `null` if none apply.
  - `formatTable(summary, timings: { medianMs, maxMs }, mismatches: string[]) -> string`
  - `toCsv(rows) -> string`: columns exactly `clip,reference_meaning,reference_tone,meralion_meaning,meralion_tone,app_said,app_meaning,app_tone,tone_ok,meaning_ok`, with `meaning_ok` left empty for a person to fill in (meaning is scored by a person, approved earlier). Fields are quoted per RFC 4180.
  - `compareParticles(whisperRows, meralionRows) -> Array<{ clip, particles, whisper, meralion }>` and its CSV.
- `evals/runner.js`: `EVAL_MERALION_GAP_MS = 13000`; `runEval({ clips: Array<{ name, bytes }>, references, asr, callsPerClip, send, sleep, now }) -> Promise<Array<{ clip, reference, result, ms, sourceMismatch, error }>>` (`error` is `null`, or the HTTP status or `"network"` for a clip that got no `ChunkResult`; such a clip counts as a miss in every score that applies to it). Sends one clip at a time, with `context: []`. Waits `EVAL_MERALION_GAP_MS × callsPerClip` (13000 or 26000 ms) between clips when `asr === "meralion"`, and 0 for Whisper. `callsPerClip` is 2 for `MERALION_MODE === "two_call"`, else 1. `sourceMismatch` is true when `result.source` differs from `asr` (for example, a MERaLiON run where the guard sent a clip to Whisper). Every clip that has no reference (and every reference that has no clip) is reported, not silently skipped.
- `evals/cards-page.js`: `cardsPage(rows, css: string) -> string`. A self-contained HTML page that renders each clip's cards with `toCardModels` and `cardHtml` from `src/client/cards.js`, inlines `src/client/app.css`, numbers the clips in reference order, and contains no reference meaning or tone.
- `evals/run.js` (CLI, coverage-excluded): parses `--base`, `--asr meralion|whisper`, `--limit <n>`, `--compare a.json b.json`, and `--check` (runs `validateReferences` against `evals/references.json` and the files in `evals/clips/`, prints the errors and exits 1 if any; makes no network call; this is what Person B runs before opening their PR); needs `--base` for a real run (missing → exit 1 before any request); reads `evals/references.json` and `evals/clips/*.wav`; computes calls per clip from `MERALION_MODE` in `src/meralion.js`; posts to `/api/chunk` exactly as in the Team split contract (multipart `audio`, `sessionId`, `context: "[]"`; `x-asr: whisper` only for `--asr whisper`, so `--asr meralion` takes the app's normal `auto` path; no auth header); writes `evals/results/<stamp>-<asr>.json`, `.csv` and `-cards.html`; prints `formatTable`; exits 1 if `plainLeftAlone < 100`. Re-runs are served from the KV cache (`cached: true`), so they cost no MERaLiON quota.

**Tests**
- `evals/score.test.js` (fixtures from `evals/fixtures/`)
  - `particlesKept: "lah" counts in "cannot lah" but not in "lahat"`; `case-insensitive ("LOR")`; `1 of 2 found → 0.5`; `no particles → null`.
  - `plainLeftAlone is true for one plain card equal to the transcript`; `false when the clip was marked Singlish`; `false when a meaning or tone would show`; `false for meaning_unavailable or uncaught`; `null for Singlish references`.
  - `tone matches the reference`; `an unsure sentence matches if either reading has the reference tone`; `null for plain references`.
  - `hintTone compares MERaLiON's tone with the reference`; `null when hint is null`.
  - `ambiguityHonest needs confident false and exactly 2 readings`; `null when not ambiguous`.
  - `validateReferences accepts references.example.json`; `rejects a tone outside TONES, a bad clip name, a duplicate, a plain entry with a meaning, fewer than 2 ambiguous entries, and a reference whose clip file is missing`.
  - `summarise gives percentages over non-null values` (e.g. 2 of 3 → 66.7) `and null when none apply`.
  - `toCsv has the exact header and an empty meaning_ok column, and quotes commas and quotes`.
  - `formatTable shows "M2 FAIL" when plainLeftAlone is below 100`.
  - `compareParticles pairs clips by name`.
- `evals/runner.test.js` (fake `send`, recording `sleep`, fake clock)
  - `sends clips in reference order, one at a time`.
  - `waits 13000 ms between MERaLiON clips at one call per clip, 26000 ms at two, and 0 for Whisper` (sleep calls `[13000, 13000]` / `[26000, 26000]` for 3 MERaLiON clips; none for Whisper).
  - `records ms per clip from the clock`; `flags sourceMismatch when meralion was asked for and whisper answered`.
  - `reports clips without references and references without clips`.
  - `a send that rejects or returns a non-200 is recorded as that clip's error and the run continues`.
- `evals/cards-page.test.js`: `contains every clip's cards in order`; `does not contain any reference meaning`; `does not contain MERaLiON's unchecked reading`; `escapes model text`; `inlines the CSS`.

**Acceptance criteria**
- One command prints the E2 table, including the M2 check, MERaLiON's tone vs the final card's, and the particle comparison input (US-13).
- `node evals/run.js --check` validates Person B's references and clips without any network call.
- Any plain-English miss fails the run (exit code 1) (M2).
- The E1 cards page needs no network and uses no MERaLiON quota (E1 rules).
- `evals/clips/` and `evals/results/` are gitignored; only `references.example.json`, `references.json`, `fixtures/`, `RESULTS.md`, code and tests are committed.
- B's PR touches only `evals/`; every `evals/*.js` except `run.js` is covered (no file under 60% lines), and the repo-wide gate still passes.

**Definition of done:** standard DoD (with the reviewer's findings addressed by B), plus: a 2-clip Whisper smoke run (`--asr whisper --limit 2`) against the deployed app printed the table and wrote the CSV and cards page; once B's clips and references are in, the full Whisper and MERaLiON runs are done and their summaries are in `evals/RESULTS.md`; A records the review, the merge and the run's MERaLiON spend (from `/api/budget`) in `reports/slice-6-integration.md`.

---

### Slice 7: Keep my cards when the connection drops

**Stories:** US-9 (a "Subtitles paused, reconnecting" banner; cards stay; listening resumes by itself; "Missed some speech while offline"). The offline clip queue stays cut (PRD section 8): clips recorded while offline are dropped, not queued.
**Depends on:** slice 6 (order only; there is no code dependency). **User provides:** nothing.

**Demo script**
1. On the laptop: Listen, get a card, then Chrome dev tools → Network → **Offline**. Within one clip the banner "Subtitles paused, reconnecting" appears; the cards stay; "Translating" stays (the mic is still on).
2. Switch back to **Online**: within about 3 s the banner goes away, a faded "Missed some speech while offline" line appears, and the next clip produces a card without tapping anything.
3. On the iPhone (Safari) and then the Android phone (Chrome), against the deployed app: turn on airplane mode for 20 s while listening, then turn it off. Same behaviour on both.
4. Go offline and back without any clip being lost (shorter than one clip): no "Missed" line.
*Feedback wanted:* Is the banner noticeable without being alarming? Is losing the offline audio acceptable for now?

**Files**
- Modify: `src/client/queue.js`, `src/client/cards.js` (`notice` card), `src/client/app.js` (banner; also listens to `online` to probe at once), `src/pages/app.html`, `src/client/app.css`.
- Tests: extend `test/queue.test.js`, `test/cards.test.js`.

**Interfaces** (same function, extra options)
- `createClipQueue({ send, onResult, onStatus = () => {}, onMissed = () => {}, probe = async () => true, retryMs = RETRY_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) -> { push(item), size(), idle(), status(): "ok" | "reconnecting", probeNow() }`
  - A `send` that throws `ApiError` with kind `network` is a connection failure. Every other result, including 4xx and 5xx, goes to `onResult` as before and is not retried.
  - On a connection failure: `onStatus("reconnecting")` once; the failed item and every queued item are **dropped** and counted as missed; `push` while reconnecting drops the item and counts it.
  - While reconnecting: call `probe()` every `retryMs` (`probeNow()` triggers one at once, used by the `online` event). The first probe that resolves `true`: `onStatus("ok")`, then `onMissed(count)` if the count is above 0, then the count resets and new pushes are sent normally.
  - Text items (typed lines and retries) are kept, not dropped, while reconnecting, and sent once the connection is back (they are the user's own input; **my call**).
  - `probe` in `app.js` is `api.budget()` (a cheap GET that calls no model) mapped to `true` on any HTTP answer and `false` on a network error.
- `CardModel` `{ kind: "notice", text }`, rendered faded; `missedNotice() -> CardModel` returns `{ kind: "notice", text: COPY.missed }`.

**Tests** (`test/queue.test.js`, with `retryMs: 1` and a fake `sleep`)
- `a network failure reports reconnecting once, then ok after a successful probe`.
- `the failed clip and clips pushed while reconnecting are dropped and reported once via onMissed(n)` (fail 1, push 2 and 3 offline, probe ok → `onMissed(3)`; `onResult` never sees 1–3).
- `no missed clips → onMissed is not called`.
- `typed text pushed while reconnecting is sent after reconnecting, in order`.
- `probes repeat every retryMs until one succeeds` (probe false, false, true → 3 probes).
- `probeNow probes immediately`.
- `400 and 500 are results, not connection failures` (status stays `ok`).
- `order is kept for clips pushed after reconnecting`.
- `test/cards.test.js`: `the missed notice renders faded with "Missed some speech while offline"`.

**Acceptance criteria**
- Cards already shown are never removed by a connection drop.
- The app recovers with no tap; the banner is visible for exactly as long as the queue status is `reconnecting`.
- "Missed some speech while offline" appears only when audio was actually dropped.

**Definition of done:** standard DoD, plus: the user has tried airplane mode on both the iPhone and the Android phone against the deployed app.

**After slice 7, the release check** (controller and user, day 6): `npm test` and `npm run coverage` pass on `main`; both secrets are set (`OPENCODE_API_KEY`, `MERALION_API_KEY`; `npx wrangler secret list`); `/api/budget` shows enough left for the demo (at least 900 s of audio, 250 requests, 25,000 tokens; nothing is held back for it), after adding the local development usage from the engineer reports (IR-7), and MERaLiON's own console agrees if it shows usage; the presenter's phone has produced one MERaLiON card on the deployed link with no "Backup mode"; the landing page and app work on both the iPhone (Safari) and the Android phone (Chrome); the 60 s demo script from PRD section 8 has been rehearsed once; Person C's landing page and logo are live; Person B's E1 result is in `evals/RESULTS.md`; the video (Person C's) is recorded.

---

### Slice 8 (Should, optional): Tap a term; add to home screen

Start only if slices 1–7 are done, tested and accepted.

**Stories:** US-14 (term sheet, A9), US-15 (manifest and icon, L2).
**Depends on:** slice 7; for the home-screen half, **Person C's** `public/manifest.webmanifest`, `public/icon-180.png` and the three `<head>` tags in `public/index.html` (D5, contract in the Team split). If C's files are not in, the term sheet half ships alone and the manifest tests stay `todo`. **User provides:** nothing.

**Demo script**
1. Say or type the demo sentence, then tap the underlined *siam*: a small sheet shows "siam", a gloss like "skip / avoid", and **Learn more**, which opens `https://singlishdict.app/?q=siam` in a new tab.
2. Type a line with a made-up term the model marks unknown: the sheet shows "New to me" and keeps the link.
3. On the iPhone (Safari): Share → Add to Home Screen; on the Android phone (Chrome): ⋮ → Add to Home screen. The icon and name are "Catch No Ball", and opening it goes straight to the app, full screen.

**Files**
- **Owned by Person C (front-end half):** `public/manifest.webmanifest`, `public/icon-180.png` (made once from `public/logo-mark.svg`, committed as a binary, so there is still no build step) and the three tags in `public/index.html`. They are static assets: no route, no `index.js` import and no wrangler rule is needed (`.webmanifest` is served as `application/manifest+json`, `.png` as `image/png`).
- Modify (Person A, Worker half): `src/client/cards.js` (`learnMoreUrl`, `termSheetModel`), `src/client/app.js` (sheet), `src/pages/app.html` (`<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="/icon-180.png">`, `theme-color`). No change to `src/router.js`, `src/index.js` or `wrangler.toml`.
- Tests: extend `test/cards.test.js`, `test/pages.test.js` (the manifest checks below, `todo` until C's files exist).

**Interfaces**
- `learnMoreUrl(term) -> string`: `"https://singlishdict.app/?q=" + encodeURIComponent(term)`. Link out only; never fetch, scrape or send that site's content to a model (its terms forbid it).
- `termSheetModel({ term, gloss, known }) -> { title, body, link }`: `body` is the gloss when `known`, else `COPY.newToMe`.
- `public/manifest.webmanifest` (Person C): exactly the fields in the Team split contract (`start_url: "/app"`, `display: "standalone"`, icons `/logo-mark.svg` and `/icon-180.png`).

**Tests**
- `learnMoreUrl("siam") === "https://singlishdict.app/?q=siam"`; `learnMoreUrl("can or not") === "https://singlishdict.app/?q=can%20or%20not"`.
- `termSheetModel shows the gloss for a known term and "New to me" plus the link for an unknown one`.
- `markTerms puts data-term on each underlined term so the sheet can find it`.
- `test/pages.test.js`: `public/manifest.webmanifest parses as JSON with name, short_name, start_url "/app", display "standalone" and both icons`; `public/icon-180.png starts with the PNG signature and is 180×180 (IHDR)`; `app.html and public/index.html link the manifest and the apple-touch-icon and have a theme-color meta`.
- Deployed check in the demo: `curl -sI …/manifest.webmanifest` shows `application/manifest+json`.

**Acceptance criteria:** US-14 and US-15 "done when" from the PRD; no request is ever made to singlishdict.app by our code.

**Definition of done:** standard DoD, plus: the user has added the app to the home screen on both the iPhone and the Android phone.

---

## 6. Risks

PRD risks keep their PRD numbers (R1–R11). Risks this plan adds are numbered IR-1 onwards.

| # | Risk | Where it bites | Mitigation in this plan |
|---|---|---|---|
| R1 | MERaLiON drops particles from the transcript. | Tone accuracy (M1). | Day-1 check (Person B); MERaLiON's own tone-of-voice reading may still catch them; OpenCode Go uses context and wording; evals compare particles and MERaLiON's tone honestly (slice 6). MERaLiON stays either way. |
| R2 | Newcomers won't look at a phone mid-meeting. | Slice 3's UI. | Person B's test, needed before slice 3's demo; recap mode is a small change to `app.js` only. |
| R3 | MERaLiON's request or response format differs from the guess. | Slice 3. | Step 0 of slice 3 makes real requests with the user's key before any MERaLiON code is written; the saved fixtures drive the tests. If MERaLiON does not answer at all, the engineer stops and the user decides (Whisper is not silently substituted). |
| R4 | Safari mp4 vs Chrome webm. | Slice 3. | Avoided: AudioWorklet PCM and WAV encoded on the phone. |
| R5 | Card speed misses 15 s (M3), more likely with 25 s clips or two calls. | Demo. | Step 0 prefers the one-call `combined` mode (15 s clips); measured in slice 6 and a rehearsal. In `two_call` mode, `CLIP_SECONDS = 25` delays cards; the alternative is `transcript_only` with 15 s clips. The user decides at slice 3's demo. |
| R6 | E1 too small; hearing clips twice flatters the score. | Presentation. | Report it, per the PRD. |
| R7 | MERaLiON's monthly quota (requests, audio, tokens) runs out before demo day; more likely now that development and option B both use it. | Demo. | Guard counts every request, audio second and token from the first MERaLiON call (slice 3); development practice in section 1; `/api/budget` shows what is left (the whole free tier is usable, nothing is held back). If the quota runs out anyway, the app keeps working on the Whisper fallback with "Backup mode" showing. |
| R8 | A clip cuts a sentence in half. | Live use. | The previous sentence is sent as context (slice 2). |
| R9 | The hosted API doesn't serve MERaLiON-3 10B or doesn't accept audio in chat, so option B can't run. | Slice 3. | Step 0 checks it first; fallback `transcript_only` (option A), which the presentation states honestly. |
| R10 | Two calls per clip break the 5-a-minute limit at 15 s clips and may double audio use; tokens per call unknown. | Slice 3 onward. | Step 0 tries one combined call first, measures tokens per clip and sets `CLIP_SECONDS`; the guard counts every call, keeps a spare slot for transcripts and enforces the token limit. |
| R11 | MERaLiON's reading is wrong or unsafe (it isn't safety-aligned). | Every card. | It is only an input to OpenCode Go, never shown on screen (tests); the final tone must be one of the six labels; `hasSinglish` comes from the transcript; evals score MERaLiON's tone separately. |
| IR-1 | **Worker CPU over 10 ms**: base64 of every clip for the MERaLiON chat call (option B) plus multipart parsing. | Slices 3–5. | 16 kHz mono keeps a 15 s clip at about 480 KB (25 s: 800 KB); chunked base64; measured in slice 5 from the dashboard. Fallback: the phone also sends the clip as base64 (one more form field), and the Worker passes it through. |
| IR-2 | iOS stops audio when the screen locks or the tab is backgrounded. | Live demo. | Wake Lock request on Listen; the demo script tells the presenter to keep the screen on; checked on both phones in slice 5. |
| IR-3 | Noise turns into "Couldn't catch that" cards or invented text. | Glanceability. | Client silence threshold `SILENCE_RMS = 0.01` (tunable after slice 3 feedback); the empty-transcript rule can be switched to "silent" in one line if feedback says so. |
| IR-4 | OpenCode Go key limits or monitoring (Q3). | Every card. | At most 2 calls per clip; `passes` is logged in every result so usage can be counted; a 20 s timeout. |
| IR-5 | Feedback rounds stall the week (8 checkpoints). | Schedule. | Demo scripts are short (about 5 min each); the last slice is optional; B and C code in parallel in their own folders from day 1, and slice 6's code is B's, so A's slice 6 round is review and integration only. |
| IR-6 | A model rewrites a plain-English sentence in a mixed clip. | M2. | `enforceVerbatim` shows only exact transcript spans and drops a plain sentence it can't match; a MERaLiON reading never sets `hasSinglish`; evals fail on any plain miss. |
| IR-7 | Two guard counters, one MERaLiON quota. The local guard (`.wrangler/state`) and the deployed guard count separately, and each allows 5 a minute, but MERaLiON's limits are per account. | Budget, rate. | Keep local spend small and logged per slice; the release check adds local usage to the deployed counter; MERaLiON 429s go to the Whisper fallback (from slice 4); never delete `.wrangler/state`. |
| IR-8 | MERaLiON is slower or less available than Whisper, and there is no Whisper-first mode to hide it. | Card speed, demo. | User's decision: MERaLiON is the main model. The fallback covers errors and refusals; MERaLiON's response time is recorded in step 0 and slice 6 (M3). |
| IR-9 | Teammates' pieces arrive late (C's landing page for slice 5; B's eval code, clips and references for slice 6; C's manifest and icon for slice 8) or break the build. | Slices 5, 6, 8. | Folder ownership: B and C touch only `evals/` and `public/`, so their PRs can't break A's code, and A's slices never wait on them to build. Slice 5 deploys without C's page (`/` 404s until it lands); the landing and manifest tests are `todo` until C's files exist. The contracts are tests (`test/pages.test.js`, `node evals/run.js --check`, `npm run coverage`) the teammates run before their PRs. B starts the eval code on day 1 with fixtures, so only the clips are late-sensitive. |
| IR-10 | A file in `public/` shadows a Worker route (for example `public/app.html` replacing the app), or C adds a script or external URL to a static page. | `/app`, privacy. | `run_worker_first = ["/app", "/api/*", "/client/*"]`; `test/config.test.js` rejects reserved names in `public/`; `test/pages.test.js` rejects `<script>` and external URLs in C's pages; A reviews every `public/` PR. |
| IR-11 | B's eval code drifts from the real `ChunkResult` (fixtures written by hand), so scores are wrong on the real run. | Slice 6, presentation numbers. | The shapes are fixed in section 1 and A tells B before any change; A shares real `/api/chunk` replies after slice 3 for B's fixtures; the 2-clip Whisper smoke run against the deployed app before the full run; `plainLeftAlone` and the cards page use A's real `toCardModels`/`cardHtml`, not a copy; the fresh-context `slice-6-reviewer` checks B's PR against this plan. |
| IR-12 | Someone edits outside their folders, or B and C merge stale branches, and A's push overwrites or conflicts. | Every merge. | Rules in the Team split: shared files are A-only; PRs touch only the owner's folders (A checks the diff's paths before merging); A's session merges `main` into its slice branch before the PR; B and C pull `main` before opening a PR. |
| IR-13 | **Anyone with the public link can use the app's MERaLiON quota.** There is no access code and no demo key (user's decision, accepted 2026-11-20). A stranger or a bot could spend the monthly allowance before demo day, and `/api/text` and OpenCode Go calls have no limit of their own. | Quota, demo, OpenCode Go usage. | Keep the link private: share it only with the team, the testers and the presenter, and post it nowhere public. The rate guard still applies (5 a minute, plus the monthly requests, audio seconds and tokens), so MERaLiON use is bounded and the app drops to Whisper with "Backup mode" when it runs out. `/api/budget` is checked in the release check before the demo. If abuse shows up, a gate can be added later as a small change. |

## 7. Assumptions this plan makes

- Node v22.10 on the developer's Mac; the coverage flags above exist (verified).
- `npx wrangler login` works for the user's Cloudflare account, the free plan allows SQLite-backed Durable Objects, and Workers AI's free daily allowance covers development and backup use.
- Workers AI `whisper-large-v3-turbo` takes base64 `audio` and returns `{ text }` (check its schema page in slice 4).
- MERaLiON's API is OpenAI-style (multipart `file` for transcription; `input_audio` content parts for chat) until step 0 of slice 3 says otherwise; it accepts 16 kHz mono PCM16 WAV of up to 30 s.
- MERaLiON counts audio per request (the guard assumes so; this is the safe side) and reports tokens in `usage`. If it doesn't report tokens, the guard counts 0 and the token limit is watched in MERaLiON's own console instead.
- About 19 minutes of counted MERaLiON audio and under 250 requests cover development, evals and rehearsals (guess), leaving room in the 60 minute / 1,000 request allowance for the demo. Nothing is held back for the demo, so the presenter checks `/api/budget` first.
- The user accepts that the app is open to anyone with the link (decisions.md, 2026-11-20 update); the link stays private (IR-13). The only secrets are `OPENCODE_API_KEY` and `MERALION_API_KEY`.
- The user tests and presents on both an iPhone (Safari) and an Android phone (Chrome).
- OpenCode Go is OpenAI-compatible at `/chat/completions` and can be called from a Worker, as Lunch Uncle does.
- AudioWorklet is available in current iPhone Safari and Android Chrome; `AudioContext.sampleRate` is usually 48000 or 44100.
- One request in flight at a time is fast enough: processing a clip (about 5–10 s) is shorter than recording the next one (15 s).
- **(my calls)** A retry that fails turns the whole clip into "Meaning unavailable, tap to retry". A plain sentence that can't be matched word for word in a mixed clip is dropped rather than shown reworded. An empty transcript from a non-silent clip shows "Couldn't catch that". Typed text survives a connection drop; audio clips don't. `MAX_TEXT_CHARS = 1000`. The mic-blocked help wording.
- Subagents do not commit; the controller commits on the slice branch and merges it to `main` by PR after each user OK. Reports go in `./reports/`.
- Person B's eval code PR, clips and references arrive by day 4; E1 participants are booked for day 5–6. Person C's landing page arrives by day 3 (the logo and icon mark are already in `public/`).
- Cloudflare Workers static assets (`[assets] directory = "./public"`) are free and unlimited on the Workers free plan and deploy with the Worker in one `npx wrangler deploy`. `run_worker_first` accepts an array of route patterns and `not_found_handling`/`html_handling` default to `"none"`/`"auto-trailing-slash"` (checked in the wrangler 4.158 config schema); `wrangler dev` serves `public/` locally the same way. `.webmanifest` is served as `application/manifest+json` (checked in wrangler's MIME table).
- Node v22.10 runs B's ES-module tests with `node --test "evals/*.test.js"` before `package.json` exists (checked in a scratch project; the bare folder form `node --test evals/` fails on 22.10). A test glob that matches nothing (`evals/**/*.test.js` before B's first PR) does not fail `npm test` (checked).
- B and C have Node v22 and `git`; C can preview `public/` with `python3 -m http.server` (preinstalled on macOS with the Xcode command line tools) or any static server.
- PRD.md (revision 1) still mentions "a setting forces Whisper during development" (B2a). This plan follows the user's later instruction instead: no Whisper in development or demos.

## 8. Questions only the user can answer

1. **Q3 (still open):** does the course's OpenCode Go key have a usage limit we should design for? The plan assumes no hard limit and makes at most 2 calls per clip.
2. **After step 0 of slice 3:** if MERaLiON-3 10B isn't served, or only `two_call` mode works (25 s clips, slower cards), which do you prefer: `two_call`, or `transcript_only` (option A) with 15 s clips?
3. **Day-0 values:** please put `OPENCODE_API_KEY` and `MERALION_API_KEY` in `.dev.vars` at the project root yourself. They are never sent in chat.
