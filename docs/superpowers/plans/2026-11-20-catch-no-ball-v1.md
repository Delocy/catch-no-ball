# Catch No Ball v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone web app that listens in ~15 s chunks and shows a card per Singlish sentence (what was said, what it meant, tone), plus a landing page and an eval script, all on one Cloudflare Worker.

**Architecture:**
- The phone captures raw audio with an AudioWorklet, cuts ~15 s chunks, encodes them as 16 kHz mono WAV, and posts them in order to the Worker.
- The Worker transcribes each chunk with MERaLiON. Whisper on Workers AI is the backup. A Durable Object caps MERaLiON at 5 requests a minute and a monthly audio budget.
- OpenCode Go turns each transcript into validated sentence JSON, and the phone renders it as cards.

**Tech Stack:** Cloudflare Workers (plain JavaScript ES modules, `wrangler` 4), Workers KV, Workers AI, a SQLite-backed Durable Object, `node --test`. No runtime npm dependencies and no build step (same as Lunch Uncle at `/Users/zares/DSTA/thinkertanker/lunch-uncle`).

**Spec:** `docs/PRD.md` (with `PRODUCT_BRIEF.md`). Section and requirement IDs (F1–F10, B1–B7, E1–E2) refer to it.

## Global Constraints

- No runtime npm dependencies, no build step. The only dev dependency is `wrangler@^4`. Tests run with `node --test`.
- HTML, SVG and client JS are imported into the Worker as text (a `[[rules]] type = "Text"` rule), as in Lunch Uncle.
- Secrets come only from `env`: `OPENCODE_API_KEY`, `MERALION_API_KEY`, `ACCESS_CODE`, `DEMO_KEY`. They go in `.dev.vars` locally (gitignored) and `wrangler secret put` for deploys, never in code or `wrangler.toml`.
- OpenCode Go: base URL `https://opencode.ai/inference/go/v1`, model `deepseek-v4.1-flash`. Every call sends `x-opencode-session: <sessionId>` and `user-agent: CatchNoBall/1.0`.
- MERaLiON: `POST https://api.meralion.ai/v1/audio/transcriptions`, `Authorization: Bearer <MERALION_API_KEY>`. At most 5 requests in any 60 s. Budget: 2,700 s/month normally, 3,600 s/month with the demo key.
- Whisper backup: Workers AI `@cf/openai/whisper-large-v3-turbo`.
- Audio sent to the Worker is 16 kHz mono 16-bit PCM WAV. The Worker rejects chunks over 30 s, and the client sends 15 s chunks.
- Audio is never stored. Transcripts may be cached in KV under `asr:<sha256>` with `expirationTtl: 604800` (7 days).
- Tone labels, exactly: `firm`, `reluctant`, `doubtful`, `joking`, `casual`, `neutral`.
- `/api/*` needs header `x-access-code` equal to `env.ACCESS_CODE`. If `ACCESS_CODE` is unset, every API request is refused (fail closed).
- User-facing copy is fixed by the PRD: "Translating", "Let the table know you're using a translator.", "Couldn't catch that", "Subtitles paused, reconnecting", "Backup mode", "New to me", "Meaning unavailable, tap to retry", "You caught N Singlish terms", "Learn more" → `https://singlishdict.app/?q=<term>`.
- Phone-first: works in iPhone Safari and Android Chrome, in portrait, with dark mode.

## Review Focus

1. **A silent or near-empty chunk** (nobody speaking for 15 s) must produce no card and spend no MERaLiON quota. Tests: `isSilent` (Task 6) and the `silent` status for chunks under 0.5 s (Task 5).
2. **A model reply wrapped in a ```json fence, or using a tone outside the list** must be parsed or rejected cleanly, never shown raw. Tests in Task 2.
3. **The network drops mid-meeting and comes back.** Chunks queued meanwhile are sent in order, and results render in recording order. Test in Task 7.
4. **Browser storage unavailable** (private mode, blocked) must not break starring or the summary. Test in Task 7.
5. **The month rolls over.** The MERaLiON budget resets on the 1st, not 30 days after first use. Test in Task 3.

---

## Before Task 1 (done by you, not the implementer)

- [ ] Register a MERaLiON key at `https://studio.meralion.ai/api-console` and put it in `.dev.vars` as `MERALION_API_KEY`.
- [ ] Run PRD risk 1: record 5 Singlish clips in the MERaLiON playground and count how many keep lah/lor/siam. Write the result in PRD section 14.
- [ ] Confirm MERaLiON's transcription request format. Open `https://api.meralion.ai/v1/docs` in a browser and send one WAV:
  ```bash
  curl -s https://api.meralion.ai/v1/audio/transcriptions -H "Authorization: Bearer $MERALION_API_KEY" -F file=@sample.wav
  ```
  Expected: JSON with the transcript in a `text` field. If the field name or form field differs, update `callMeralion` in Task 4 to match.

