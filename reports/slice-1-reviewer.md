# Slice 1 reviewer report: Type a line, get a card

Reviewer: `slice-1-reviewer` (fresh context). Branch `a/slice-1-type-to-card`, commits `dde49fb..8309880`.
Inputs: IMPL.md (Team split, section 1, section 2, Slice 1), PRD.md (US-4, US-5, US-8, US-11, M2, A1/A4/A5/A7), `.superpowers/main-flow/slice-1.diff`, `reports/slice-1-engineer.md`. `.dev.vars` was not read.

## Verdict: Needs fixes

The slice is solid and close to the spec. There are 3 Important findings, each a small change. None needs a design change.

## Strengths

- **M2 guard is right.** `enforceVerbatim` (src/interpret.js:109-119) returns `transcript.trim()` for an all-plain line. In a mixed line it drops a reworded plain sentence. `parseSentence` (src/interpret.js:25) normalises plain sentences whatever the model said. `toCardModels` (src/client/cards.js:44-47) builds a plain card from `said` only, so a stray `meaning` can never render. Each of these steps has a test, including the apostrophe case from the spec.
- **Fixed tone list is enforced at the boundary.** `TONES` matches exactly and in order (src/prompt.js:1). The parser rejects any tone outside it, for both the sentence and its readings (src/interpret.js:28,34). The prompt lists the tones and includes the exact `confident:false` sentence.
- **Escaping is done properly.** `markTerms` matches on raw text, then escapes each segment (src/client/cards.js:13-37). Every model or user string in `cardHtml` goes through `escapeHtml`, including the id, `data-term` and the tone class (sanitised to `[a-z]`). Tests cover `<img onerror>`, a hostile term, a hostile tone and a hostile id.
- **Error paths become cards, not crashes.** A non-2xx reply, a rejected fetch or timeout, a non-JSON body, missing `choices`, empty or null content and a schema violation each throw `InterpretError` and become `meaning_unavailable` (src/interpret.js:123-150, src/pipeline.js:30-35). The log line holds only the error message and never the key.
- **The tests check behaviour.** They check real parser and guard output, exact headers and URL, and the queue ordering with a slow first send. Fakes are used only at the network boundary. `test/all-modules.test.js` makes untested files visible to coverage.
- **No runtime dependencies and no build step.** The only devDependency is `wrangler`, and a test asserts this.

## Findings

### Critical

None.

### Important

**I1. Errors are swallowed without a log line.**
- src/router.js:33: `catch { return json({ error: "server" }, 500); }` discards the error. Any bug in a handler (and in slice 3, in `/api/chunk`) becomes an anonymous 500 with nothing in `wrangler tail`.
- src/client/queue.js:19: `catch { /* a UI bug must not stop the queue */ }` hides rendering bugs in the browser entirely.
- *Fix:* router: `catch (e) { console.error(\`handler failed: ${request.method} ${pathname}: ${e && e.message}\`); return json(...) }`. Log the message only, never the body or headers. Queue: `catch (e) { console.error("onResult failed", e); }`. Add a test that spies on `console.error`.

**I2. `app.js` makes decisions that no test covers** (IMPL section 1, coverage exclusions: "`app.js` makes no decisions… what an error means… lives in a tested module"; section 2 lists this as a review check).
- src/client/app.js:31-33 maps an API error (network, 4xx, 5xx) to a `meaning_unavailable` card built from the typed text.
- src/client/app.js:35 assigns card ids (`cardId`, `cardId-i`).
- src/client/app.js:36 decides which cards can be retried.
- This is the US-11 path for "offline or server down", and nothing tests it.
- *Fix:* move this into `cards.js`, for example `renderResult(item, result, error) -> { html, retryable: boolean }`, with tests for: error becomes an unavailable card holding the typed text, multi-sentence ids, and an ok result is not retryable. `app.js` then only calls `insert(...)`.

**I3. `context` has no size limit, which gets around `MAX_TEXT_CHARS` on an endpoint with no authentication.**
- src/pipeline.js:27 and src/interpret.js:122 filter `context` by type only. Any caller can send `{"text":"hi","context":["<500 KB>"]}`, and the last entry goes into the prompt on the course key. That costs up to the model's context window on every request, against the intended bound of 1000 characters.
- *Fix:* in `handleText`, keep at most the last 3 strings (`CONTEXT_KEEP`) and drop (or truncate) any longer than `MAX_TEXT_CHARS`. Test with an oversized entry.

### Minor

