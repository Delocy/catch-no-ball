import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide, recordTokens, budgetStatus, MeralionGuard, reserveMeralion, recordMeralionTokens, guardStatus,
  RATE_LIMIT_PER_MIN, RATE_WINDOW_MS, LIMITS,
} from "../src/guard.js";

const T = Date.UTC(2026, 10, 20, 9, 0, 0);
const full = (over = {}) => ({ recent: [], month: "2026-11", seconds: 0, requests: 0, tokens: 0, ...over });

test("constants are the whole free tier", () => {
  assert.equal(RATE_LIMIT_PER_MIN, 5);
  assert.equal(RATE_WINDOW_MS, 60000);
  assert.deepEqual(LIMITS, { seconds: 3600, requests: 1000, tokens: 100000 });
});

test("fresh undefined state is allowed", () => {
  const r = decide(undefined, { now: T, seconds: 3 });
  assert.equal(r.allow, true);
  assert.deepEqual(r.state, { recent: [T], month: "2026-11", seconds: 3, requests: 1, tokens: 0 });
});

test("allows 5 requests in a minute and refuses the 6th with reason rate", () => {
  let state;
  for (let i = 0; i < 5; i++) {
    const r = decide(state, { now: T + i * 1000, seconds: 3 });
    assert.equal(r.allow, true, `request ${i + 1}`);
    state = r.state;
  }
  const r = decide(state, { now: T + 5000, seconds: 3 });
  assert.equal(r.allow, false);
  assert.equal(r.reason, "rate");
});

function fiveAt(t0) {
  let state;
  for (let i = 0; i < 5; i++) state = decide(state, { now: t0, seconds: 1 }).state;
  return state;
}

test("a request 61 s after the first five is allowed again", () => {
  assert.equal(decide(fiveAt(T), { now: T + 61000, seconds: 1 }).allow, true);
});

test("one exactly 60 s later is also allowed (entries at or before now - 60000 are dropped)", () => {
  const r = decide(fiveAt(T), { now: T + 60000, seconds: 1 });
  assert.equal(r.allow, true);
  assert.deepEqual(r.state.recent, [T + 60000]);
  assert.equal(decide(fiveAt(T), { now: T + 59999, seconds: 1 }).reason, "rate");
});

test("audio: stops at 3600 s", () => {
  const r = decide(full({ seconds: 3590 }), { now: T, seconds: 15 });
  assert.deepEqual([r.allow, r.reason], [false, "seconds"]);
});

test("audio: exactly reaching the limit is allowed", () => {
  const r = decide(full({ seconds: 3585 }), { now: T, seconds: 15 });
  assert.equal(r.allow, true);
  assert.equal(r.state.seconds, 3600);
});

test("requests: stops at 1000", () => {
  assert.equal(decide(full({ requests: 1000 }), { now: T, seconds: 1 }).reason, "requests");
  assert.equal(decide(full({ requests: 999 }), { now: T, seconds: 1 }).allow, true);
});

test("tokens: refused once tokens reach 100000", () => {
  assert.equal(decide(full({ tokens: 100000 }), { now: T, seconds: 1 }).reason, "tokens");
  assert.equal(decide(full({ tokens: 99999 }), { now: T, seconds: 1 }).allow, true);
});

test("the rate check comes before the monthly limits", () => {
  const s = { ...fiveAt(T), tokens: 100000 };
  assert.equal(decide(s, { now: T + 1, seconds: 1 }).reason, "rate");
});

test("recordTokens adds tokens", () => {
  const s = recordTokens(full({ tokens: 10 }), { now: T, tokens: 344 });
  assert.equal(s.tokens, 354);
  assert.equal(recordTokens(undefined, { now: T, tokens: 5 }).tokens, 5);
});

test("recordTokens resets the month first and ignores bad token counts", () => {
  const s = recordTokens(full({ month: "2026-10", tokens: 900, seconds: 50, requests: 3 }), { now: T, tokens: 344 });
  assert.deepEqual([s.month, s.tokens, s.seconds, s.requests], ["2026-11", 344, 0, 0]);
  assert.equal(recordTokens(full({ tokens: 7 }), { now: T, tokens: -3 }).tokens, 7);
  assert.equal(recordTokens(full({ tokens: 7 }), { now: T, tokens: "x" }).tokens, 7);
});