---

### Task 1: Worker skeleton with access code

**Files:**
- Create: `package.json`, `wrangler.toml`, `.gitignore`, `.dev.vars.example`, `CLAUDE.md`, `src/index.js`, `src/auth.js`, `src/http.js`, `src/pages/landing.html` (placeholder: name and tagline only)
- Test: `test/auth.test.js`

**Interfaces:**
- Produces:
  - `hasAccess(request: Request, env) -> boolean`
  - `isDemo(request: Request, env) -> boolean`
  - `json(data, status = 200) -> Response`, exported from `src/http.js`
  - Route table in `src/index.js`, which later tasks extend

- [ ] **Step 1: Write the config files**
  - `package.json`: name `catch-no-ball`, `"type": "module"`, scripts `dev: wrangler dev`, `deploy: wrangler deploy`, `test: node --test`, devDependency `wrangler: ^4.0.0`.
  - `wrangler.toml`:
    - `name = "catch-no-ball"`, `main = "src/index.js"`, `compatibility_date = "2025-08-01"`
    - Text rule with `globs = ["**/*.html", "**/*.svg", "src/client/**/*.js"]` and `fallthrough = false`
    - `[ai] binding = "AI"`
    - `[[kv_namespaces]] binding = "CACHE"`, id filled in during Task 10
    - `[[durable_objects.bindings]] name = "MERALION_GUARD" class_name = "MeralionGuard"`
    - `[[migrations]] tag = "v1" new_sqlite_classes = ["MeralionGuard"]`
    - `[vars] FORCE_WHISPER = "false"`
  - `.gitignore`: `node_modules/`, `.wrangler/`, `.dev.vars`, `.DS_Store`, `evals/clips/`, `evals/results/`.
  - `.dev.vars.example`: the four secret names with empty values, plus `FORCE_WHISPER=true` for development.
  - `CLAUDE.md`: copy Lunch Uncle's conventions (IO vs pure split, test the pure part, secrets only from env, `npm test` before a PR, no runtime deps). Add: "Develop with FORCE_WHISPER=true. MERaLiON's free tier has 1 hour of audio a month."
  - Run `npm install`.

- [ ] **Step 2: Write the failing test** in `test/auth.test.js`:
  ```js
  const req = (h) => new Request("https://x/api/text", { headers: h });
  test("hasAccess accepts the right code", () => assert.equal(hasAccess(req({ "x-access-code": "s3cret" }), { ACCESS_CODE: "s3cret" }), true));
  test("hasAccess rejects a wrong or missing code", () => {
    assert.equal(hasAccess(req({ "x-access-code": "nope" }), { ACCESS_CODE: "s3cret" }), false);
    assert.equal(hasAccess(req({}), { ACCESS_CODE: "s3cret" }), false);
  });
  test("hasAccess fails closed when ACCESS_CODE is unset", () => assert.equal(hasAccess(req({ "x-access-code": "" }), {}), false));
  test("isDemo needs a non-empty matching DEMO_KEY", () => {
    assert.equal(isDemo(req({ "x-demo-key": "d" }), { DEMO_KEY: "d" }), true);
    assert.equal(isDemo(req({ "x-demo-key": "" }), { DEMO_KEY: "" }), false);
  });
  ```

- [ ] **Step 3: Run** `npm test`. Expected: FAIL, because `src/auth.js` doesn't exist.

- [ ] **Step 4: Implement `src/auth.js`, `src/http.js` and `src/index.js`**
  - `index.js` routes:
    - `GET /` → landing HTML
    - `POST /api/*` without access → `json({ error: "access_code" }, 401)`
    - anything else → 404
  - `index.js` must also `export { MeralionGuard } from "./guard.js"` once Task 3 exists. Add that line in Task 3, not now.

- [ ] **Step 5: Run** `npm test`, then `npx wrangler dev`, then `curl -s -X POST localhost:8787/api/text`. Expected: tests PASS, and curl prints `{"error":"access_code"}`.

- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: worker skeleton with access code"`

---

### Task 2: Interpretation (OpenCode Go → validated sentences)

**Files:**
- Create: `src/prompt.js`, `src/interpret.js`
- Test: `test/interpret.test.js`

