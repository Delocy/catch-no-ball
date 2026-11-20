import { test } from "node:test";
import assert from "node:assert/strict";
import { handleChunk, handleBudget } from "../src/pipeline.js";
import { HearError } from "../src/hear.js";
import { makeWav } from "./helpers/wav.js";
import { sentence } from "./helpers/replies.js";

function chunk({ wav = makeWav(2), sessionId = "s1", context = "[]", audio = true, type = "audio/wav" } = {}) {
  const fd = new FormData();
  if (audio) fd.append("audio", new Blob([wav], { type }), "clip.wav");
  // null leaves the field out
  if (sessionId !== null) fd.append("sessionId", sessionId);
  if (context !== null) fd.append("context", context);
  return new Request("http://x/api/chunk", { method: "POST", body: fd });
}

function deps({ hear, interp } = {}) {
  const calls = { hear: [], interpret: [] };
  return {
    calls,
    deps: {
      hearClip: async (bytes, env, opts) => {
        calls.hear.push({ bytes, env, opts });
        return hear ? hear(bytes) : { transcript: "Eh the deadline confirm cannot shift one lah", source: "meralion", cached: false };
      },
      interpret: async (args, env) => {
        calls.interpret.push({ args, env });
        return interp ? interp(args) : { sentences: [sentence()], passes: 1 };
      },
    },
  };
}

test("happy path: status ok, source meralion, transcript, sentences, passes, cached", async () => {
  const { deps: d, calls } = deps();
  const env = { X: 1 };
  const res = await handleChunk(chunk(), env, d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), {
    status: "ok", source: "meralion", transcript: "Eh the deadline confirm cannot shift one lah",
    sentences: [sentence()], passes: 1, cached: false,
  });
  assert.equal(calls.hear.length, 1);
  assert.equal(calls.hear[0].env, env);
  assert.ok(calls.hear[0].bytes instanceof Uint8Array);
  assert.equal(calls.hear[0].bytes.length, makeWav(2).length);
});

test("a 0.4 s clip -> status silent and hearClip is never called", async () => {
  const { deps: d, calls } = deps();
  const res = await handleChunk(chunk({ wav: makeWav(0.4) }), {}, d);
  assert.deepEqual(await res.json(), { status: "silent", source: "meralion", transcript: "", sentences: [], passes: 0, cached: false });
  assert.equal(calls.hear.length, 0);
  assert.equal(calls.interpret.length, 0);
});

test("a 31 s clip -> 413 too_long; a 30 s clip is accepted", async () => {
  const { deps: d, calls } = deps();
  const res = await handleChunk(chunk({ wav: makeWav(31) }), {}, d);
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "too_long" });
  assert.equal(calls.hear.length, 0);
  assert.equal((await handleChunk(chunk({ wav: makeWav(30) }), {}, d)).status, 200);
});

test("non-WAV audio, a 44.1 kHz WAV, a stereo WAV, an 8-bit WAV and a missing audio field -> 400 bad_audio", async () => {
  const { deps: d, calls } = deps();
  const eightBit = makeWav(1);
  new DataView(eightBit.buffer).setUint16(34, 8, true);
  const cases = [
    chunk({ wav: new TextEncoder().encode("not a wave file, just some text bytes here") }),
    chunk({ wav: makeWav(1, { sampleRate: 44100 }) }),
    chunk({ wav: makeWav(1, { channels: 2 }) }),
    chunk({ wav: eightBit }),
    chunk({ audio: false }),
    new Request("http://x/api/chunk", { method: "POST", body: "not form data" }),
  ];
  for (const req of cases) {
    const res = await handleChunk(req, {}, d);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "bad_audio" });
  }
  assert.equal(calls.hear.length, 0);
});

test("an audio field that is a string, not a file -> 400 bad_audio", async () => {
  const { deps: d } = deps();
  const fd = new FormData();
  fd.append("audio", "RIFF");
  const res = await handleChunk(new Request("http://x/api/chunk", { method: "POST", body: fd }), {}, d);
  assert.equal(res.status, 400);
});

