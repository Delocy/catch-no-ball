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
