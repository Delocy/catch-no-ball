import { test } from "node:test";
import assert from "node:assert/strict";
import { createClipQueue } from "../src/client/queue.js";

test("sends one at a time in push order when the first send is slow", async () => {
  const log = [];
  let releaseFirst;
  const send = (item) => {
    log.push("send" + item.text);
    if (item.text === 1) return new Promise((r) => { releaseFirst = () => r("r1"); });
    return Promise.resolve("r" + item.text);
  };
  const results = [];
  const q = createClipQueue({
    send,
    onResult: (item, result) => { log.push("result" + item.text); results.push(item.text); },
  });
  q.push({ kind: "text", text: 1 });
  q.push({ kind: "text", text: 2 });
  await Promise.resolve();
  assert.deepEqual(log, ["send1"]);
  assert.equal(q.size(), 2);
  releaseFirst();
  await q.idle();
  assert.deepEqual(results, [1, 2]);
  assert.deepEqual(log, ["send1", "result1", "send2", "result2"]);
  assert.equal(q.size(), 0);
});

test("an error from send goes to onResult as the error argument and the queue continues", async () => {
  const seen = [];
  const q = createClipQueue({
    send: async (item) => { if (item.text === 1) throw new Error("bad"); return "ok" + item.text; },
    onResult: (item, result, error) => seen.push([item.text, result, error && error.message]),
  });
  q.push({ kind: "text", text: 1 });
  q.push({ kind: "text", text: 2 });
  await q.idle();
  assert.deepEqual(seen, [[1, undefined, "bad"], [2, "ok2", undefined]]);
});

test("idle resolves when nothing is in flight", async () => {
  const q = createClipQueue({ send: async () => 1, onResult: () => {} });
  await q.idle();
  assert.equal(q.size(), 0);
});

test("an onResult that throws does not stop the queue", async () => {
  const done = [];
  const q = createClipQueue({
    send: async (i) => i.text,
    onResult: (i) => { done.push(i.text); if (i.text === 1) throw new Error("ui bug"); },
  });
  q.push({ kind: "text", text: 1 });
  q.push({ kind: "text", text: 2 });
  await q.idle();
  assert.deepEqual(done, [1, 2]);
});

test("an item pushed while running is picked up", async () => {
  const done = [];
  const q = createClipQueue({ send: async (i) => i.text, onResult: (i) => done.push(i.text) });
  q.push({ kind: "text", text: 1 });
  await q.idle();
  q.push({ kind: "text", text: 2 });
  await q.idle();
  assert.deepEqual(done, [1, 2]);
});

test("an onResult that throws is logged", async (t) => {
  const logged = [];
  t.mock.method(console, "error", (...a) => logged.push(a.join(" ")));
  const q = createClipQueue({ send: async () => 1, onResult: () => { throw new Error("ui bug"); } });
  q.push({ kind: "text", text: 1 });
  await q.idle();
  assert.equal(logged.length, 1);
  assert.match(logged[0], /ui bug/);
});

import { withContext } from "../src/client/session.js";

test("a clip pushed while a text item is in flight waits its turn (mixed kinds keep push order)", async () => {
  const sent = [];
  let release;
  const q = createClipQueue({
    send: (item) => {
      sent.push(item.kind);
      if (item.kind === "text") return new Promise((r) => { release = () => r({ status: "ok" }); });
      return Promise.resolve({ status: "ok" });
    },
    onResult: () => {},
  });
  q.push({ kind: "text", text: "a" });
  q.push({ kind: "clip", wav: new Uint8Array(4) });
  await Promise.resolve();
  assert.deepEqual(sent, ["text"]);
  release();
  await q.idle();
  assert.deepEqual(sent, ["text", "clip"]);
});

test("a retried item reaches send with its original context, not a later one (M6)", async () => {
  const seen = [];
  const q = createClipQueue({ send: async (item) => { seen.push([item.name, item.context]); return {}; }, onResult: () => {} });
  let context = ["x"];
  const A = withContext({ kind: "text", name: "A", text: "a" }, context);
  q.push(A);
  context = ["x", "a"];
  q.push(withContext({ kind: "text", name: "B", text: "b" }, context));
  context = ["x", "a", "b"];
  q.push(A); // the tap on retry re-pushes the original item
  await q.idle();
  assert.deepEqual(seen, [["A", ["x"]], ["B", ["x", "a"]], ["A", ["x"]]]);
});

// Review I3: the app's wiring, with the real queue and session functions.
import { contextAfter, sendContext } from "../src/client/session.js";

function appLike() {
  let context = [];
  const sent = [];
  const releases = [];
  const q = createClipQueue({
    send(item) {
      item.context = sendContext(item, context); // stored so a retry re-sends the same context
      sent.push([item.name, item.context]);
      return new Promise((r) => releases.push(() => r({ status: "ok", sentences: [{ said: item.name }] })));
    },
    onResult(item, result) { context = contextAfter(context, result, { retry: item.retry }); },
  });
  return { q, sent, releaseNext: () => releases.shift()() };
}

test("a clip created while the previous one is in flight sees that line when it is sent (I3)", async () => {
  const { q, sent, releaseNext } = appLike();
  q.push({ kind: "clip", name: "A" });
  q.push({ kind: "clip", name: "B" }); // created while A is in flight
  await Promise.resolve();
  releaseNext();
  await new Promise((r) => setImmediate(r));
  releaseNext();
  await q.idle();
  assert.deepEqual(sent, [["A", []], ["B", ["A"]]]);
});