**Interfaces:**
- Produces:
  - `TONES: string[]` (the six labels, in Global Constraints order)
  - `buildMessages({ transcript, setting, context, variant, retry }) -> Array<{role, content}>`
    - `variant` is `"a"` or `"b"`
    - `context` is `string[]`, the previous sentences
    - `retry` is a boolean. When true, the prompt says: "Reconsider with the extra context. If still unsure, set confident false and give exactly two readings."
  - `parseInterpretation(raw: string, { requireReadings: boolean }) -> { sentences: Sentence[] }`. Throws `InterpretError` (exported) on anything invalid.
  - `interpret({ transcript, setting, context, sessionId, variant = "a" }, env, fetchImpl = fetch) -> Promise<{ sentences: Sentence[] }>`
  - `Sentence = { said: string, hasSinglish: boolean, meaning: string, tone: string, confident: boolean, readings: Array<{meaning, tone}>, terms: Array<{term, gloss, known: boolean}> }`

- [ ] **Step 1: Write the failing tests** (`ok` is a helper building one valid Sentence JSON string):
  ```js
  test("parses a plain JSON reply", () => {
    const r = parseInterpretation(ok({ tone: "firm" }), { requireReadings: false });
    assert.equal(r.sentences[0].tone, "firm");
  });
  test("strips a ```json fence and surrounding prose", () => {
    const r = parseInterpretation("Here you go:\n```json\n" + ok({}) + "\n```", { requireReadings: false });
    assert.equal(r.sentences.length, 1);
  });
  test("rejects a tone outside TONES", () =>
    assert.throws(() => parseInterpretation(ok({ tone: "angry" }), { requireReadings: false }), InterpretError));
  test("rejects missing fields", () =>
    assert.throws(() => parseInterpretation('{"sentences":[{"said":"x"}]}', { requireReadings: false }), InterpretError));
  test("on the final pass, unsure sentences need exactly two readings", () =>
    assert.throws(() => parseInterpretation(ok({ confident: false, readings: [] }), { requireReadings: true }), InterpretError));
  test("plain English sentences are normalised: no terms, tone neutral", () => {
    const s = parseInterpretation(ok({ hasSinglish: false, tone: "firm", terms: [{ term: "x", gloss: "y", known: true }] }), { requireReadings: false }).sentences[0];
    assert.deepEqual([s.tone, s.terms.length], ["neutral", 0]);
  });
  test("interpret retries once with 3 context sentences when unsure", async () => {
    const calls = [];
    const fake = async (_url, init) => {
      calls.push(JSON.parse(init.body));
      const body = calls.length === 1 ? ok({ confident: false }) : ok({ confident: false, readings: [{ meaning: "a", tone: "doubtful" }, { meaning: "b", tone: "neutral" }] });
      return new Response(JSON.stringify({ choices: [{ message: { content: body } }] }));
    };
    const r = await interpret({ transcript: "can meh", setting: "office", context: ["s1", "s2", "s3", "s4"], sessionId: "t" }, { OPENCODE_API_KEY: "k" }, fake);
    assert.equal(calls.length, 2);
    assert.match(calls[0].messages.at(-1).content, /s4/);
    assert.doesNotMatch(calls[0].messages.at(-1).content, /s3/);
    assert.match(calls[1].messages.at(-1).content, /s2[\s\S]*s3[\s\S]*s4/);
    assert.equal(r.sentences[0].readings.length, 2);
  });
  test("interpret sends the session and user-agent headers", async () => {
    let headers;
    const fake = async (_u, init) => { headers = init.headers; return new Response(JSON.stringify({ choices: [{ message: { content: ok({}) } }] })); };
    await interpret({ transcript: "x", setting: "office", context: [], sessionId: "sess-1" }, { OPENCODE_API_KEY: "k" }, fake);
    assert.equal(headers["x-opencode-session"], "sess-1");
    assert.equal(headers["user-agent"], "CatchNoBall/1.0");
  });
  ```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Implement `src/prompt.js`**
  - Two system prompts. **Variant a** is "precise interpreter" and **variant b** is "friendly colleague explaining". Both must:
    - say the user is a newcomer at a Singapore office
    - require JSON only, in the `Sentence` shape
    - restrict `tone` to `TONES`
    - say plain-English sentences get `hasSinglish: false`, are not reworded, and have no terms
    - keep `meaning` to one short sentence
    - list Singlish terms (particles included) with a short gloss
    - mark unrecognised terms with `known: false`
    - say: "If particles seem missing, infer tone from wording and context. Never guess confidently. Use confident:false."
  - The user message contains the setting, the context sentences labelled "Earlier:", and the transcript.

- [ ] **Step 4: Implement `src/interpret.js`**
  - The first call uses `context.slice(-1)` and `requireReadings: false`.
  - If any sentence has `confident: false`, make a second call with `context.slice(-3)`, `retry: true` and `requireReadings: true`.
  - Use a 20 s `AbortSignal.timeout`.
  - A non-2xx response throws `InterpretError`.
  - JSON extraction takes the text between the first `{` and the last `}`.

- [ ] **Step 5: Run** `npm test`. Expected: PASS.

- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: interpretation with validation and low-confidence retry"`

