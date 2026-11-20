import { test } from "node:test";
import assert from "node:assert/strict";
import { resampleTo16k, encodeWav, rms, isSilent, SILENCE_RMS } from "../src/client/wav.js";
import { wavInfo } from "../src/audio.js";

const sine = (n, rate, amp = 0.5, hz = 440) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

test("SILENCE_RMS is 0.01", () => assert.equal(SILENCE_RMS, 0.01));

test("48 kHz -> 16 kHz keeps duration and averages blocks of 3", () => {
  const out = resampleTo16k(new Float32Array(48000), 48000);
  assert.equal(out.length, 16000);
  const avg = resampleTo16k(Float32Array.from([0.3, 0.6, 0.9, -0.3, -0.3, -0.3]), 48000);
  assert.equal(avg.length, 2);
  assert.ok(Math.abs(avg[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(avg[1] + 0.3) < 1e-6);
});

test("44.1 kHz -> 16000 +- 1, by linear interpolation", () => {
  const out = resampleTo16k(new Float32Array(44100).fill(0.25), 44100);
  assert.ok(Math.abs(out.length - 16000) <= 1, String(out.length));
  assert.ok(out.every((v) => Math.abs(v - 0.25) < 1e-6));
  const ramp = resampleTo16k(Float32Array.from({ length: 441 }, (_, i) => i / 441), 44100);
  for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i] > ramp[i - 1]);
});

test("16 kHz returns the input", () => {
  const x = new Float32Array(10);
  assert.equal(resampleTo16k(x, 16000), x);
});

test("an empty input gives an empty output", () => {
  assert.equal(resampleTo16k(new Float32Array(0), 44100).length, 0);
  assert.equal(resampleTo16k(new Float32Array(0), 48000).length, 0);
});

test("encodeWav header says RIFF/WAVE, PCM 1, 1 channel, 16000 Hz, byte rate 32000, 16 bits", () => {
  const b = encodeWav(new Float32Array(16000));
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const str = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  assert.equal(str(0, 4), "RIFF");
  assert.equal(v.getUint32(4, true), 36 + 32000);
  assert.equal(str(8, 4), "WAVE");
  assert.equal(str(12, 4), "fmt ");
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(28, true), 32000);
  assert.equal(v.getUint16(32, true), 2);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(str(36, 4), "data");
  assert.equal(v.getUint32(40, true), 32000);
});

test("1 s is 44 + 32000 bytes", () => {
  assert.equal(encodeWav(new Float32Array(16000)).length, 44 + 32000);
});

test("encodeWav clamps 2.0 -> 32767 and -2.0 -> -32768", () => {
  const b = encodeWav(Float32Array.from([2.0, -2.0, 0.5, -0.5, 0]));
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  assert.equal(v.getInt16(44, true), 32767);
  assert.equal(v.getInt16(46, true), -32768);
  assert.equal(v.getInt16(48, true), Math.round(0.5 * 0x7fff));
  assert.equal(v.getInt16(50, true), -0x4000);
  assert.equal(v.getInt16(52, true), 0);
});

test("isSilent: zeros true; a 0.5-amplitude 440 Hz sine false; rms 0.009 true, 0.011 false", () => {
  assert.equal(isSilent(new Float32Array(1000)), true);
  assert.equal(isSilent(sine(16000, 16000)), false);
  assert.equal(isSilent(new Float32Array(1000).fill(0.009)), true);
  assert.equal(isSilent(new Float32Array(1000).fill(0.011)), false);
  assert.equal(isSilent(new Float32Array(1000).fill(0.05), 0.1), true);
});

test("rms: a constant has itself as rms; empty is 0", () => {
  assert.ok(Math.abs(rms(new Float32Array(10).fill(-0.3)) - 0.3) < 1e-6);
  assert.equal(rms(new Float32Array(0)), 0);
});

test("round trip: wavInfo(encodeWav(1 s)) reads 1 s, 16000 Hz, mono", () => {
  const info = wavInfo(encodeWav(sine(16000, 16000)));
  assert.equal(info.seconds, 1);
  assert.equal(info.sampleRate, 16000);
  assert.equal(info.channels, 1);
  assert.equal(info.bitsPerSample, 16);
});

import { clipToSend, MIN_SEND_SECONDS } from "../src/client/wav.js";

test("clipToSend: a loud clip of 0.5 s or more becomes a 16 kHz WAV", () => {
  assert.equal(MIN_SEND_SECONDS, 0.5);
  const wav = clipToSend(sine(24000, 48000), 48000); // 0.5 s
  assert.ok(wav instanceof Uint8Array);
  const info = wavInfo(wav);
  assert.equal(info.sampleRate, 16000);
  assert.equal(info.seconds, 0.5);
});

test("clipToSend: silence, or under 0.5 s, is not sent", () => {
  assert.equal(clipToSend(new Float32Array(48000), 48000), null);
  assert.equal(clipToSend(sine(23999, 48000), 48000), null);
  assert.equal(clipToSend(new Float32Array(0), 48000), null);
});
