// The MERaLiON rate guard and monthly budget. Every MERaLiON request is counted here.
// MeralionGuard is a plain class (no "cloudflare:workers" import) so Node can test it.
import { json } from "./http.js";

export const RATE_LIMIT_PER_MIN = 5;
export const RATE_WINDOW_MS = 60000;
export const LIMITS = { seconds: 3600, requests: 1000, tokens: 100000 };

const monthOf = (now) => new Date(now).toISOString().slice(0, 7);

// Prunes the rate window and resets the monthly counters when the UTC month changes. Pure.
function current(state, now) {
  const s = state ?? { recent: [], month: monthOf(now), seconds: 0, requests: 0, tokens: 0 };
  const recent = (s.recent ?? []).filter((t) => t > now - RATE_WINDOW_MS);
  const month = monthOf(now);
  if (s.month !== month) return { recent, month, seconds: 0, requests: 0, tokens: 0 };
  return { recent, month, seconds: s.seconds, requests: s.requests, tokens: s.tokens };
}

export function decide(state, { now, seconds }) {
  const fresh = state === undefined;
  const s = current(state, now);
  const refuse = (reason) => ({ allow: false, reason, state: fresh ? s : state });
  if (s.recent.length >= RATE_LIMIT_PER_MIN) return refuse("rate");
  if (s.tokens >= LIMITS.tokens) return refuse("tokens");
  if (s.requests + 1 > LIMITS.requests) return refuse("requests");
  if (s.seconds + seconds > LIMITS.seconds) return refuse("seconds");
  return {
    allow: true,
    state: { ...s, recent: [...s.recent, now], requests: s.requests + 1, seconds: s.seconds + seconds },
  };
}

export function recordTokens(state, { now, tokens }) {
  const s = current(state, now);
  const add = Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
  return { ...s, tokens: s.tokens + add };
}

export function budgetStatus(state, now) {
  const s = current(state, now);
  return {
    month: s.month,
    used: { seconds: s.seconds, requests: s.requests, tokens: s.tokens },
    limits: LIMITS,
    recentRequests: s.recent.length,
  };
}

// Durable Object: one instance ("global") serialises every reserve, so the count is exact.
export class MeralionGuard {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    const now = Date.now();
    const state = await this.ctx.storage.get("state");

    if (request.method === "GET" && pathname === "/status") return json(budgetStatus(state, now));

    if (request.method === "POST" && (pathname === "/reserve" || pathname === "/tokens")) {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad_request" }, 400);
      }
      if (pathname === "/tokens") {
        await this.ctx.storage.put("state", recordTokens(state, { now, tokens: body?.tokens }));
        return json({ ok: true });
      }
      const seconds = body?.seconds;
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
        return json({ error: "bad_request" }, 400);
      }
      const d = decide(state, { now, seconds });
      if (d.allow) await this.ctx.storage.put("state", d.state);
      return json(d.allow ? { allow: true } : { allow: false, reason: d.reason });
    }

    return json({ error: "not_found" }, 404);
  }
}

// The Durable Object is addressed by name; the host in these URLs is never resolved.
function callGuard(env, path, init) {
  const guard = env.MERALION_GUARD.get(env.MERALION_GUARD.idFromName("global"));
  return guard.fetch(new Request(`https://guard${path}`, init));
}
const postJson = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Never lets MERaLiON be called unguarded: no binding, a throw or an odd reply is a refusal.
export async function reserveMeralion(env, { seconds }) {
  try {
    const res = await callGuard(env, "/reserve", postJson({ seconds }));
    const r = await res.json();
    if (!res.ok || typeof r?.allow !== "boolean") throw new Error(`guard replied ${res.status}`);
    return r.allow ? { allow: true } : { allow: false, reason: r.reason };
  } catch (e) {
    console.error(`guard reserve failed: ${e && e.message}`);
    return { allow: false, reason: "guard" };
  }
}

export async function recordMeralionTokens(env, tokens) {
  try {
    await callGuard(env, "/tokens", postJson({ tokens }));
  } catch (e) {
    console.error(`guard tokens failed: ${e && e.message}`);
  }
}

export async function guardStatus(env) {
  const res = await callGuard(env, "/status", { method: "GET" });
  return res.json();
}