---

### Task 3: MERaLiON guard (rate limit and monthly budget)

**Files:**
- Create: `src/guard.js`
- Modify: `src/index.js` (add `export { MeralionGuard } from "./guard.js";`)
- Test: `test/guard.test.js`

**Interfaces:**
- Produces:
  - `decide(state, { now: number /* ms */, seconds: number, demo: boolean }) -> { allow: boolean, reason?: "rate" | "budget", state }`
    - `state` is `{ recent: number[], month: "YYYY-MM", secondsUsed: number }`, or `undefined` for a fresh state.
    - The month comes from `now` in UTC.
  - Constants: `RATE_LIMIT_PER_MIN = 5`, `NORMAL_BUDGET_SECONDS = 2700`, `DEMO_BUDGET_SECONDS = 3600`.
  - `class MeralionGuard`, a Durable Object using the plain `constructor(ctx, env)` and `fetch` style, with no `cloudflare:workers` import so Node can load the file.
    - `POST /reserve` takes `{ seconds, demo }` and returns `{ allow, reason? }`.
    - It loads and stores `state` with `ctx.storage.get/put("state")`.
  - `reserveMeralion(env, { seconds, demo }) -> Promise<{ allow, reason? }>`, which uses `env.MERALION_GUARD.idFromName("global")`.

- [ ] **Step 1: Write the failing tests**
  ```js
  const T = Date.UTC(2026, 10, 20, 9, 0, 0);
  test("allows 5 in a minute, refuses the 6th with reason rate", () => {
    let s;
    for (let i = 0; i < 5; i++) ({ state: s } = decide(s, { now: T + i * 1000, seconds: 15, demo: false }));
    assert.deepEqual(pick(decide(s, { now: T + 5000, seconds: 15, demo: false })), { allow: false, reason: "rate" });
  });
  test("a request 61 s later is allowed again", () => { /* fill 5 at T, then now: T + 61_000 → allow true */ });
  test("normal sessions stop at 2700 s, demo continues to 3600 s", () => {
    const s = { recent: [], month: "2026-11", secondsUsed: 2690 };
    assert.equal(decide(s, { now: T, seconds: 15, demo: false }).reason, "budget");
    assert.equal(decide(s, { now: T, seconds: 15, demo: true }).allow, true);
    assert.equal(decide({ ...s, secondsUsed: 3590 }, { now: T, seconds: 15, demo: true }).reason, "budget");
  });
  test("budget resets when the UTC month changes", () => {
    const s = { recent: [], month: "2026-10", secondsUsed: 3600 };
    const r = decide(s, { now: T, seconds: 15, demo: false });
    assert.equal(r.allow, true);
    assert.deepEqual([r.state.month, r.state.secondsUsed], ["2026-11", 15]);
  });
  test("a refused request does not consume budget or rate", () => { /* state after refusal equals state before (minus pruned timestamps) */ });
  ```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement `src/guard.js`.** Prune `recent` to the last 60,000 ms, then check the rate, then the month reset, then the budget. On allow, push `now` and add `seconds`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: MERaLiON rate and monthly budget guard"`

---

### Task 4: Transcription with backup and cache

**Files:**
- Create: `src/audio.js`, `src/transcribe.js`
- Test: `test/audio.test.js`, `test/transcribe.test.js`

**Interfaces:**
- Consumes: `reserveMeralion` (Task 3).
- Produces:
  - `wavDurationSeconds(bytes: Uint8Array) -> number`
    - Reads the RIFF/WAVE header: byte rate at offset 28, then walks the chunks to find `data` and its size.
    - Throws `Error("not_wav")` otherwise.
  - `sha256Hex(bytes: Uint8Array) -> Promise<string>`
  - `transcribe(bytes, env, { demo = false, asr = "auto" }, deps = { fetchImpl: fetch, reserve: reserveMeralion }) -> Promise<{ text: string, source: "meralion" | "whisper", cached: boolean }>`
    - `asr` is `"auto"`, `"meralion"` or `"whisper"`.
  - `callMeralion(bytes, env, fetchImpl) -> Promise<string>`
    - Multipart form field `file` (Blob `audio/wav`, filename `chunk.wav`).
    - Returns `json.text`. Adjust to the format checked in "Before Task 1".
    - Throws on non-2xx.
  - `callWhisper(bytes, env) -> Promise<string>`
    - `env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: <base64 of bytes> })`, returning `.text`.

