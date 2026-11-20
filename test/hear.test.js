import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hearClip, HearError, CACHE_TTL_SECONDS } from "../src/hear.js";
import { sha256Hex } from "../src/audio.js";
import { makeWav } from "./helpers/wav.js";

const FIXTURE = readFileSync(new URL("./fixtures/meralion-transcription.json", import.meta.url), "utf8");
const env0 = { MERALION_API_KEY: "k" };

function fakeCache({ throwGet = false } = {}) {
  const map = new Map();
  const puts = [];
  return {
    map,
    puts,
    async get(k, type) {
      if (throwGet) throw new Error("kv down");
      const v = map.get(k);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(k, v, opts) { puts.push([k, v, opts]); map.set(k, v); },
  };
}

function setup({ body = FIXTURE, status = 200, allow = { allow: true }, cache = fakeCache() } = {}) {
  const calls = { fetch: [], reserve: [], tokens: [] };
  const deps = {
    fetchImpl: async (url, init) => { calls.fetch.push({ url, init }); return new Response(body, { status }); },
    reserve: async (env, args) => { calls.reserve.push(args); return allow; },
    recordTokens: async (env, tokens) => { calls.tokens.push(tokens); },
    whisper: null,
  };
  return { calls, deps, env: { ...env0, CACHE: cache }, cache };
}

test("CACHE_TTL_SECONDS is 7 days", () => assert.equal(CACHE_TTL_SECONDS, 604800));

test("uses MERaLiON when the guard allows -> source meralion, the trimmed transcript, cached false", async () => {
  const { deps, env } = setup();
  assert.deepEqual(await hearClip(makeWav(2), env, {}, deps), { transcript: "Let's move on to the next agenda item.", source: "meralion", cached: false });
});

test("reserves once with the clip's real duration and makes exactly one MERaLiON call", async () => {
  const { deps, env, calls } = setup();
  await hearClip(makeWav(15), env, undefined, deps);
  assert.deepEqual(calls.reserve, [{ seconds: 15 }]);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, "https://api.meralion.ai/v1/audio/transcriptions");
});

test("records the reply's tokens", async () => {
  const { deps, env, calls } = setup();
  await hearClip(makeWav(1), env, {}, deps);
  assert.deepEqual(calls.tokens, [344]);
});

test("a guard refusal throws HearError refused and never calls MERaLiON", async () => {
  const { deps, env, calls } = setup({ allow: { allow: false, reason: "rate" } });
  await assert.rejects(hearClip(makeWav(1), env, {}, deps), (e) => e instanceof HearError && e.reason === "refused" && e.name === "HearError");
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.tokens.length, 0);
});

test("a MeralionError becomes HearError meralion", async () => {
  const { deps, env, calls } = setup({ status: 500, body: "Internal Server Error" });
  await assert.rejects(hearClip(makeWav(1), env, {}, deps), (e) => e instanceof HearError && e.reason === "meralion");
  assert.equal(calls.tokens.length, 0);
});

test("a non-MeralionError from a dependency is not swallowed", async () => {
  const { deps, env } = setup();
  deps.reserve = async () => { throw new RangeError("bug"); };
  await assert.rejects(hearClip(makeWav(1), env, {}, deps), RangeError);
});

test("second call with the same audio is served from cache: cached true, no fetch, no reserve", async () => {
  const { deps, env, calls } = setup();
  const wav = makeWav(1, { fill: 0.1 });
  await hearClip(wav, env, {}, deps);
  const again = await hearClip(wav, env, {}, deps);
  assert.deepEqual(again, { transcript: "Let's move on to the next agenda item.", source: "meralion", cached: true });
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.reserve.length, 1);
});

test("cache put uses key hear:<sha256>, value { transcript } and expirationTtl 604800", async () => {
  const { deps, env, cache } = setup();
  const wav = makeWav(1);
  await hearClip(wav, env, {}, deps);
  assert.equal(cache.puts.length, 1);
  const [key, value, opts] = cache.puts[0];
  assert.equal(key, `hear:${await sha256Hex(wav)}`);
  assert.deepEqual(JSON.parse(value), { transcript: "Let's move on to the next agenda item." });
  assert.deepEqual(opts, { expirationTtl: 604800 });
});

test("empty transcripts are not cached and come back as \"\"", async () => {
  const body = JSON.stringify({ choices: [{ message: { content: "  \n" } }], usage: { total_tokens: 340 } });
  const { deps, env, cache } = setup({ body });
  const r = await hearClip(makeWav(1), env, {}, deps);
  assert.equal(r.transcript, "");
  assert.equal(cache.puts.length, 0);
});

test("no CACHE binding, or a throwing CACHE.get, still works", async (t) => {
  t.mock.method(console, "error", () => {});
  const a = setup();
  delete a.env.CACHE;
  assert.equal((await hearClip(makeWav(1), a.env, {}, a.deps)).cached, false);
  const b = setup({ cache: fakeCache({ throwGet: true }) });
  assert.equal((await hearClip(makeWav(1), b.env, {}, b.deps)).source, "meralion");
});

test("a throwing CACHE.put still returns the transcript", async (t) => {
  t.mock.method(console, "error", () => {});
  const cache = fakeCache();
  cache.put = async () => { throw new Error("kv full"); };
  const { deps, env } = setup({ cache });
  assert.equal((await hearClip(makeWav(1), env, {}, deps)).transcript, "Let's move on to the next agenda item.");
});

test("a cached value that is not a transcript is ignored", async () => {
  const { deps, env, cache, calls } = setup();
  const wav = makeWav(1);
  cache.map.set(`hear:${await sha256Hex(wav)}`, JSON.stringify({ nope: 1 }));
  assert.equal((await hearClip(wav, env, {}, deps)).cached, false);
  assert.equal(calls.fetch.length, 1);
});
