import { json } from "./http.js";
import { interpret } from "./interpret.js";
import { cleanContext } from "./prompt.js";
import { wavInfo, MIN_CLIP_SECONDS, MAX_CLIP_SECONDS, REQUIRED_SAMPLE_RATE } from "./audio.js";
import { hearClip } from "./hear.js";
import { guardStatus } from "./guard.js";

export const MAX_TEXT_CHARS = 1000;
// Header-safe: the id is sent as the x-opencode-session header.
const SESSION_ID = /^[A-Za-z0-9_-]{1,100}$/;

const badText = () => json({ error: "bad_text" }, 400);
const badAudio = () => json({ error: "bad_audio" }, 400);

const sessionIdOf = (v) => (typeof v === "string" && SESSION_ID.test(v) ? v : crypto.randomUUID());

function result(status, { source, transcript = "", sentences = [], passes = 0, cached = false }) {
  return json({ status, source, transcript, sentences, passes, cached });
}

// Interprets a transcript (typed or heard); a failure is meaning_unavailable with the words kept.
async function explain({ transcript, context, sessionId, source, cached }, env, deps) {
  try {
    const { sentences, passes } = await deps.interpret({ transcript, context, sessionId }, env);
    return result("ok", { source, transcript, sentences, passes, cached });
  } catch (e) {
    console.error(`interpret failed: ${e && e.message}`);
    return result("meaning_unavailable", { source, transcript, passes: (e && e.passes) ?? 1, cached });
  }
}

export async function handleText(request, env, deps = { interpret }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badText();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return badText();

  const { text } = body;
  if (typeof text !== "string") return badText();
  const transcript = text.trim();
  if (transcript === "" || transcript.length > MAX_TEXT_CHARS) return badText();

  const context = cleanContext(body.context);
  return explain({ transcript, context, sessionId: sessionIdOf(body.sessionId), source: "text", cached: false }, env, deps);
}

function parseContext(raw) {
  if (typeof raw !== "string") return [];
  try {
    return cleanContext(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function handleChunk(request, env, deps = { hearClip, interpret }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return badAudio();
  }
  const audio = form.get("audio");
  if (!audio || typeof audio === "string") return badAudio();
  const bytes = new Uint8Array(await audio.arrayBuffer());

  let info;
  try {
    info = wavInfo(bytes);
  } catch {
    return badAudio();
  }
  if (info.sampleRate !== REQUIRED_SAMPLE_RATE || info.channels !== 1 || info.bitsPerSample !== 16) return badAudio();
  if (info.seconds > MAX_CLIP_SECONDS) return json({ error: "too_long" }, 413);
  // Too short to be speech: never reaches MERaLiON.
  if (info.seconds < MIN_CLIP_SECONDS) return result("silent", { source: "meralion" });

  let heard;
  try {
    heard = await deps.hearClip(bytes, env);
  } catch (e) {
    console.error(`hear failed: ${e && e.reason ? e.reason + ": " : ""}${e && e.message}`);
    return result("uncaught", { source: "meralion" });
  }
  const { source, cached } = heard;
  const transcript = (heard.transcript ?? "").trim();
  // The phone sends only non-silent clips, so no words means speech we couldn't make out (US-7).
  if (transcript === "") return result("uncaught", { source, cached });

  const context = parseContext(form.get("context"));
  return explain({ transcript, context, sessionId: sessionIdOf(form.get("sessionId")), source, cached }, env, deps);
}

export async function handleBudget(request, env, deps = { guardStatus }) {
  return json(await deps.guardStatus(env));
}
