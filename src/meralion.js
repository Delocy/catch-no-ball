// All MERaLiON HTTP and parsing. Shapes from slice 3's step 0 (transcript only).
import { bytesToBase64 } from "./audio.js";

export const MERALION_BASE = "https://api.meralion.ai/v1";
export const MERALION_MODEL = "MERaLiON/MERaLiON-3-3B-ASR-CTM"; // recorded; the request does not send it
export const MERALION_MODE = "transcript_only";
export const MERALION_TIMEOUT_MS = 20000;

export class MeralionError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "MeralionError";
    this.status = status;
  }
}

// MERaLiON sometimes brackets a particle it heard ("Can (loh) I do it tomorrow?"). Keep the
// word, drop the brackets, so the cache, interpret's verbatim check and the card all see the
// same clean text. Only a single bracketed word is touched; real parentheses are left alone.
export function cleanTranscript(text) {
  return String(text)
    .replace(/\(\s*([\p{L}']{1,12})\s*\)/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// One JSON request per clip. Error bodies are never trusted to be JSON (a 500 is plain text),
// and are not put in the error message.
export async function callMeralionTranscribe(bytes, env, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(`${MERALION_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.MERALION_API_KEY },
      body: JSON.stringify({ audio_url: "data:audio/wav;base64," + bytesToBase64(bytes) }),
      signal: AbortSignal.timeout(MERALION_TIMEOUT_MS),
    });
  } catch (e) {
    throw new MeralionError(`request failed: ${e && e.message}`);
  }
  if (!res.ok) throw new MeralionError(`MERaLiON returned ${res.status}`, res.status);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new MeralionError("reply body is not JSON", res.status);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new MeralionError("reply has no transcript", res.status);
  const total = data.usage?.total_tokens;
  return { text: cleanTranscript(content), tokens: Number.isFinite(total) && total > 0 ? total : 0 };
}
