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