test("hearClip throwing -> status uncaught", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const err of [new HearError("no", "refused"), new HearError("x", "meralion"), new Error("other")]) {
    const { deps: d, calls } = deps({ hear: () => { throw err; } });
    const body = await (await handleChunk(chunk(), {}, d)).json();
    assert.deepEqual(body, { status: "uncaught", source: "meralion", transcript: "", sentences: [], passes: 0, cached: false });
    assert.equal(calls.interpret.length, 0);
  }
});

test("an empty or whitespace transcript -> status uncaught, interpret not called", async () => {
  for (const transcript of ["", "   \n"]) {
    const { deps: d, calls } = deps({ hear: () => ({ transcript, source: "meralion", cached: true }) });
    const body = await (await handleChunk(chunk(), {}, d)).json();
    assert.equal(body.status, "uncaught");
    assert.equal(body.cached, true);
    assert.equal(calls.interpret.length, 0);
  }
});

test("interpret receives only transcript, context and sessionId", async () => {
  const { deps: d, calls } = deps();
  await handleChunk(chunk({ sessionId: "abc-123", context: JSON.stringify(["one", "two"]) }), {}, d);
  assert.deepEqual(calls.interpret[0].args, { transcript: "Eh the deadline confirm cannot shift one lah", context: ["one", "two"], sessionId: "abc-123" });
});

test("ChunkResult carries source meralion and cached", async () => {
  const { deps: d } = deps({ hear: () => ({ transcript: "can lor", source: "meralion", cached: true }) });
  const body = await (await handleChunk(chunk(), {}, d)).json();
  assert.equal(body.source, "meralion");
  assert.equal(body.cached, true);
  assert.equal(body.transcript, "can lor");
});

test("the transcript is trimmed before interpret", async () => {
  const { deps: d, calls } = deps({ hear: () => ({ transcript: "  can lor \n", source: "meralion", cached: false }) });
  await handleChunk(chunk(), {}, d);
  assert.equal(calls.interpret[0].args.transcript, "can lor");
});

test("interpret throwing -> meaning_unavailable with the transcript", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps: d } = deps({ interp: () => { const e = new Error("down"); e.passes = 2; throw e; } });
  assert.deepEqual(await (await handleChunk(chunk(), {}, d)).json(), {
    status: "meaning_unavailable", source: "meralion", transcript: "Eh the deadline confirm cannot shift one lah",
    sentences: [], passes: 2, cached: false,
  });
  const { deps: d1 } = deps({ interp: () => { throw new Error("down"); } });
  assert.equal((await (await handleChunk(chunk(), {}, d1)).json()).passes, 1);
});

test("malformed context JSON -> interpret gets []", async () => {
  for (const context of ["{not json", '"str"', "null", null]) {
    const { deps: d, calls } = deps();
    await handleChunk(chunk({ context }), {}, d);
    assert.deepEqual(calls.interpret[0].args.context, [], String(context));
  }
});

test("a bad or missing sessionId gets a fresh UUID", async () => {
  for (const sessionId of [null, "has spaces", "x".repeat(101)]) {
    const { deps: d, calls } = deps();
    await handleChunk(chunk({ sessionId }), {}, d);
    assert.match(calls.interpret[0].args.sessionId, /^[0-9a-f-]{36}$/);
  }
});

test("the result never has a hint field", async () => {
  const { deps: d } = deps();
  const body = await (await handleChunk(chunk(), {}, d)).json();
  assert.ok(!("hint" in body));
});

test("handleBudget returns guardStatus as JSON", async () => {
  const status = { month: "2026-11", used: { seconds: 5, requests: 2, tokens: 688 }, limits: { seconds: 3600, requests: 1000, tokens: 100000 }, recentRequests: 1 };
  let seenEnv;
  const env = { G: 1 };
  const res = await handleBudget(new Request("http://x/api/budget"), env, { guardStatus: async (e) => { seenEnv = e; return status; } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), status);
  assert.equal(seenEnv, env);
});
