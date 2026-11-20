import { test } from "node:test";
import assert from "node:assert/strict";
import { nextContext } from "../src/client/session.js";

const s = (said) => ({ said, hasSinglish: true });

test("nextContext keeps the last 3 said values in order", () => {
  assert.deepEqual(nextContext(["a", "b"], [s("c"), s("d")]), ["b", "c", "d"]);
});

test("nextContext includes plain sentences", () => {
  assert.deepEqual(nextContext([], [{ said: "Plain one.", hasSinglish: false }]), ["Plain one."]);
});

test("nextContext handles an empty start and no sentences", () => {
  assert.deepEqual(nextContext([], [s("a")]), ["a"]);
  assert.deepEqual(nextContext(undefined, undefined), []);
  assert.deepEqual(nextContext(["a"], []), ["a"]);
});

test("nextContext honours a custom keep and does not mutate its input", () => {
  const prev = ["a", "b"];
  assert.deepEqual(nextContext(prev, [s("c")], 2), ["b", "c"]);
  assert.deepEqual(prev, ["a", "b"]);
});

import { CONTEXT_KEEP } from "../src/client/session.js";
import { CONTEXT_KEEP as SHARED_KEEP } from "../src/prompt.js";

test("session CONTEXT_KEEP equals the shared constant and is the default keep", () => {
  assert.equal(CONTEXT_KEEP, SHARED_KEEP);
  assert.equal(nextContext(["a", "b", "c"], [s("d")]).length, CONTEXT_KEEP);
});

import { contextAfter, withContext } from "../src/client/session.js";

const okResult = (...said) => ({ status: "ok", source: "meralion", transcript: said.join(" "), sentences: said.map(s), passes: 1, cached: false });

test("contextAfter on ok appends each sentence's said, like nextContext", () => {
  const r = okResult("c", "d");
  assert.deepEqual(contextAfter(["a", "b"], r), nextContext(["a", "b"], r.sentences));
  assert.deepEqual(contextAfter(["a"], r), ["a", "c", "d"]);
});

test("contextAfter on meaning_unavailable appends the transcript (a failed line enters context, M5)", () => {
  const r = { status: "meaning_unavailable", source: "meralion", transcript: "cannot lah", sentences: [], passes: 1, cached: false };
  assert.deepEqual(contextAfter(["a"], r), ["a", "cannot lah"]);
});

test("contextAfter on meaning_unavailable with an empty transcript appends nothing", () => {
  for (const transcript of ["", "   ", undefined]) {
    assert.deepEqual(contextAfter(["a"], { status: "meaning_unavailable", transcript }), ["a"]);
  }
});

test("contextAfter on silent and uncaught returns prev", () => {
  assert.deepEqual(contextAfter(["a"], { status: "silent", transcript: "" }), ["a"]);
  assert.deepEqual(contextAfter(["a"], { status: "uncaught", transcript: "" }), ["a"]);
  assert.deepEqual(contextAfter(["a"], undefined), ["a"]);
  assert.deepEqual(contextAfter(undefined, { status: "silent" }), []);
});

test("contextAfter with retry: true returns prev, whatever the result (M6)", () => {
  assert.deepEqual(contextAfter(["a"], okResult("b"), { retry: true }), ["a"]);
  assert.deepEqual(contextAfter(["a"], { status: "meaning_unavailable", transcript: "x" }, { retry: true }), ["a"]);
});

test("contextAfter keeps the last 3", () => {
  assert.deepEqual(contextAfter(["a", "b", "c"], okResult("d")), ["b", "c", "d"]);
  assert.deepEqual(contextAfter(["a", "b", "c"], { status: "meaning_unavailable", transcript: "x" }), ["b", "c", "x"]);
  assert.deepEqual(contextAfter(["a", "b", "c"], { status: "meaning_unavailable", transcript: "x" }, { keep: 2 }), ["c", "x"]);
});

test("contextAfter does not mutate prev", () => {
  const prev = ["a"];
  contextAfter(prev, { status: "meaning_unavailable", transcript: "x" });
  contextAfter(prev, okResult("y"));
  assert.deepEqual(prev, ["a"]);
});

test("withContext copies: changing the live array afterwards does not change the item's context (M6)", () => {
  const live = ["x"];
  const item = { kind: "clip", wav: new Uint8Array(1) };
  const queued = withContext(item, live);
  live.push("a");
  assert.deepEqual(queued.context, ["x"]);
  assert.equal(queued.kind, "clip");
  assert.equal(queued.wav, item.wav);
  assert.notEqual(queued, item);
  assert.ok(!("context" in item));
});

test("withContext with no context gives []", () => {
  assert.deepEqual(withContext({ kind: "text", text: "t" }, undefined).context, []);
});

// Review I3 and m1.
import { sendContext, enteredContext } from "../src/client/session.js";

test("sendContext: a first try takes the live context at send time; a retry keeps its original (I3)", () => {
  const live = ["a", "b"];
  const first = sendContext({ kind: "clip" }, live);
  assert.deepEqual(first, ["a", "b"]);
  assert.notEqual(first, live);
  assert.deepEqual(sendContext({ kind: "clip", retry: true, context: ["x"] }, live), ["x"]);
  assert.deepEqual(sendContext({ kind: "clip", retry: true }, live), ["a", "b"]); // no snapshot yet
  assert.deepEqual(sendContext({ kind: "text" }, undefined), []);
});

test("enteredContext: only a meaning_unavailable result with words put the line in context (m1)", () => {
  assert.equal(enteredContext({ status: "meaning_unavailable", transcript: "x" }), true);
  assert.equal(enteredContext({ status: "meaning_unavailable", transcript: " " }), false);
  assert.equal(enteredContext(undefined, new Error("network")), false);
  assert.equal(enteredContext({ status: "meaning_unavailable", transcript: "x" }, new Error("e")), false);
  assert.equal(enteredContext({ status: "ok", sentences: [] }), false);
});

test("a retry after a network error appends on success; a retry after meaning_unavailable does not (m1)", () => {
  const ok = { status: "ok", sentences: [s("x lah")] };
  assert.deepEqual(contextAfter(["a"], ok, { retry: enteredContext(undefined, new Error("net")) }), ["a", "x lah"]);
  assert.deepEqual(contextAfter(["a", "x lah"], ok, { retry: enteredContext({ status: "meaning_unavailable", transcript: "x lah" }) }), ["a", "x lah"]);
});

import { retryOf } from "../src/client/session.js";

test("retryOf: a retry re-sends the first context, and knows whether its line is already in context", () => {
  const item = { kind: "clip", context: ["x"], cardId: "c1" };
  assert.deepEqual(retryOf(item, { status: "meaning_unavailable", transcript: "t" }), { ...item, retry: true, inContext: true });
  assert.deepEqual(retryOf(item, undefined, new Error("net")), { ...item, retry: true, inContext: false });
  const second = retryOf({ ...item, retry: true, inContext: true }, undefined, new Error("net"));
  assert.equal(second.inContext, true); // still in context from the first failure
});