- [ ] **Step 1: Write the failing tests.** `makeWav(seconds)` is a test helper that builds a 16 kHz mono PCM16 WAV of zeros.
  ```js
  test("wavDurationSeconds reads 15 s", () => assert.equal(wavDurationSeconds(makeWav(15)), 15));
  test("wavDurationSeconds rejects non-WAV", () => assert.throws(() => wavDurationSeconds(new Uint8Array(50)), /not_wav/));

  // transcribe: env has fake AI ({ run: async () => ({ text: "from whisper" }) }) and fake CACHE (Map-backed get/put)
  test("uses MERaLiON when the guard allows", async () => { /* reserve → {allow:true}, fetchImpl returns {text:"from meralion"} → source "meralion" */ });
  test("falls back to Whisper when the guard refuses", async () => { /* reserve → {allow:false, reason:"rate"} → source "whisper", fetchImpl never called */ });
  test("falls back to Whisper when MERaLiON returns 429 or 500", async () => { /* … */ });
  test("FORCE_WHISPER=true never calls the guard or MERaLiON", async () => { /* … */ });
  test("asr:'whisper' overrides auto", async () => { /* … */ });
  test("second call with the same audio is served from cache", async () => { /* second result cached:true, no fetch, no reserve */ });
  test("cache put uses key asr:<sha256> and expirationTtl 604800", async () => { /* inspect fake CACHE.put args */ });
  test("reserve is called with the chunk's real duration and the demo flag", async () => { /* makeWav(15), demo:true → reserve got {seconds:15, demo:true} */ });
  ```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement `src/audio.js` and `src/transcribe.js`.** Order of operations:
  1. Check the cache.
  2. Handle forced Whisper (env flag or `asr`).
  3. Reserve.
  4. Call MERaLiON, falling back to Whisper on error.
  5. Write the cache only for a non-empty `text`.

  If Whisper also throws, the error propagates.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: transcription with MERaLiON, Whisper backup and cache"`

---

### Task 5: Chunk and text API

**Files:**
- Create: `src/pipeline.js`
- Modify: `src/index.js` (route `POST /api/chunk` → `handleChunk`, `POST /api/text` → `handleText`, both after `hasAccess`)
- Test: `test/pipeline.test.js`

**Interfaces:**
- Consumes: `transcribe`, `wavDurationSeconds` (Task 4); `interpret` (Task 2); `isDemo` (Task 1).
- Produces:
  - `handleChunk(request, env, deps = { transcribe, interpret }) -> Promise<Response>`
    - The request is multipart `FormData` with fields:
      - `audio` (WAV)
      - `sessionId`
      - `setting` (`"office"`)
      - `context` (a JSON `string[]`)
      - `variant` (optional, `"a"` or `"b"`)
    - Optional header `x-asr` is `meralion` or `whisper`. Any other value means `auto`.
  - `handleText(request, env, deps) -> Promise<Response>`
    - The request is JSON: `{ text, sessionId, setting, context, variant? }`.
  - Response JSON `ChunkResult = { status: "ok" | "silent" | "uncaught" | "meaning_unavailable", source: "meralion" | "whisper" | "text", transcript: string, sentences: Sentence[] }`

- [ ] **Step 1: Write the failing tests** (using fake deps):
  ```js
  test("chunk under 0.5 s → status silent, transcribe not called", async () => { /* … */ });
  test("chunk over 30 s → HTTP 413 { error: 'too_long' }", async () => { /* makeWav(31) */ });
  test("non-WAV audio → HTTP 400 { error: 'bad_audio' }", async () => { /* … */ });
  test("empty or whitespace transcript → status silent, interpret not called", async () => { /* … */ });
  test("transcribe throws → status uncaught", async () => { /* … */ });
  test("interpret throws → status meaning_unavailable with transcript", async () => { /* … */ });
  test("happy path returns source, transcript and sentences", async () => { /* … */ });
  test("x-demo-key and x-asr are passed through to transcribe", async () => { /* … */ });
  test("handleText skips transcription and reports source text", async () => { /* … */ });
  test("handleText with empty text → HTTP 400", async () => { /* … */ });
  ```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement `src/pipeline.js`** and wire the routes in `src/index.js`. Malformed `context` JSON is treated as `[]`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS. Then check against real services:
  - Run `npx wrangler dev` with `FORCE_WHISPER=true` and real keys in `.dev.vars`.
  - Run:
    ```bash
    curl -s localhost:8787/api/text -H "x-access-code: $ACCESS_CODE" -H "content-type: application/json" -d '{"text":"Eh the deadline confirm cannot shift one lah","sessionId":"t","setting":"office","context":[]}'
    ```
  - Expected: `status: "ok"` and one sentence with `tone: "firm"`.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: chunk and text API"`

---

### Task 6: Client audio (capture, silence check, WAV)

**Files:**
- Create: `src/client/wav.js`, `src/client/recorder-worklet.js`
- Modify: `src/index.js` (serve `GET /client/<name>.js` for the client files as `text/javascript`)
- Test: `test/wav.test.js`

