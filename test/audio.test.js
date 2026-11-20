import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wavInfo, sha256Hex, bytesToBase64, MIN_CLIP_SECONDS, MAX_CLIP_SECONDS, REQUIRED_SAMPLE_RATE } from "../src/audio.js";
import { makeWav } from "./helpers/wav.js";

const fixture = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test("constants: 0.5 s, 30 s, 16000 Hz", () => {
  assert.equal(MIN_CLIP_SECONDS, 0.5);
  assert.equal(MAX_CLIP_SECONDS, 30);
  assert.equal(REQUIRED_SAMPLE_RATE, 16000);
});

test("wavInfo reads 15 s of 16 kHz mono PCM16", () => {
  const info = wavInfo(makeWav(15));
  assert.equal(info.seconds, 15);
  assert.equal(info.sampleRate, 16000);
  assert.equal(info.channels, 1);
  assert.equal(info.bitsPerSample, 16);
});

test("wavInfo reads stereo and 44.1 kHz headers as they are", () => {
  assert.equal(wavInfo(makeWav(1, { channels: 2 })).channels, 2);
  const i = wavInfo(makeWav(2, { sampleRate: 44100 }));
  assert.equal(i.sampleRate, 44100);
  assert.equal(i.seconds, 2);
});

test("wavInfo walks past a LIST chunk before data", () => {
  const wav = makeWav(1);
  const list = new Uint8Array(8 + 10);
  list.set([0x4c, 0x49, 0x53, 0x54], 0); // LIST
  new DataView(list.buffer).setUint32(4, 10, true);
  const out = new Uint8Array(wav.length + list.length);
  out.set(wav.subarray(0, 36), 0);
  out.set(list, 36);
  out.set(wav.subarray(36), 36 + list.length);
  assert.equal(wavInfo(out).seconds, 1);
});

test("wavInfo skips an odd-sized chunk with its pad byte", () => {
  const wav = makeWav(1);
  const junk = new Uint8Array(8 + 3 + 1);
  junk.set([0x4a, 0x55, 0x4e, 0x4b], 0); // JUNK
  new DataView(junk.buffer).setUint32(4, 3, true);
  const out = new Uint8Array(wav.length + junk.length);
  out.set(wav.subarray(0, 36), 0);
  out.set(junk, 36);
  out.set(wav.subarray(36), 36 + junk.length);
  assert.equal(wavInfo(out).seconds, 1);
});

test("rejects non-WAV with not_wav", () => {
  for (const bytes of [
    new Uint8Array(0),
    new TextEncoder().encode("hello, this is definitely not a wave file at all"),
    makeWav(1).subarray(0, 20),
  ]) {
    assert.throws(() => wavInfo(bytes), { message: "not_wav" });
  }
});

test("rejects a RIFF/WAVE with no data chunk, or a non-PCM format, with not_wav", () => {
  const noData = makeWav(1).slice(0, 36);
  new DataView(noData.buffer).setUint32(4, 28, true);
  assert.throws(() => wavInfo(noData), { message: "not_wav" });
  const float = makeWav(1);
  new DataView(float.buffer).setUint16(20, 3, true);
  assert.throws(() => wavInfo(float), { message: "not_wav" });
});

test("wavInfo reads both sample WAVs as 16 kHz mono", () => {
  for (const n of ["r3-singlish.wav", "r3-plain.wav"]) {
    const i = wavInfo(fixture(n));
    assert.equal(i.sampleRate, 16000, n);
    assert.equal(i.channels, 1, n);
    assert.equal(i.bitsPerSample, 16, n);
    assert.ok(i.seconds > 1 && i.seconds < 5, `${n}: ${i.seconds}`);
  }
});

test('sha256Hex("abc")', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("bytesToBase64 equals Buffer.from(bytes).toString(\"base64\") for 100,000 random bytes", () => {
  const bytes = new Uint8Array(100000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString("base64"));
  assert.equal(bytesToBase64(new Uint8Array(0)), "");
});
