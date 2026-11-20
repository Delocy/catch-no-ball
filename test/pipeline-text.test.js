import { test } from "node:test";
import assert from "node:assert/strict";
import { handleText, MAX_TEXT_CHARS } from "../src/pipeline.js";
import { sentence } from "./helpers/replies.js";

const post = (body) =>
  new Request("http://x/api/text", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

function deps(impl) {
  const calls = [];
  const interpret = async (args, env) => {
    calls.push({ args, env });
    return impl ? impl(args) : { sentences: [sentence()], passes: 1 };
  };
  return { calls, deps: { interpret } };
}

test("happy path returns status ok, source text, trimmed transcript, sentences, passes, cached false", async () => {
  const { deps: d } = deps();
  const res = await handleText(post({ text: "  Eh the deadline confirm cannot shift one lah  ", sessionId: "s1", context: [] }), {}, d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.source, "text");
  assert.equal(body.transcript, "Eh the deadline confirm cannot shift one lah");
  assert.equal(body.sentences.length, 1);
  assert.equal(body.passes, 1);
  assert.equal(body.cached, false);
});

test("empty, whitespace-only, missing and 1001-character text give 400 bad_text", async () => {
  const { deps: d } = deps();
  for (const text of ["", "   ", undefined, 42, "x".repeat(MAX_TEXT_CHARS + 1)]) {
    const res = await handleText(post({ text }), {}, d);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "bad_text" });
  }
});

test("exactly 1000 characters is accepted", async () => {
  const { deps: d } = deps();
  const res = await handleText(post({ text: "x".repeat(1000) }), {}, d);
  assert.equal(res.status, 200);
});

test("invalid JSON body and non-object bodies give 400 bad_text", async () => {
  const { deps: d } = deps();
  for (const b of ["not json", "null", "[]", '"s"']) {
    const res = await handleText(post(b), {}, d);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "bad_text" });
  }
});

test("interpret throwing gives meaning_unavailable with the transcript and no sentences (US-11)", async () => {
  const { deps: d } = deps(() => { throw new Error("down"); });
  const res = await handleText(post({ text: "hello lah" }), {}, d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: "meaning_unavailable",
    source: "text",
    transcript: "hello lah",
    sentences: [],
    passes: 1,
    cached: false,
  });
});

test("context and sessionId are passed through", async () => {
  const { deps: d, calls } = deps();
  await handleText(post({ text: "hi", sessionId: "abc", context: ["one", "two"] }), { K: 1 }, d);
  assert.equal(calls[0].args.sessionId, "abc");
  assert.deepEqual(calls[0].args.context, ["one", "two"]);
  assert.equal(calls[0].args.transcript, "hi");
  assert.deepEqual(calls[0].env, { K: 1 });
});

test("non-array context becomes []; a missing or oversized sessionId gets a UUID", async () => {
  const { deps: d, calls } = deps();
  await handleText(post({ text: "hi", context: "nope" }), {}, d);
  assert.deepEqual(calls[0].args.context, []);
  assert.match(calls[0].args.sessionId, /^[0-9a-f-]{36}$/);
  await handleText(post({ text: "hi", sessionId: "s".repeat(101) }), {}, d);
  assert.match(calls[1].args.sessionId, /^[0-9a-f-]{36}$/);
  await handleText(post({ text: "hi", sessionId: "s".repeat(100) }), {}, d);
  assert.equal(calls[2].args.sessionId.length, 100);
});

