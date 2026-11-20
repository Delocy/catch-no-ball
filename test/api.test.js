import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, ApiError } from "../src/client/api.js";

function fake(status, body) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (status === "reject") throw new TypeError("offline");
    return new Response(JSON.stringify(body), { status });
  };
  fetchImpl.seen = seen;
  return fetchImpl;
}

test("sendText posts JSON to /api/text and returns the ChunkResult", async () => {
  const f = fake(200, { status: "ok" });
  const api = createApi({ fetchImpl: f });
  const r = await api.sendText({ text: "hi", sessionId: "s", context: ["a"] });
  assert.deepEqual(r, { status: "ok" });
  assert.equal(f.seen[0].url, "/api/text");
  assert.equal(f.seen[0].init.method, "POST");
  assert.deepEqual(JSON.parse(f.seen[0].init.body), { text: "hi", sessionId: "s", context: ["a"] });
  assert.equal(f.seen[0].init.headers["content-type"], "application/json");
});

test("sends no auth header and honours base", async () => {
  const f = fake(200, {});
  await createApi({ fetchImpl: f, base: "http://h" }).sendText({ text: "x", sessionId: "s", context: [] });
  assert.equal(f.seen[0].url, "http://h/api/text");
  const keys = Object.keys(f.seen[0].init.headers).map((k) => k.toLowerCase());
  assert.deepEqual(keys, ["content-type"]);
});

test("rejected fetch gives kind network", async () => {
  const api = createApi({ fetchImpl: fake("reject") });
  await assert.rejects(api.sendText({ text: "x", sessionId: "s", context: [] }), (e) => e instanceof ApiError && e.kind === "network" && e.status === null);
});

test("400 gives bad_request, 500 gives server", async () => {
  await assert.rejects(createApi({ fetchImpl: fake(400, { error: "bad_text" }) }).sendText({ text: "", sessionId: "s", context: [] }), (e) => e.kind === "bad_request" && e.status === 400);
  await assert.rejects(createApi({ fetchImpl: fake(500, {}) }).sendText({ text: "x", sessionId: "s", context: [] }), (e) => e.kind === "server" && e.status === 500);
});

test("a 200 with an unreadable body gives kind server", async () => {
  const f = async () => new Response("<html>", { status: 200 });
  await assert.rejects(createApi({ fetchImpl: f }).sendText({ text: "x", sessionId: "s", context: [] }), (e) => e.kind === "server");
});

test("sendClip sends multipart with audio (audio/wav), sessionId and context JSON, and no auth header", async () => {
  const f = fake(200, { status: "ok", source: "meralion" });
  const wav = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
  const r = await createApi({ fetchImpl: f }).sendClip({ wav, sessionId: "s9", context: ["a", "b"] });
  assert.deepEqual(r, { status: "ok", source: "meralion" });
  const { url, init } = f.seen[0];
  assert.equal(url, "/api/chunk");
  assert.equal(init.method, "POST");
  assert.ok(init.body instanceof FormData);
  const audio = init.body.get("audio");
  assert.ok(audio instanceof Blob);
  assert.equal(audio.type, "audio/wav");
  assert.equal(audio.name, "clip.wav");
  assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), wav);
  assert.equal(init.body.get("sessionId"), "s9");
  assert.deepEqual(JSON.parse(init.body.get("context")), ["a", "b"]);
  // the browser sets the multipart content-type with its boundary; we set no headers at all
  const keys = Object.keys(init.headers || {}).map((k) => k.toLowerCase());
  assert.ok(!keys.includes("authorization") && !keys.includes("content-type") && !keys.includes("x-asr"));
});

test("sendClip errors map like sendText", async () => {
  const wav = new Uint8Array(4);
  await assert.rejects(createApi({ fetchImpl: fake(413, { error: "too_long" }) }).sendClip({ wav, sessionId: "s", context: [] }), (e) => e.kind === "bad_request" && e.status === 413);
  await assert.rejects(createApi({ fetchImpl: fake("reject") }).sendClip({ wav, sessionId: "s", context: [] }), (e) => e.kind === "network");
});

test("budget GETs /api/budget", async () => {
  const f = fake(200, { month: "2026-11" });
  assert.deepEqual(await createApi({ fetchImpl: f, base: "http://h" }).budget(), { month: "2026-11" });
  assert.equal(f.seen[0].url, "http://h/api/budget");
  assert.equal((f.seen[0].init && f.seen[0].init.method) || "GET", "GET");
});