test("one 15 s request adds 15 seconds and 1 request", () => {
  const r = decide(full({ seconds: 100, requests: 7 }), { now: T, seconds: 15 });
  assert.equal(r.state.seconds, 115);
  assert.equal(r.state.requests, 8);
});

test("budget resets when the UTC month changes", () => {
  const old = full({ month: "2026-10", seconds: 3600, requests: 1000, tokens: 100000 });
  const r = decide(old, { now: T, seconds: 15 });
  assert.equal(r.allow, true);
  assert.deepEqual(
    { month: r.state.month, seconds: r.state.seconds, requests: r.state.requests, tokens: r.state.tokens },
    { month: "2026-11", seconds: 15, requests: 1, tokens: 0 },
  );
  const endNov = Date.parse("2026-11-30T23:59:59Z");
  const s = full({ seconds: 3600, requests: 1000, tokens: 100000 });
  assert.equal(decide(s, { now: endNov, seconds: 1 }).allow, false);
  const dec = decide(s, { now: Date.parse("2026-12-01T00:00:00Z"), seconds: 1 });
  assert.equal(dec.allow, true);
  assert.equal(dec.state.month, "2026-12");
});

test("a refused request changes nothing", () => {
  const s = full({ seconds: 3590, recent: [T - 1000] });
  const copy = structuredClone(s);
  const r = decide(s, { now: T, seconds: 15 });
  assert.equal(r.allow, false);
  assert.deepEqual(r.state, copy);
  assert.deepEqual(s, copy);
  const rate = fiveAt(T);
  const rateCopy = structuredClone(rate);
  assert.deepEqual(decide(rate, { now: T + 1, seconds: 1 }).state, rateCopy);
});

test("an allowed decision does not mutate the input state", () => {
  const s = full();
  decide(s, { now: T, seconds: 2 });
  assert.deepEqual(s, full());
});

test("budgetStatus reports usage, limits and recent requests without consuming", () => {
  const s = full({ recent: [T - 70000, T - 1000, T - 500], seconds: 30, requests: 3, tokens: 1032 });
  assert.deepEqual(budgetStatus(s, T), {
    month: "2026-11",
    used: { seconds: 30, requests: 3, tokens: 1032 },
    limits: LIMITS,
    recentRequests: 2,
  });
  assert.deepEqual(budgetStatus(undefined, T), {
    month: "2026-11", used: { seconds: 0, requests: 0, tokens: 0 }, limits: LIMITS, recentRequests: 0,
  });
  assert.equal(budgetStatus(full({ month: "2026-10", seconds: 99 }), T).used.seconds, 0);
});

function fakeCtx() {
  const map = new Map();
  return { map, storage: { get: async (k) => structuredClone(map.get(k)), put: async (k, v) => { map.set(k, structuredClone(v)); } } };
}
const post = (path, body) => new Request("http://guard" + path, { method: "POST", body: JSON.stringify(body) });

test("MeralionGuard persists state across fetches", async () => {
  const ctx = fakeCtx();
  const g = new MeralionGuard(ctx, {});
  for (let i = 0; i < 5; i++) {
    const r = await (await g.fetch(post("/reserve", { seconds: 3 }))).json();
    assert.deepEqual(r, { allow: true });
  }
  const g2 = new MeralionGuard(ctx, {}); // a fresh instance reads the same storage
  assert.deepEqual(await (await g2.fetch(post("/reserve", { seconds: 3 }))).json(), { allow: false, reason: "rate" });
  assert.equal((await g2.fetch(post("/tokens", { tokens: 344 }))).status, 200);
  const status = await (await g2.fetch(new Request("http://guard/status"))).json();
  assert.equal(status.recentRequests, 5);
  assert.equal(status.used.tokens, 344);
  assert.equal(status.used.requests, 5);
  assert.equal(status.used.seconds, 15);
});