**Interfaces:**
- Produces:
  - `resampleTo16k(samples: Float32Array, fromRate: number) -> Float32Array` (linear interpolation; returns the input unchanged when `fromRate === 16000`)
  - `encodeWav(samples16k: Float32Array) -> Uint8Array` (PCM16 mono at 16,000 Hz with a 44-byte header; samples clamped to [-1, 1])
  - `isSilent(samples: Float32Array, threshold = 0.01) -> boolean` (true when RMS < threshold)
  - `recorder-worklet.js` registers the processor `"pcm-capture"`, which posts each input Float32Array frame of channel 0 to `port`

- [ ] **Step 1: Write the failing tests**
  ```js
  test("48 kHz → 16 kHz keeps duration", () => assert.equal(resampleTo16k(new Float32Array(48000), 48000).length, 16000));
  test("encodeWav header says 16 kHz mono PCM16", () => {
    const b = encodeWav(new Float32Array(16000)); const v = new DataView(b.buffer);
    assert.equal(String.fromCharCode(...b.slice(0, 4)), "RIFF");
    assert.deepEqual([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)], [1, 16000, 16]);
    assert.equal(b.length, 44 + 32000);
  });
  test("encodeWav clamps out-of-range samples", () => { /* 2.0 → 32767, -2.0 → -32768 */ });
  test("isSilent: zeros true, a 0.5-amplitude sine false", () => { /* … */ });
  test("round trip: encodeWav output is read by the server's wavDurationSeconds as 1 s", () => { /* import from ../src/audio.js */ });
  ```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement both files.**

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: client audio capture helpers"`

---

### Task 7: Client queue and stars

**Files:**
- Create: `src/client/queue.js`, `src/client/stars.js`
- Test: `test/queue.test.js`, `test/stars.test.js`

**Interfaces:**
- Produces:
  - `createChunkQueue({ send, onResult, onStatus, retryMs = 3000, maxQueued = 20 }) -> { push(item), size() }`
    - `send(item)` resolves to a `Response`-like `{ ok, status, json() }`, or rejects on a network failure.
    - Items are sent **one at a time, in push order**.
    - When `send` rejects, the queue calls `onStatus("reconnecting")`, keeps the item at the head and retries after `retryMs`.
    - The next success calls `onStatus("ok")`.
    - Any resolved response (including 401 and 413) goes to `onResult(item, response)` and is not retried.
    - Above `maxQueued` unsent items, the oldest unsent item is dropped.
  - `loadStars(storage) -> Array<{ term, gloss }>`
  - `toggleStar(storage, { term, gloss }) -> Array<{ term, gloss }>`
    - Uses key `"cnb:stars"`. Matching is case-insensitive.
    - Every storage access is wrapped in try/catch and falls back to an in-memory list.
  - `countDistinctTerms(sentences: Sentence[]) -> number` (distinct `terms[].term`, case-insensitive, Singlish sentences only)

- [ ] **Step 1: Write the failing tests**
  ```js
  test("sends in push order even when the first send is slow", async () => { /* send 1 resolves after send 2 would have → onResult order [1,2] */ });
  test("network failure → reconnecting, retried, then ok, order kept", async () => { /* send rejects twice for item 1; items 2,3 pushed meanwhile; final onResult order [1,2,3]; statuses include "reconnecting" then "ok" */ });
  test("401 is reported, not retried", async () => { /* … */ });
  test("over maxQueued drops the oldest unsent item, never a delivered one", async () => { /* … */ });
  test("stars survive a throwing storage", () => {
    const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    assert.deepEqual(toggleStar(bad, { term: "siam", gloss: "skip" }).map(s => s.term), ["siam"]);
    assert.doesNotThrow(() => loadStars(bad));
  });
  test("toggleStar twice removes the term, case-insensitive", () => { /* "Siam" then "siam" → [] */ });
  test("countDistinctTerms ignores plain-English sentences and case", () => { /* … */ });
  ```
  Use `retryMs: 1` in tests.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement both files.**

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: ordered offline-safe chunk queue and stars"`

---

### Task 8: The app page (F1–F9)

**Files:**
- Create: `src/pages/app.html`, `src/client/app.js`
- Modify: `src/index.js` (`GET /app` → app.html)

**Interfaces:**
- Consumes: `resampleTo16k`, `encodeWav`, `isSilent` (Task 6); `createChunkQueue`, `loadStars`, `toggleStar`, `countDistinctTerms` (Task 7); the `ChunkResult` shape (Task 5).
- `app.js` is an ES module loaded with `<script type="module" src="/client/app.js">` and imports the other `/client/*.js` files.

Screens and behaviour (copy exactly as in Global Constraints):