1. **`hint` missing from the ChunkResult.** src/pipeline.js:31,34. The shared contract (IMPL section 1) says `hint: null` for text, but the response leaves the field out. Add `hint: null` to both responses and the pipeline tests.
2. **`sessionId` is not checked for header-safe characters.** src/pipeline.js:22-26. A `sessionId` with non-ASCII text or CR/LF makes `fetch` throw on the `x-opencode-session` header, so every line becomes "Meaning unavailable" with no clear cause. Accept only `/^[A-Za-z0-9_-]{1,100}$/`, otherwise use a new UUID.
3. **A missing key still makes a request.** src/interpret.js:127. If `OPENCODE_API_KEY` is unset, the request sends `Bearer undefined`. Throw `InterpretError("OPENCODE_API_KEY is not set")` before fetching, so the log says why.
4. **Only the button retries.** src/client/app.js:56. The demo script (step 5) and the copy say "tap the card", but only the `.retry` button responds. The card already has `data-card-id`, so use `e.target.closest(".card.unavailable")`.
5. **The config test does not pin the Text-rule globs.** test/config.test.js:40-52 checks that `type = "Text"` exists but not the globs, so the glob bug passed every test. Assert the exact `globs = ["**/*.html", "**/*.css", "**/client/*.js"]`. Also update IMPL.md:186, which still says `src/**`, so a later slice does not change it back.
6. **The same `context` filter appears three times.** src/pipeline.js:27, src/interpret.js:122, src/prompt.js:19. Use one `cleanContext()` helper in one place (and apply the I3 limits there).
7. **The pending card reuses the "Translating" label.** src/client/cards.js:76 shows `COPY.translating` + "…" on each pending card. In US-3 that copy is the label that stays on while the mic is on. Reusing it per card will be confusing once slice 3 adds the real label. Use a neutral pending state, such as a spinner or the faded text alone.
8. **An unsure sentence looks confident.** src/client/cards.js:44-47 ignores `confident`, so a `confident:false` sentence shows one tone chip like a confident one. The spec allows this until slice 2 ("Ambiguous lines may still show one guess"). Recorded here so slice 2 closes the "never one confident wrong tone" anti-goal.
9. **A plain sentence can show truncated.** src/interpret.js:94-105. `verbatimSpan` matches a prefix: if the model's plain `said` leaves out trailing words, the card shows a shorter span. Example: transcript `Let's move on to the next item please. Can lah.` with model `said` `Let's move on to the next item` gives `Let's move on to the next item`. The words shown are verbatim but incomplete. Consider extending a plain span to the next sentence end (`.?!` or end of transcript), and add a test.
10. **The todo landing tests run their bodies, and C's file has the wrong name.** test/pages.test.js:38 runs the four todo tests, which dump ENOENT stack traces into the output. Wrap the body (`hasLanding ? fn(read(...)) : undefined`) or don't run it. Separately, Person C's landing page is committed as `public/landing.html`, not `public/index.html`. So `/` returns 404 even though a page exists, and the contract tests never run against it. Ask C to rename it (C's file, not A's).
11. **No size check before parsing the body.** src/pipeline.js:12. `request.json()` parses a body of any size before checking it. Reject a `content-length` over about 16 KB with `bad_text`.
12. **No security headers on `/app`.** src/http.js:12-14. As defence in depth for the `insertAdjacentHTML` rendering, add `x-content-type-options: nosniff` and a CSP (`default-src 'self'; style-src 'self'; img-src 'self'`).
13. **The `texts` map only grows.** src/client/app.js:12,42 adds every typed line and never removes one. Delete the entry when a result is not retryable (this falls out of I2).
14. **The `deps` default is fragile, and the timeout path has no test.** `handleText(request, env, deps = { interpret })` (src/pipeline.js:9) breaks if any caller passes a third argument. That is the bug the engineer fixed. The router fix is correct and locked in by test/router.test.js:83-89. A `createHandleText(deps)` factory, or passing deps explicitly in `src/index.js`, would make it robust for slice 3's handlers. There is also no test that a `TimeoutError` abort becomes `InterpretError`. The generic rejected-fetch test covers it structurally.

## Engineer's flagged concerns

- **Text-rule globs (`**/*.html`, `**/*.css`, `**/client/*.js`): correct.** Wrangler resolves rule globs against `base_dir`, which defaults to the folder of `main` (`src/`). `**/` matches zero folders, so `client/app.js` and `pages/app.html` match. The smoke run confirmed `/app` and `/client/*` return 200. Follow-ups are Minor 5: pin the globs in the config test and fix IMPL.md:186.
- **Router handler arguments: correct.** src/router.js:32 calls `handler(request, env)` and the test asserts exactly two arguments. See Minor 14 on hardening.
- **`/` returns 404 until C adds `public/index.html`: correct per spec.** IMPL Slice 1, demo step 8 and the router interface both say so, and test/router.test.js:30 asserts it. The catch is Minor 10: C's page exists as `landing.html`, so the 404 is now a naming problem to raise with C.

## Spec compliance summary

Every listed file, interface, constant, copy string, test file and named test assertion in Slice 1 is present. The exact values all check out: model, base URL, user-agent, 20000 ms timeout, temperature 0.2, no `response_format`, `context.slice(-1)`, the 1000-character limit with the 1000/1001 boundary tested, and `passes: 1` on failure. `wrangler.toml` has no bindings and has `[assets]` with `run_worker_first`. The app sends `context: []`, which is fine: context belongs to slice 2 (`session.js`).

## Coverage gate

- The flags exist in Node v22.10 (`node --help`).
- The thresholds are 81/81/81, and test/config.test.js:69-71 asserts them.
- The exclusions are exactly the IMPL list:
  - `src/index.js`: text imports Node can't load.
  - `src/client/app.js`: DOM glue only.
  - `evals/run.js` and `evals/**/*.test.js`: Person B's CLI and test files.
- They are justified, except that `app.js` currently holds logic that should be tested (I2).
- No single included file is under 60%.

## Commands run

| Command | Result |
|---|---|
| `npm test` | 101 tests: 97 pass, 0 fail, 4 todo (landing contract). |
| `npm run coverage` | Exit 0. All files: 99.12% lines, 98.48% branches, 97.96% functions. Lowest: prompt.js 93.33% lines / 85.71% branches (slice 2's `retry` branch, lines 24-25); interpret.js 98.67% (lines 70-71: invalid JSON after the brace slice); cards.js functions 92.31%. Output also shows ENOENT stack traces from the todo landing tests (Minor 10). |
| `node --help \| grep test-coverage-…` | All five coverage flags present. |
| `node --version` | v22.10.0. The locked wrangler version is 4.158.0. |
| `git log -- public/landing.html` | C's landing page is committed as `landing.html` (`d462d44`, `40f8492`). |

I didn't run wrangler or call any network API. I didn't edit, commit or stash anything.
