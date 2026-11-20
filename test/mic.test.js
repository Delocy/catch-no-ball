import { test } from "node:test";
import assert from "node:assert/strict";
import { canRecord, micErrorKind, micErrorCopy } from "../src/client/mic.js";
import { COPY } from "../src/client/copy.js";

const gum = { mediaDevices: { getUserMedia() {} } };

test("canRecord false without mediaDevices, AudioContext or AudioWorkletNode; true with all three (webkitAudioContext counts)", () => {
  const AC = class {};
  const AW = class {};
  assert.equal(canRecord({ navigator: gum, AudioContext: AC, AudioWorkletNode: AW }), true);
  assert.equal(canRecord({ navigator: gum, webkitAudioContext: AC, AudioWorkletNode: AW }), true);
  assert.equal(canRecord({ navigator: {}, AudioContext: AC, AudioWorkletNode: AW }), false);
  assert.equal(canRecord({ navigator: { mediaDevices: {} }, AudioContext: AC, AudioWorkletNode: AW }), false);
  assert.equal(canRecord({ AudioContext: AC, AudioWorkletNode: AW }), false);
  assert.equal(canRecord({ navigator: gum, AudioWorkletNode: AW }), false);
  assert.equal(canRecord({ navigator: gum, AudioContext: AC }), false);
  assert.equal(canRecord({}), false);
});

test("canRecord defaults to globalThis (Node has no microphone)", () => {
  assert.equal(canRecord(), false);
});

test("NotAllowedError -> denied; NotFoundError -> no_mic; TypeError -> other", () => {
  const err = (name) => Object.assign(new Error("x"), { name });
  assert.equal(micErrorKind(err("NotAllowedError")), "denied");
  assert.equal(micErrorKind(err("SecurityError")), "denied");
  assert.equal(micErrorKind(err("NotFoundError")), "no_mic");
  assert.equal(micErrorKind(err("OverconstrainedError")), "no_mic");
  assert.equal(micErrorKind(new TypeError("x")), "other");
  assert.equal(micErrorKind(undefined), "other");
  assert.equal(micErrorKind("NotAllowedError"), "other");
});

test("denied copy is COPY.micBlocked; the others say the browser can't listen", () => {
  assert.equal(micErrorCopy("denied"), COPY.micBlocked);
  assert.equal(micErrorCopy("no_mic"), COPY.cantListen);
  assert.equal(micErrorCopy("other"), COPY.cantListen);
  assert.equal(micErrorCopy("unsupported"), COPY.cantListen);
});
