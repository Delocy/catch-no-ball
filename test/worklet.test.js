import { test } from "node:test";
import assert from "node:assert/strict";

const registered = {};
globalThis.registerProcessor = (name, cls) => { registered[name] = cls; };
globalThis.AudioWorkletProcessor ??= class { constructor() { this.port = { postMessage() {} }; } };

await import("../src/client/recorder-worklet.js");

function make() {
  const Cls = registered["pcm-capture"];
  const p = new Cls();
  const posted = [];
  p.port = { postMessage: (m) => posted.push(m) };
  return { p, posted };
}

test("registers pcm-capture", () => {
  assert.equal(typeof registered["pcm-capture"], "function");
  assert.equal(registered["pcm-capture"].name, "PcmCapture");
});

test("process posts a copy of channel 0 and returns true", () => {
  const { p, posted } = make();
  const ch0 = Float32Array.from([0.1, 0.2, 0.3]);
  assert.equal(p.process([[ch0, Float32Array.from([9, 9, 9])]]), true);
  assert.equal(posted.length, 1);
  assert.ok(posted[0] instanceof Float32Array);
  assert.notEqual(posted[0], ch0);
  assert.deepEqual(Array.from(posted[0]), Array.from(ch0));
  ch0[0] = 5; // the browser reuses its buffers
  assert.ok(Math.abs(posted[0][0] - 0.1) < 1e-6);
});

test("no input -> returns true, posts nothing", () => {
  const { p, posted } = make();
  assert.equal(p.process([]), true);
  assert.equal(p.process([[]]), true);
  assert.equal(p.process(undefined), true);
  assert.equal(posted.length, 0);
});