test("MeralionGuard refuses a bad seconds value and answers 404 for other paths", async () => {
  const g = new MeralionGuard(fakeCtx(), {});
  for (const body of [{}, { seconds: -1 }, { seconds: "3" }, { seconds: Infinity }]) {
    const r = await g.fetch(new Request("http://guard/reserve", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(r.status, 400);
  }
  assert.equal((await g.fetch(new Request("http://guard/reserve", { method: "POST", body: "nope" }))).status, 400);
  assert.equal((await g.fetch(new Request("http://guard/other"))).status, 404);
});

function fakeBinding(handler) {
  const seen = { names: [], requests: [] };
  return {
    seen,
    idFromName(n) { seen.names.push(n); return `id:${n}`; },
    get(id) {
      return {
        id,
        async fetch(req) {
          seen.requests.push({ url: req.url, method: req.method, body: req.method === "POST" ? await req.json() : null });
          return handler(req);
        },
      };
    },
  };
}

test("reserveMeralion uses idFromName(\"global\") and posts { seconds }", async () => {
  const b = fakeBinding(() => Response.json({ allow: true }));
  assert.deepEqual(await reserveMeralion({ MERALION_GUARD: b }, { seconds: 15 }), { allow: true });
  assert.deepEqual(b.seen.names, ["global"]);
  assert.equal(b.seen.requests[0].method, "POST");
  assert.match(b.seen.requests[0].url, /\/reserve$/);
  assert.deepEqual(b.seen.requests[0].body, { seconds: 15 });
});

test("reserveMeralion passes a refusal through", async () => {
  const b = fakeBinding(() => Response.json({ allow: false, reason: "rate" }));
  assert.deepEqual(await reserveMeralion({ MERALION_GUARD: b }, { seconds: 1 }), { allow: false, reason: "rate" });
});

test("a missing binding or a throwing stub -> { allow: false, reason: \"guard\" }", async (t) => {
  t.mock.method(console, "error", () => {});
  assert.deepEqual(await reserveMeralion({}, { seconds: 1 }), { allow: false, reason: "guard" });
  assert.deepEqual(await reserveMeralion(undefined, { seconds: 1 }), { allow: false, reason: "guard" });
  const throwing = fakeBinding(() => { throw new Error("down"); });
  assert.deepEqual(await reserveMeralion({ MERALION_GUARD: throwing }, { seconds: 1 }), { allow: false, reason: "guard" });
  const bad = fakeBinding(() => new Response("oops", { status: 500 }));
  assert.deepEqual(await reserveMeralion({ MERALION_GUARD: bad }, { seconds: 1 }), { allow: false, reason: "guard" });
  const weird = fakeBinding(() => Response.json({ allow: "yes" }));
  assert.deepEqual(await reserveMeralion({ MERALION_GUARD: weird }, { seconds: 1 }), { allow: false, reason: "guard" });
});

test("recordMeralionTokens posts { tokens } to /tokens", async () => {
  const b = fakeBinding(() => Response.json({ ok: true }));
  await recordMeralionTokens({ MERALION_GUARD: b }, 344);
  assert.match(b.seen.requests[0].url, /\/tokens$/);
  assert.deepEqual(b.seen.requests[0].body, { tokens: 344 });
});

test("recordMeralionTokens swallows errors", async (t) => {
  const logged = [];
  t.mock.method(console, "error", (...a) => logged.push(a.join(" ")));
  await recordMeralionTokens({}, 344);
  await recordMeralionTokens({ MERALION_GUARD: fakeBinding(() => { throw new Error("down"); }) }, 344);
  assert.equal(logged.length, 2);
});

test("guardStatus GETs /status and returns its JSON", async () => {
  const b = fakeBinding(() => Response.json({ month: "2026-11" }));
  assert.deepEqual(await guardStatus({ MERALION_GUARD: b }), { month: "2026-11" });
  assert.equal(b.seen.requests[0].method, "GET");
  assert.match(b.seen.requests[0].url, /\/status$/);
});

test("guardStatus throws when there is no guard binding", async () => {
  await assert.rejects(guardStatus({}));
});