1. **Access code.** On first open, ask for the access code and store it in `localStorage` (`cnb:code`, wrapped in try/catch). A 401 clears it and asks again.
2. **Start screen.**
   - A setting picker showing only "Office meeting" (sends `"office"`).
   - A **Listen** button.
   - A "Type instead" box, which is always visible on every screen.
3. **Listening.**
   - On Listen: `getUserMedia({ audio: true })`, an `AudioContext`, and the `pcm-capture` worklet.
   - The "Translating" label and the reminder line stay pinned at the top.
   - Every 15 s:
     - Concatenate the frames.
     - `isSilent` → drop the chunk.
     - Otherwise `resampleTo16k` → `encodeWav` → `queue.push`.
   - `sessionId = crypto.randomUUID()` is created once per Listen.
   - `context` holds the last 3 `said` strings received.
   - A `demo` query parameter (`/app?demo=<key>`) is stored and sent as `x-demo-key`.
4. **Cards** render from `ChunkResult`:
   - `ok`:
     - A Singlish sentence becomes a full card with the underlined terms, `meaning` and a tone chip.
     - A plain sentence becomes one faded line.
     - When `confident: false`, show "Could mean: A **or** B" from `readings`.
   - `silent`: nothing.
   - `uncaught`: a "Couldn't catch that" card with a text box that posts to `/api/text`.
   - `meaning_unavailable`: the transcript plus "Meaning unavailable, tap to retry". Tapping re-posts the transcript via `/api/text`.
   - Auto-scroll to the newest card unless the user has scrolled up.
   - `source === "whisper"` shows the "Backup mode" label until the next MERaLiON result.
5. **Term sheet.** Tapping a term shows:
   - the term and its gloss (or "New to me" when `known: false`)
   - a star toggle
   - "Learn more" linking to `https://singlishdict.app/?q=<encodeURIComponent(term)>`, opened in a new tab
6. **Network.** `onStatus("reconnecting")` shows the "Subtitles paused, reconnecting" banner. `"ok"` hides it. Cards already shown are never removed.
7. **Mic denied.** Show how to allow the microphone in Safari and Chrome, and point to "Type instead".
8. **Stop.**
   - Stop the tracks and flush the last partial chunk (if not silent).
   - Show "You caught N Singlish terms" (`countDistinctTerms` over all sentences this session) and the starred list with glosses and Learn more links.
9. **Style.**
   - Large type with high contrast, in a single column.
   - `prefers-color-scheme` dark mode.
   - Tone chips get distinct colours. They must not use red/green only, so add text as well.

- [ ] **Step 1: Build `app.html` and `app.js`** as above.
- [ ] **Step 2: Run `npm test`.** Expected: PASS (no regressions).
- [ ] **Step 3: Check it in the browser.**
  - Run `npx wrangler dev` with `FORCE_WHISPER=true`, then open `localhost:8787/app` at phone width (375×812).
  - Check each of these:
    - The access code prompt appears and then the start screen.
    - Listen shows "Translating".
    - Reading "Eh the deadline confirm cannot shift one lah" aloud gives a *firm* card within ~15 s of the chunk ending.
    - Reading a plain sentence gives a faded line.
    - Tapping a term opens the sheet with a working Learn more link.
    - Starring a term and pressing Stop shows the count and the starred list.
    - Typing a line works.
    - With the dev server stopped, the reconnecting banner shows. After restarting it, queued chunks arrive in order.
    - Dark mode looks right.
- [ ] **Step 4: Check on a real phone.**
  - Run `npx wrangler dev --ip 0.0.0.0`. The mic needs HTTPS on phones, so if a phone refuses, defer this check to after Task 10's deploy.
  - On iPhone Safari and Android Chrome, confirm the mic captures and cards appear.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: listening app with cards, term sheet and summary"`

---

### Task 9: Landing page, logo and manifest (F10)

**Files:**
- Create: `src/pages/logo.svg`, `src/pages/manifest.webmanifest.js` (exports the manifest object)
- Modify: `src/pages/landing.html` (the full page), `src/index.js` (`GET /logo.svg` as `image/svg+xml`; `GET /manifest.webmanifest` as `application/manifest+json`)
- Test: `test/manifest.test.js`

**Interfaces:**
- Produces: the manifest object with `name: "Catch No Ball"`, `short_name: "Catch No Ball"`, `start_url: "/app"`, `display: "standalone"`, and `icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml" }]`.

