# Slice 2 engineer report: Honest when unsure (two readings)

## What was built
- `src/interpret.js`: `interpret` split into `callOpenCode` plus the two-pass flow. Pass 1 uses `context.slice(-1)`. If any Singlish sentence has `confident:false`, pass 2 runs with `context.slice(-3)`, `retry: true`, `requireReadings: true`, and returns `passes: 2`. Any pass-2 failure (HTTP, timeout, parse, not exactly 2 readings) throws `InterpretError`, so the pipeline returns `meaning_unavailable`. Plain English never retries.
- `src/prompt.js`: retry line is now "Reconsider with the extra context. If still unsure, set confident false and give exactly two readings."
- `src/client/cards.js`: new `unsure` card kind (`Could mean:` reading, `or`, reading, a tone chip each). Resolves slice-1 reviewer Minor 8: an unsure sentence never renders as one confident tone. If an unsure sentence arrives without exactly 2 readings it becomes the `unavailable` card (defence in depth).
- `src/client/session.js` (new): `nextContext(prev, sentences, keep = 3)`. No import from `prompt.js`, since the browser can only fetch `/client/*`.
- `src/client/app.js`: keeps `context`, sends it with each line, updates it after every `ok` result. `src/index.js` serves `session.js`. `src/client/app.css`: styling for the unsure card.
- Tests: extended `interpret`, `prompt`, `pipeline-text`, `cards` tests; new `test/session.test.js`.

## Tests and coverage
- RED (commit "test: slice 2 tests (RED)"): `npm test` showed 10 failures (retry tests, unsure card tests, prompt, `session.test.js` module missing).
- GREEN: `npm test` 133 tests, 129 pass, 0 fail, 4 todo (the landing contract todos).
- `npm run coverage` exit 0: all files 99.62% lines, 98.67% branches, 98.28% functions.

## Smoke check (POST to the running server on 8787)
- `can meh`: `confident:false`, 2 readings (both doubtful: "Is that really possible?" / "Is it actually allowed?"), `passes: 2`.
- `Can lah can lah`: confident, casual, `passes: 1`.
- `can lor` with context "Can you finish the slides by Friday?": still `confident:false` after retry, 2 readings (reluctant, casual), `passes: 2`. So the model did not settle it to a single reluctant card; the demo-script step 2 outcome depends on the model.
- `Eh the deadline confirm cannot shift one lah`: confident, firm, `passes: 1`.
- Plain English line: `hasSinglish:false`, `passes: 1`.

## Try it
Open http://localhost:8787/app, type `can meh` (two readings), then `Can you finish the slides by Friday?` and `can lor`, then the deadline line, then a plain line.

## Concerns
- Model-dependent: for `can meh` both readings came back as tone doubtful, so "easy to tell apart" is weak; prompt wording could push for distinct tones if the user wants (not changed, spec gives exact retry wording).
- `can lor` with context still came back unsure; the PRD expects one reluctant card. A prompt-tuning matter, not a code issue.
- Unsure sentences still carry a top-level `meaning`/`tone` in the JSON; cards ignore them.
- Plain `Lets move on...` came back with the sentence unchanged, as expected.