test("a retry re-sends its first context even after later lines arrived (M6 kept)", async () => {
  const { q, sent, releaseNext } = appLike();
  const A = { kind: "text", name: "A" };
  q.push(A);
  await Promise.resolve();
  releaseNext();
  q.push({ kind: "text", name: "B" });
  await new Promise((r) => setImmediate(r));
  releaseNext();
  await q.idle();
  q.push({ ...A, retry: true });
  await Promise.resolve();
  releaseNext();
  await q.idle();
  assert.deepEqual(sent, [["A", []], ["B", ["A"]], ["A", []]]);
});

test("gapMs is awaited between items, never before the first or after the last", async () => {
  const slept = [];
  const q = createClipQueue({
    send: async () => ({}), onResult: () => {},
    gapMs: () => 13000, sleep: async (ms) => { slept.push(ms); },
  });
  q.push({ kind: "clip", uploadId: "u1" });
  q.push({ kind: "clip", uploadId: "u1" });
  await q.idle();
  assert.deepEqual(slept, [13000]);
  const none = [];
  const q2 = createClipQueue({ send: async () => ({}), onResult: () => {}, gapMs: () => 0, sleep: async (ms) => none.push(ms) });
  q2.push({ n: 1 }); q2.push({ n: 2 });
  await q2.idle();
  assert.deepEqual(none, []);
});

test("drop removes waiting items, never the one in flight", async () => {
  const sent = [];
  const results = [];
  let release;
  const q = createClipQueue({
    send: (item) => { sent.push(item.id); return new Promise((r) => { release = () => r("ok"); }); },
    onResult: (item) => results.push(item.id),
  });
  const A = { id: "A", uploadId: "u1" }, B = { id: "B", uploadId: "u1" }, C = { id: "C", uploadId: "u1" };
  q.push(A); q.push(B); q.push(C);
  await Promise.resolve();
  assert.deepEqual(q.drop((i) => i.uploadId === "u1"), [B, C]);
  release();
  await q.idle();
  assert.deepEqual(sent, ["A"]);
  assert.deepEqual(results, ["A"]);
  assert.equal(q.size(), 0);
});

test("drop during the gap removes the next item", async () => {
  const sent = [];
  let wake;
  const q = createClipQueue({
    send: async (item) => { sent.push(item.id); return {}; },
    onResult: () => {},
    gapMs: () => 13000,
    sleep: () => new Promise((r) => { wake = r; }),
  });
  q.push({ id: "A", uploadId: "u1" }); q.push({ id: "B", uploadId: "u1" });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(q.drop((i) => i.id === "B").map((i) => i.id), ["B"]);
  wake();
  await q.idle();
  assert.deepEqual(sent, ["A"]);
});

test("a typed line pushed during an upload is sent in push order with no gap around it", async () => {
  const sent = [];
  const gaps = [];
  const q = createClipQueue({
    send: async (item) => { sent.push(item.id); return {}; },
    onResult: () => {},
    gapMs: (next, prev) => (next.uploadId && prev.uploadId ? 13000 : 0),
    sleep: async (ms) => { gaps.push(ms); },
  });
  q.push({ id: "c1", uploadId: "u1" });
  q.push({ id: "t", kind: "text" });
  q.push({ id: "c2", uploadId: "u1" });
  await q.idle();
  assert.deepEqual(sent, ["c1", "t", "c2"]);
  assert.deepEqual(gaps, []);
});

test("a text item jumps ahead of waiting upload clips but not the one in flight; typed lines keep their order", async () => {
  const sent = [];
  let release;
  const q = createClipQueue({
    send: (item) => { sent.push(item.id); return new Promise((r) => { release = () => r({}); }); },
    onResult: () => {},
  });
  q.push({ id: "c1", kind: "clip", uploadId: "u" });
  q.push({ id: "c2", kind: "clip", uploadId: "u" });
  q.push({ id: "t1", kind: "text" });
  q.push({ id: "t2", kind: "text" });
  q.push({ id: "L", kind: "clip" }); // a Listen clip keeps push order
  await Promise.resolve();
  release(); await new Promise((r) => setImmediate(r));
  release(); await new Promise((r) => setImmediate(r));
  release(); await new Promise((r) => setImmediate(r));
  release(); await new Promise((r) => setImmediate(r));
  release();
  await q.idle();
  assert.deepEqual(sent, ["c1", "t1", "t2", "c2", "L"]);
});

test("drop wakes a pending gap so the loop moves on at once", async () => {
  const sent = [];
  const q = createClipQueue({
    send: async (item) => { sent.push(item.id); return {}; },
    onResult: () => {},
    gapMs: (next) => (next.uploadId ? 13000 : 0),
    sleep: () => new Promise(() => {}), // never resolves on its own
  });
  q.push({ id: "A", uploadId: "u1" }); q.push({ id: "B", uploadId: "u1" });
  await new Promise((r) => setImmediate(r));
  q.drop((i) => i.uploadId === "u1");
  q.push({ id: "T", kind: "text" });
  await q.idle();
  assert.deepEqual(sent, ["A", "T"]);
});

test("the default sleep waits with setTimeout", async () => {
  const q = createClipQueue({ send: async (i) => i, onResult: () => {}, gapMs: () => 5 });
  const t0 = Date.now();
  q.push({ a: 1 }); q.push({ a: 2 });
  await q.idle();
  assert.ok(Date.now() - t0 >= 4);
});