- [ ] **Step 1: Write the failing test** that the manifest has the fields above and `start_url === "/app"`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Build it.**
  - **Logo:** a speech bubble with a small ball inside, as a hand-drawn inline SVG with a `viewBox`.
  - **Landing page:**
    - The name, logo and the tagline "For when you catch no ball."
    - One paragraph on who it's for and what it does.
    - A static example card (the "deadline confirm cannot shift" sentence, firm).
    - An **Open the app** button linking to `/app`.
    - The privacy line: "Audio is sent to A*STAR's MERaLiON service for transcription and is not stored by us."
    - `<link rel="manifest">`, `<link rel="icon" href="/logo.svg">`, an `apple-touch-icon` pointing to the SVG, and the theme colour.
    - Dark mode.
- [ ] **Step 4: Run** `npm test` (expected PASS). In the browser at 375 px and at desktop width, check there's no horizontal scroll and the button opens `/app`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: landing page, logo and manifest"`

---

### Task 10: Evals (E2)

**Files:**
- Create: `evals/score.js`, `evals/run.js`, `evals/references.example.json`, `evals/README.md`
- Test: `test/score.test.js`

**Interfaces:**
- Consumes: the `/api/chunk` HTTP API (Task 5), including the `x-asr` header and the `variant` field.
- Produces:
  - Reference entries: `{ clip: "01.wav", hasSinglish: boolean, meaning: string, tone: <TONES>, ambiguous: boolean, particles: string[] }`
  - `scoreClip(reference, result: ChunkResult) -> { tone: boolean, plainLeftAlone: boolean | null, ambiguityHonest: boolean | null, particlesKept: number | null }`
    - The first sentence of `result` is compared.
    - `plainLeftAlone` applies only when `reference.hasSinglish === false`.
    - `ambiguityHonest` applies only when `reference.ambiguous`, and is true when `confident === false` with 2 readings.
    - `particlesKept` is the fraction of `reference.particles` found as whole words in `result.transcript` (case-insensitive), or `null` when there are none.
  - `summarise(scores) -> { n, tone, plainLeftAlone, ambiguityHonest, particlesKept }` (each a percentage over the non-null values)
  - **Meaning is scored by a person, not by code** (*my call*: keeps the score honest at no extra model cost). `run.js` writes `evals/results/<timestamp>-<asr>-<variant>.csv` with columns `clip, reference_meaning, app_meaning, tone_ok, meaning_ok`, where `meaning_ok` is left blank for a Singaporean teammate to fill in.

- [ ] **Step 1: Write the failing tests** for `scoreClip` (one test per field, including the null cases and "lah" not matching inside "lahat") and for `summarise`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement `score.js`, then `run.js`.**
  - Usage: `node evals/run.js --base <url> --asr meralion|whisper --variant a|b`.
  - It reads `ACCESS_CODE` and `DEMO_KEY` from the environment.
  - It reads `evals/references.json` and the clips in `evals/clips/`.
  - It sends the clips one at a time, waiting 13 s between MERaLiON requests to stay under 5 a minute.
  - It prints the `summarise` table and writes the CSV.
- [ ] **Step 4: Write `evals/README.md`:**
  - Clips are recorded with consent and never committed.
  - Convert each clip with:
    ```bash
    ffmpeg -i in.m4a -ac 1 -ar 16000 -sample_fmt s16 evals/clips/01.wav
    ```
  - Write `references.json` from the example.
  - The four runs for the presentation: meralion/a, whisper/a, meralion/b, whisper/b. That uses about 4 × 25 × 8 s ≈ 13 min of MERaLiON's hour, so run Whisper first.
  - E1 uses cards printed from the winning run (PRD section 10).
- [ ] **Step 5: Run** `npm test`, then run `node evals/run.js --base http://localhost:8787 --asr whisper --variant a` on 2 sample clips. Expected: a summary table prints and a CSV is written to `evals/results/`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: eval runner and scoring"`

---

### Task 11: Deploy

**Files:**
- Modify: `wrangler.toml` (the KV namespace id), `README.md` (create it: what the app is, setup, dev, deploy, evals)

- [ ] **Step 1:** Run `npx wrangler kv namespace create CACHE` and paste the id into `wrangler.toml`.
- [ ] **Step 2:** Set the secrets with `npx wrangler secret put` for each of `OPENCODE_API_KEY`, `MERALION_API_KEY`, `ACCESS_CODE` and `DEMO_KEY`. Make sure `FORCE_WHISPER = "false"` in `[vars]`.
- [ ] **Step 3:** Run `npm test` (expected PASS), then `npx wrangler deploy` (expected: a `https://catch-no-ball.<account>.workers.dev` URL).
- [ ] **Step 4: Smoke test on a phone over HTTPS.**
  - The landing page loads and "Open the app" works.
  - The access code is accepted.
  - A spoken Singlish line gives a card with no "Backup mode" label, which means MERaLiON was used.
  - "Add to Home Screen" works.
- [ ] **Step 5: Commit** `git add -A && git commit -m "chore: deploy config and README"`
