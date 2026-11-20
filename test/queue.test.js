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
