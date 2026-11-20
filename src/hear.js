// Turns a clip into a transcript: KV cache, then the guard, then MERaLiON.
// Slice 4 adds the Whisper fallback without changing the signature.
import { wavInfo, sha256Hex } from "./audio.js";
import { callMeralionTranscribe, MeralionError } from "./meralion.js";
import { reserveMeralion, recordMeralionTokens } from "./guard.js";

export const CACHE_TTL_SECONDS = 604800; // 7 days

export class HearError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = "HearError";
    this.reason = reason; // "refused" | "meralion" | "whisper"
  }
}

const DEFAULT_DEPS = { fetchImpl: fetch, reserve: reserveMeralion, recordTokens: recordMeralionTokens, whisper: null };

async function cacheGet(env, key) {
  if (!env.CACHE) return null;
  try {
    const v = await env.CACHE.get(key, "json");
    return v && typeof v.transcript === "string" ? v.transcript : null;
  } catch (e) {
    console.error(`cache get failed: ${e && e.message}`);
    return null;
  }
}

async function cachePut(env, key, transcript) {
  if (!env.CACHE) return;
  try {
    // Only the text is stored, never the audio.
    await env.CACHE.put(key, JSON.stringify({ transcript }), { expirationTtl: CACHE_TTL_SECONDS });
  } catch (e) {
    console.error(`cache put failed: ${e && e.message}`);
  }
}

export async function hearClip(bytes, env, { asr = "auto" } = {}, deps = DEFAULT_DEPS) {
  void asr; // "auto" is the only mode until slice 4
  const d = { ...DEFAULT_DEPS, ...deps };
  const key = `hear:${await sha256Hex(bytes)}`;

  const hit = await cacheGet(env, key);
  if (hit !== null) return { transcript: hit, source: "meralion", cached: true };

  const { seconds } = wavInfo(bytes);
  const r = await d.reserve(env, { seconds });
  if (!r.allow) throw new HearError(`MERaLiON refused: ${r.reason}`, "refused");

  let reply;
  try {
    reply = await callMeralionTranscribe(bytes, env, d.fetchImpl);
  } catch (e) {
    if (e instanceof MeralionError) throw new HearError(`MERaLiON failed: ${e.message}`, "meralion");
    throw e;
  }
  await d.recordTokens(env, reply.tokens);

  if (reply.text !== "") await cachePut(env, key, reply.text);
  return { transcript: reply.text, source: "meralion", cached: false };
}
