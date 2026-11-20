import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  callMeralionTranscribe, MeralionError,
  MERALION_BASE, MERALION_MODEL, MERALION_MODE, MERALION_TIMEOUT_MS,
} from "../src/meralion.js";
import { makeWav } from "./helpers/wav.js";

const FIXTURE = readFileSync(new URL("./fixtures/meralion-transcription.json", import.meta.url), "utf8");
const ERROR = readFileSync(new URL("./fixtures/meralion-error.json", import.meta.url), "utf8");
const env = { MERALION_API_KEY: "test-key" };

// No test may reach the real MERaLiON: an accidental real call fails the run.
let realFetch;
before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("real fetch called in a unit test"); };
});
after(() => { globalThis.fetch = realFetch; });

function fake(status, body, headers = { "content-type": "application/json" }) {
  const seen = [];
  const f = async (url, init) => {
    seen.push({ url, init });
    return new Response(body, { status, headers });
  };
  f.seen = seen;
  return f;
}

test("constants come from step 0", () => {
  assert.equal(MERALION_BASE, "https://api.meralion.ai/v1");
  assert.equal(MERALION_MODEL, "MERaLiON/MERaLiON-3-3B-ASR-CTM");
  assert.equal(MERALION_MODE, "transcript_only");
  assert.equal(MERALION_TIMEOUT_MS, 20000);
});

test("callMeralionTranscribe posts JSON to https://api.meralion.ai/v1/audio/transcriptions", async () => {
  const bytes = makeWav(0.6, { fill: (i) => Math.sin(i / 10) * 0.3 });
  const f = fake(200, FIXTURE);
  await callMeralionTranscribe(bytes, env, f);
  assert.equal(f.seen.length, 1);
  const { url, init } = f.seen[0];
  assert.equal(url, "https://api.meralion.ai/v1/audio/transcriptions");
  assert.equal(init.method, "POST");
  const h = new Headers(init.headers);
  assert.equal(h.get("content-type"), "application/json");
  assert.equal(h.get("x-api-key"), "test-key");
  assert.equal(h.get("authorization"), null);
  assert.ok(!(init.body instanceof FormData));
  assert.equal(typeof init.body, "string");
  assert.deepEqual(JSON.parse(init.body), { audio_url: "data:audio/wav;base64," + Buffer.from(bytes).toString("base64") });
  assert.ok(!init.body.includes(MERALION_MODEL), "the model id is recorded, not sent");
});

test("returns the fixture's transcript, trimmed, and its total_tokens", async () => {
  const r = await callMeralionTranscribe(makeWav(1), env, fake(200, FIXTURE));
  assert.deepEqual(r, { text: "Let's move on to the next agenda item.", tokens: 344 });
});

test("a response without usage gives tokens 0", async () => {
  const body = JSON.stringify({ choices: [{ message: { content: " hi lah \n" } }] });
  assert.deepEqual(await callMeralionTranscribe(makeWav(1), env, fake(200, body)), { text: "hi lah", tokens: 0 });
});

test("a 200 with no choices, or content that is not a string, throws MeralionError", async () => {
  for (const body of ["{}", '{"choices":[]}', '{"choices":[{"message":{"content":null}}]}', '{"choices":[{"message":{"content":5}}]}', "not json", "null"]) {
    await assert.rejects(callMeralionTranscribe(makeWav(1), env, fake(200, body)), (e) => e instanceof MeralionError && e.status === 200, body);
  }
});

test("throws MeralionError with status on 401, 422, 429 and a plain-text 500", async () => {
  const cases = [
    [401, ERROR],
    [422, JSON.stringify({ detail: [{ loc: ["body", "audio_url"], msg: "field required", type: "value_error.missing" }] })],
    [429, '{"detail":"Too many requests"}'],
    [500, "Internal Server Error"],
  ];
  for (const [status, body] of cases) {
    const headers = status === 500 ? { "content-type": "text/plain" } : undefined;
    await assert.rejects(
      callMeralionTranscribe(makeWav(1), env, fake(status, body, headers)),
      (e) => e instanceof MeralionError && e.status === status && e.name === "MeralionError",
      String(status),
    );
  }
});

test("the error message never contains the key", async () => {
  await assert.rejects(callMeralionTranscribe(makeWav(1), env, fake(401, ERROR)), (e) => !e.message.includes("test-key"));
});

test("a network failure throws MeralionError with status null", async () => {
  const f = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(callMeralionTranscribe(makeWav(1), env, f), (e) => e instanceof MeralionError && e.status === null);
});

test("sends an abort signal and a timeout becomes MeralionError status null", async () => {
  let signal;
  const f = async (url, init) => { signal = init.signal; throw new DOMException("The operation timed out.", "TimeoutError"); };
  await assert.rejects(callMeralionTranscribe(makeWav(1), env, f), (e) => e instanceof MeralionError && e.status === null && /timed out/i.test(e.message));
  assert.ok(signal instanceof AbortSignal);
});
