import { test } from "node:test";
import assert from "node:assert/strict";
import { createClipper, CLIP_SECONDS } from "../src/client/clipper.js";

test("CLIP_SECONDS is 15", () => assert.equal(CLIP_SECONDS, 15));

test("15 s at 48 kHz in 128-sample frames emits one clip of 48000 x 15 samples", () => {
  const clips = [];
  const c = createClipper({ inputRate: 48000, onClip: (x) => clips.push(x) });
  const total = 48000 * 15;
  for (let i = 0; i < total; i += 128) c.push(new Float32Array(Math.min(128, total - i)));
  assert.equal(clips.length, 1);
  assert.equal(clips[0].length, 48000 * 15);
  assert.ok(clips[0] instanceof Float32Array);
});

test("samples are continuous across the boundary (a ramp keeps its order)", () => {
  const clips = [];
  const c = createClipper({ inputRate: 10, clipSeconds: 1, onClip: (x) => clips.push(Array.from(x)) });
  let n = 0;
  const frame = (len) => Float32Array.from({ length: len }, () => n++);
  c.push(frame(7));
  c.push(frame(7)); // crosses the 10-sample boundary
  c.push(frame(13)); // crosses another one and leaves 7
  assert.deepEqual(clips, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]]);
  c.flush();
  assert.deepEqual(clips[2], [20, 21, 22, 23, 24, 25, 26]);
});

test("a frame longer than a whole clip emits several clips", () => {
  const clips = [];
  const c = createClipper({ inputRate: 4, clipSeconds: 1, onClip: (x) => clips.push(x.length) });
  c.push(new Float32Array(9));
  assert.deepEqual(clips, [4, 4]);
});

test("flush emits the remainder; flush with nothing left emits nothing", () => {
  const clips = [];
  const c = createClipper({ inputRate: 100, clipSeconds: 1, onClip: (x) => clips.push(x.length) });
  c.flush();
  assert.deepEqual(clips, []);
  c.push(new Float32Array(30));
  c.flush();
  assert.deepEqual(clips, [30]);
  c.flush();
  assert.deepEqual(clips, [30]);
  c.push(new Float32Array(100)); // after a flush the clipper starts fresh
  assert.deepEqual(clips, [30, 100]);
});

test("the emitted clip is a copy, not a view of a buffer that is reused", () => {
  const clips = [];
  const c = createClipper({ inputRate: 2, clipSeconds: 1, onClip: (x) => clips.push(x) });
  c.push(Float32Array.from([1, 2]));
  c.push(Float32Array.from([3, 4]));
  assert.deepEqual(Array.from(clips[0]), [1, 2]);
  assert.deepEqual(Array.from(clips[1]), [3, 4]);
});