test("defaults to the real interpret when no deps are given (failing safe offline)", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("no network in tests"); };
  try {
    const res = await handleText(post({ text: "hello" }), { OPENCODE_API_KEY: "k" });
    assert.equal((await res.json()).status, "meaning_unavailable");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("context is limited to the last 3 entries of at most 1000 characters", async () => {
  const { deps: d, calls } = deps();
  await handleText(post({ text: "hi", context: ["a", "b", "c", "d", "z".repeat(5000)] }), {}, d);
  assert.equal(calls[0].args.context.length, 3);
  assert.equal(calls[0].args.context[2].length, 1000);
  assert.equal(calls[0].args.context[0], "c");
});

test("the result has no hint field (revision 5: transcript-only), also for meaning_unavailable", async () => {
  const ok = await (await handleText(post({ text: "hi" }), {}, deps().deps)).json();
  assert.ok(!("hint" in ok));
  const bad = await (await handleText(post({ text: "hi" }), {}, deps(() => { throw new Error("x"); }).deps)).json();
  assert.ok(!("hint" in bad));
});

test("a sessionId that is not header-safe gets a UUID instead", async () => {
  const { deps: d, calls } = deps();
  await handleText(post({ text: "hi", sessionId: "bad\r\nid" }), {}, d);
  await handleText(post({ text: "hi", sessionId: "caf\u00e9" }), {}, d);
  await handleText(post({ text: "hi", sessionId: "ok-id_1" }), {}, d);
  assert.match(calls[0].args.sessionId, /^[0-9a-f-]{36}$/);
  assert.match(calls[1].args.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(calls[2].args.sessionId, "ok-id_1");
});

test("a failed retry becomes meaning_unavailable", async () => {
  const { deps: d } = deps(() => { throw new Error("retry failed"); });
  const body = await (await handleText(post({ text: "can meh", sessionId: "s", context: ["a"] }), {}, d)).json();
  assert.equal(body.status, "meaning_unavailable");
  assert.deepEqual(body.sentences, []);
});

test("passes is passed through", async () => {
  const { deps: d } = deps(() => ({ sentences: [sentence()], passes: 2 }));
  const body = await (await handleText(post({ text: "can meh", sessionId: "s" }), {}, d)).json();
  assert.equal(body.passes, 2);
});

test("a failed retry reports passes 2; a plain failure reports passes 1", async () => {
  const { InterpretError } = await import("../src/interpret.js");
  const retryFail = deps(() => { throw new InterpretError("retry", { passes: 2 }); });
  const a = await (await handleText(post({ text: "can meh", sessionId: "s" }), {}, retryFail.deps)).json();
  assert.equal(a.status, "meaning_unavailable");
  assert.equal(a.passes, 2);
  const plainFail = deps(() => { throw new Error("x"); });
  const b = await (await handleText(post({ text: "can meh", sessionId: "s" }), {}, plainFail.deps)).json();
  assert.equal(b.passes, 1);
});

// Review concern 3: the interpretation is cached in KV, keyed on the transcript and the context sent.
import { INTERP_TTL_SECONDS, interpKey } from "../src/pipeline.js";

function kv({ throwGet = false, throwPut = false } = {}) {
  const map = new Map();
  const puts = [];
  return {
    map, puts,
    async get(k, type) { if (throwGet) throw new Error("kv down"); const v = map.get(k); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; },
    async put(k, v, o) { if (throwPut) throw new Error("kv full"); puts.push([k, v, o]); map.set(k, v); },
  };
}

test("a repeat of the same text and context is served from the cache: no OpenCode call, passes 0", async () => {
  const { deps: d, calls } = deps();
  const env = { CACHE: kv() };
  const body = { text: "Eh the deadline confirm cannot shift one lah", sessionId: "s", context: ["a"] };
  const first = await (await handleText(post(body), env, d)).json();
  const again = await (await handleText(post(body), env, d)).json();
  assert.equal(calls.length, 1);
  assert.equal(first.passes, 1);
  assert.equal(again.status, "ok");
  assert.equal(again.passes, 0);
  assert.deepEqual(again.sentences, first.sentences);
  assert.equal(again.cached, false); // `cached` is about the speech model, not the interpretation
});

test("a different context is a cache miss", async () => {
  const { deps: d, calls } = deps();
  const env = { CACHE: kv() };
  await handleText(post({ text: "can lor", context: ["a"] }), env, d);
  await handleText(post({ text: "can lor", context: ["b"] }), env, d);
  await handleText(post({ text: "can lor", context: [] }), env, d);
  assert.equal(calls.length, 3);
});

test("the cache entry: key interp:<sha256>, value { sentences, passes }, 7-day TTL", async () => {
  const { deps: d } = deps();
  const env = { CACHE: kv() };
  await handleText(post({ text: "can lor", context: ["a"] }), env, d);
  const [k, v, o] = env.CACHE.puts[0];
  assert.equal(k, await interpKey("can lor", ["a"]));
  assert.match(k, /^interp:[0-9a-f]{64}$/);
  assert.deepEqual(JSON.parse(v), { sentences: [sentence()], passes: 1 });
  assert.equal(INTERP_TTL_SECONDS, 604800);
  assert.deepEqual(o, { expirationTtl: 604800 });
  assert.notEqual(await interpKey("can lor", ["a"]), await interpKey("can lor", ["b"]));
});

test("a failed interpretation is not cached", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps: d } = deps(() => { throw new Error("down"); });
  const env = { CACHE: kv() };
  await handleText(post({ text: "can lor" }), env, d);
  assert.equal(env.CACHE.puts.length, 0);
});

test("no CACHE, a throwing get or put, or a bad cached value still interprets", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const env of [{}, { CACHE: kv({ throwGet: true }) }, { CACHE: kv({ throwPut: true }) }]) {
    const { deps: d, calls } = deps();
    const body = await (await handleText(post({ text: "can lor" }), env, d)).json();
    assert.equal(body.status, "ok");
    assert.equal(calls.length, 1);
  }
  const env = { CACHE: kv() };
  env.CACHE.map.set(await interpKey("can lor", []), JSON.stringify({ sentences: "nope" }));
  const { deps: d, calls } = deps();
  await handleText(post({ text: "can lor" }), env, d);
  assert.equal(calls.length, 1);
});
