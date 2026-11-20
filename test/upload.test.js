import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UPLOAD_MAX_SECONDS, UPLOAD_MAX_BYTES, UPLOAD_GAP_MS, UPLOAD_ACCEPT, UPLOAD_EXTENSIONS,
  checkUpload, checkDuration, downmix, splitIntoClips, prepareUpload, estimateMinutes,
  minutesLeft, budgetOut, formatCopy, planConfirm, uploadItems, uploadGap, progressText, buttonsFor,
} from "../src/client/upload.js";
import { CLIP_SECONDS } from "../src/client/clipper.js";
import { COPY } from "../src/client/copy.js";
import { wavInfo } from "../src/audio.js";

const sine = (seconds, rate) => {
  const a = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < a.length; i++) a[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate);
  return a;
};
const budget = (used = {}) => ({
  limits: { seconds: 3600, requests: 1000, tokens: 100000 },
  used: { seconds: 0, requests: 0, tokens: 0, ...used },
});

test("constants", () => {
  assert.equal(UPLOAD_MAX_SECONDS, 120);
  assert.equal(UPLOAD_GAP_MS, 13000);
  assert.equal(UPLOAD_MAX_BYTES, 41943040);
  assert.equal(UPLOAD_ACCEPT, "audio/*,.m4a,.mp3,.wav");
  assert.deepEqual(UPLOAD_EXTENSIONS, ["m4a", "mp3", "wav"]);
  assert.equal(CLIP_SECONDS, 15);
});

test("checkUpload", () => {
  assert.deepEqual(checkUpload({ name: "memo.m4a", type: "audio/x-m4a", size: 1e6 }), { ok: true });
  assert.deepEqual(checkUpload({ name: "Memo.M4A", type: "", size: 1e6 }), { ok: true });
  assert.deepEqual(checkUpload({ name: "song.mp3", type: "audio/mpeg", size: 10 }), { ok: true });
  assert.deepEqual(checkUpload({ name: "notes.pdf", type: "application/pdf", size: 10 }), {
    ok: false, reason: "not_audio", copy: COPY.uploadUnreadable,
  });
  assert.deepEqual(checkUpload({ name: "noext", type: "", size: 10 }).reason, "not_audio");
  assert.deepEqual(checkUpload({ name: "a.wav", type: "audio/wav", size: 41943041 }), {
    ok: false, reason: "too_big", copy: COPY.uploadTooLong,
  });
  assert.deepEqual(checkUpload({ name: "a.wav", type: "audio/wav", size: 41943040 }), { ok: true });
});

test("checkDuration", () => {
  assert.deepEqual(checkDuration(120), { ok: true });
  assert.deepEqual(checkDuration(120.01), { ok: false, reason: "too_long", copy: COPY.uploadTooLong });
});

test("a 121 s file is refused", () => {
  const r = prepareUpload({ channels: [new Float32Array(121 * 48000).fill(0.3)], sampleRate: 48000 });
  assert.deepEqual(r, { ok: false, reason: "too_long", copy: COPY.uploadTooLong });
});

test("exactly 120 s is accepted and gives 8 clips", () => {
  const r = prepareUpload({ channels: [sine(120, 16000)], sampleRate: 16000 });
  assert.equal(r.ok, true);
  assert.equal(r.wavs.length, 8);
});

test("40 s gives 3 clips of 15/15/10 at 16, 48 and 44.1 kHz", () => {
  for (const rate of [16000, 48000, 44100]) {
    const r = prepareUpload({ channels: [sine(40, rate)], sampleRate: rate });
    assert.equal(r.ok, true);
    assert.equal(r.wavs.length, 3);
    const secs = r.wavs.map((w) => wavInfo(w).seconds);
    [15, 15, 10].forEach((s, i) => assert.ok(Math.abs(secs[i] - s) <= 1 / 16000 + 1e-9, `${rate}: ${secs}`));
    if (rate === 16000) {
      assert.deepEqual(secs, [15, 15, 10]);
      assert.equal(r.seconds, 40);
    }
  }
});

test("splitIntoClips", () => {
  assert.deepEqual(splitIntoClips(new Float32Array(640000), 16000, 15).map((c) => c.length), [240000, 240000, 160000]);
  assert.equal(splitIntoClips(new Float32Array(480000), 16000).length, 2);
  assert.deepEqual(splitIntoClips(new Float32Array(0), 16000), []);
  const ramp = Float32Array.from({ length: 500000 }, (_, i) => i);
  const clips = splitIntoClips(ramp, 16000);
  assert.equal(clips[1][0], 240000);
  assert.equal(clips[0][239999], 239999);
});

test("downmix", () => {
  const a = Float32Array.of(0.5, 0.4);
  assert.equal(downmix([a]), a);
  assert.equal(downmix([Float32Array.of(0.5), Float32Array.of(-0.5)])[0], 0);
  assert.ok(Math.abs(downmix([Float32Array.of(0.4), Float32Array.of(0.4)])[0] - 0.4) < 1e-6);
});

