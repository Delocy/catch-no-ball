# Slice 1 engineer report: Type a line, get a card

## Built
Typed text -> `POST /api/text` -> OpenCode Go (`deepseek-v4.1-flash`) -> card, plus the `/app` page.
Files: `package.json`, `package-lock.json`, `wrangler.toml`, `.dev.vars.example`, `CLAUDE.md`; `src/index.js router.js http.js prompt.js interpret.js pipeline.js`; `src/pages/app.html`; `src/client/{app.js,app.css,copy.js,api.js,queue.js,cards.js}`; 12 test files plus `test/helpers/replies.js`. Nothing in `public/`, `evals/`, `docs/presentation/` touched.

## Tests and coverage
`npm test`: 101 tests, 97 pass, 0 fail, 4 todo (landing contract, waiting for Person C's `public/index.html`).
`npm run coverage` exit 0: all files 99.12% lines, 98.48% branches, 97.96% functions (lowest file: prompt.js 93.3% lines; the `retry` branch is slice 2's).

## TDD evidence
RED (`npm test` before any src existed): every test file failed with `ERR_MODULE_NOT_FOUND` (src/interpret.js, src/pipeline.js, src/prompt.js, src/client/*.js); 10 pass (config/pages tests) 14 fail. GREEN after implementing: 99 pass, 0 fail. Later bug fixes (router ctx, empty content) were added as tests (router test passes only after the fix; empty-content test documents behaviour that the parser already enforced).

## Smoke check (real key, `npx wrangler dev --port 8799`)
- `Eh the deadline confirm cannot shift one lah` -> `status ok`, tone **firm**, meaning "The deadline definitely cannot be changed.", confident, terms Eh / confirm / one / lah, passes 1.
- `Let's move on to the next agenda item.` -> one plain sentence, meaning "", tone neutral, words unchanged.
- `{"text":""}` -> 400 `{"error":"bad_text"}`.
- `/app`, `/client/*.js|css` -> 200 with the right content types; `/logo.svg`, `/logo-mark.svg` -> 200 from `public/`; `/` -> 404 (no `public/index.html` yet, expected).
- Not done: viewing `/app` in a browser (card rendering and dark mode were not visually checked).
Smoke exposed two bugs that unit tests missed (fixed): (1) wrangler's Text rule globs are relative to the entry folder `src/`, so IMPL's `src/**` globs did not match (now `**/*.html`, `**/*.css`, `**/client/*.js`); (2) the router passed `ctx` as the third handler argument, clobbering `handleText`'s `deps` default (router now calls handlers with `(request, env)`; test added).

## Try it
`npm install`, `cp .dev.vars.example .dev.vars` and fill in `OPENCODE_API_KEY`, `npm run dev`, open `http://localhost:8787/app` (375x812). Type the deadline sentence: card with underlined confirm/lah, meaning, chip "firm". Type `Let's move on to the next agenda item.`: faded dashed line, words only. Wrong key: "Meaning unavailable, tap to retry"; fix key, restart, tap it.

## Notes and concerns
- Deviation: wrangler.toml globs (above). Context is sent as `[]` from the app (context belongs to slice 2).
- Reasoning model: no `max_tokens` sent; empty/null/non-JSON content throws `InterpretError` -> unavailable card (per coordinator note; test added).
- `handleText` logs `interpret failed: <message>` with `console.error` (no secrets) to make failures diagnosable.
- `app.js` untested by design; it only wires cards.js/queue.js/api.js. Not checked in a real browser.
- Landing tests are `todo` until C adds `public/index.html` (C's file may be named `landing.html` currently).

## Review fixes (response to reports/slice-1-reviewer.md)
Test-first: new tests added, `npm test` showed 8 failing, then the fixes below.
- **I1** `src/router.js` logs `handler failed: <METHOD> <path>: <message>` (no body, headers or secrets); `src/client/queue.js` logs `onResult failed: <message>`. Tests spy on `console.error`.
- **I2** New `renderResult(item, result, error) -> { html, retryable }` in `src/client/cards.js` (error to unavailable card, ids `c`, `c-1`, `c-2`, retryable flag), tested. `app.js` just inserts the html and deletes the retry text when not retryable (also fixes Minor 13).
- **I3** `cleanContext` in `src/prompt.js` (last `CONTEXT_KEEP = 3`, each capped at `MAX_CONTEXT_CHARS = 1000`, strings only), used by `handleText`, `interpret` and `buildMessages` (also Minor 6). Tests with a 500,000-char entry.
- Minors fixed: 1 (`hint: null` on every text result), 2 (sessionId must match `/^[A-Za-z0-9_-]{1,100}$/`, else a UUID), 3 (missing `OPENCODE_API_KEY` throws `InterpretError` before any fetch), 4 (tapping anywhere on an unavailable card retries), 5 (config test pins the exact Text-rule globs; IMPL.md untouched as instructed), 10a (todo landing tests no longer run their bodies, so no ENOENT noise).
- Deferred: 7 (pending label wording, revisit with slice 3's real label), 8 (unsure shows one chip: slice 2), 9 (plain span truncation: needs a design choice for slice 2's sentence handling), 10b (C renames `landing.html`: C's file), 11 (body size check) and 12 (security headers/CSP: the CSP needs checking against the inline-free app page, better with slice 5 deploy), 14 (deps factory: router fix is locked by a test; revisit in slice 3).
- Results: `npm test` 109 pass, 0 fail, 4 todo. `npm run coverage` exit 0, all files 99.17% lines, 98.51% branches, 98.08% functions.