test("stereo 40 s file gives 3 clips", () => {
  const ch = sine(40, 48000);
  const r = prepareUpload({ channels: [ch, ch], sampleRate: 48000 });
  assert.equal(r.wavs.length, 3);
});

test("silent clips are skipped", () => {
  const s = sine(40, 16000);
  s.fill(0, 15 * 16000, 30 * 16000);
  const r = prepareUpload({ channels: [s], sampleRate: 16000 });
  assert.equal(r.wavs.length, 2);
  assert.equal(r.seconds, 25);
  assert.deepEqual(prepareUpload({ channels: [new Float32Array(40 * 16000)], sampleRate: 16000 }), {
    ok: false, reason: "silent", copy: COPY.uploadSilent,
  });
  assert.equal(prepareUpload({ channels: [sine(30.3, 16000)], sampleRate: 16000 }).wavs.length, 2);
});

test("estimateMinutes rounds up", () => {
  const e = [[0, 0], [1, 1], [40, 1], [60, 1], [60.5, 2], [120, 2]];
  for (const [s, m] of e) assert.equal(estimateMinutes(s), m);
});

test("minutesLeft rounds down and is never negative", () => {
  for (const [used, m] of [[0, 60], [120, 58], [120.5, 57], [3590, 0], [3600, 0], [3700, 0]]) {
    assert.equal(minutesLeft(budget({ seconds: used })), m);
  }
});

test("budgetOut", () => {
  assert.equal(budgetOut(budget({ seconds: 3600 })), true);
  assert.equal(budgetOut(budget({ requests: 1000 })), true);
  assert.equal(budgetOut(budget({ tokens: 100000 })), true);
  assert.equal(budgetOut(budget({ seconds: 3599, requests: 999, tokens: 99999 })), false);
});

test("confirm copy", () => {
  assert.deepEqual(planConfirm(40, budget({ seconds: 120 })), {
    kind: "confirm", text: "This file uses about 1 min of MERaLiON; 58 min left this month. Send?",
  });
  assert.equal(planConfirm(17, budget()).text, "This file uses about 1 min of MERaLiON; 60 min left this month. Send?");
  assert.equal(planConfirm(120, budget({ seconds: 3000 })).text, "This file uses about 2 min of MERaLiON; 10 min left this month. Send?");
  assert.deepEqual(planConfirm(40, null), { kind: "confirm", text: "This file uses about 1 min of MERaLiON. Send?" });
  assert.deepEqual(planConfirm(40, budget({ tokens: 100000 })), { kind: "budget_out", text: COPY.uploadBudgetOut });
});

test("formatCopy leaves unknown placeholders", () => {
  assert.equal(formatCopy("{a} and {b}", { a: 1 }), "1 and {b}");
});

test("uploadItems", () => {
  const items = uploadItems([Uint8Array.of(1), Uint8Array.of(2), Uint8Array.of(3)], "u1");
  assert.deepEqual(items.map((i) => [i.kind, i.uploadId, i.index, i.total]), [
    ["clip", "u1", 1, 3], ["clip", "u1", 2, 3], ["clip", "u1", 3, 3],
  ]);
  assert.deepEqual(items[0].wav, Uint8Array.of(1));
});

test("uploadGap", () => {
  const a = { kind: "clip", uploadId: "u1" };
  const b = { kind: "clip", uploadId: "u1" };
  assert.equal(uploadGap(b, a, { cached: false }), 13000);
  assert.equal(uploadGap(b, a, { cached: true }), 0);
  assert.equal(uploadGap(b, a, undefined), 13000);
  assert.equal(uploadGap({ kind: "text", text: "x" }, a, {}), 0);
  assert.equal(uploadGap(b, { kind: "clip" }, {}), 0);
  assert.equal(uploadGap({ kind: "clip", uploadId: "u2" }, a, {}), 0);
});

test("progressText", () => assert.equal(progressText(2, 3), "Sending clip 2 of 3"));

test("buttonsFor", () => {
  assert.deepEqual(buttonsFor("idle"), { listenDisabled: false, uploadDisabled: false, uploadLabel: "Upload audio" });
  assert.deepEqual(buttonsFor("listening"), { listenDisabled: false, uploadDisabled: true, uploadLabel: "Upload audio" });
  assert.deepEqual(buttonsFor("decoding"), { listenDisabled: true, uploadDisabled: true, uploadLabel: "Upload audio" });
  assert.deepEqual(buttonsFor("confirming"), { listenDisabled: true, uploadDisabled: true, uploadLabel: "Upload audio" });
  assert.deepEqual(buttonsFor("sending"), { listenDisabled: true, uploadDisabled: false, uploadLabel: "Cancel upload" });
});
