import { TONES, buildMessages } from "./prompt.js";

export const OPENCODE_BASE_URL = "https://opencode.ai/inference/go/v1";
export const OPENCODE_MODEL = "deepseek-v4.1-flash";
export const USER_AGENT = "CatchNoBall/1.0";
export const INTERPRET_TIMEOUT_MS = 20000;

export class InterpretError extends Error {
  constructor(message) {
    super(message);
    this.name = "InterpretError";
  }
}

const isStr = (v) => typeof v === "string" && v.trim() !== "";

function plainSentence(said) {
  return { said, hasSinglish: false, meaning: "", tone: "neutral", confident: true, readings: [], terms: [] };
}

function parseSentence(s, requireReadings) {
  if (!s || typeof s !== "object" || !isStr(s.said) || typeof s.hasSinglish !== "boolean") {
    throw new InterpretError("sentence needs said and hasSinglish");
  }
  if (!s.hasSinglish) return plainSentence(s.said);

  if (!isStr(s.meaning)) throw new InterpretError("meaning must be a non-empty string");
  if (!TONES.includes(s.tone)) throw new InterpretError(`tone must be one of ${TONES.join(", ")}`);
  if (typeof s.confident !== "boolean") throw new InterpretError("confident must be a boolean");

  const rawReadings = s.readings ?? [];
  if (!Array.isArray(rawReadings)) throw new InterpretError("readings must be an array");
  const readings = rawReadings.slice(0, 2).map((r) => {
    if (!r || !isStr(r.meaning) || !TONES.includes(r.tone)) throw new InterpretError("bad reading");
    return { meaning: r.meaning, tone: r.tone };
  });

  const rawTerms = s.terms ?? [];
  if (!Array.isArray(rawTerms)) throw new InterpretError("terms must be an array");
  const terms = rawTerms.map((t) => {
    if (!t || !isStr(t.term) || typeof t.gloss !== "string") throw new InterpretError("bad term");
    if (t.known !== undefined && typeof t.known !== "boolean") throw new InterpretError("bad term.known");
    return { term: t.term, gloss: t.gloss, known: t.known ?? true };
  });

  if (requireReadings && !s.confident && readings.length !== 2) {
    throw new InterpretError("an unsure sentence needs exactly 2 readings");
  }

  return {
    said: s.said,
    hasSinglish: true,
    meaning: s.meaning,
    tone: s.tone,
    confident: s.confident,
    readings: s.confident ? [] : readings,
    terms,
  };
}

export function parseInterpretation(raw, { requireReadings = false } = {}) {
  if (typeof raw !== "string") throw new InterpretError("reply is not text");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new InterpretError("no JSON object in reply");
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new InterpretError("reply is not valid JSON");
  }
  if (!data || !Array.isArray(data.sentences) || data.sentences.length === 0) {
    throw new InterpretError("sentences must be a non-empty array");
  }
  return { sentences: data.sentences.map((s) => parseSentence(s, requireReadings)) };
}

const TOKEN = /[\p{L}\p{N}']+/gu;
const foldApostrophes = (s) => s.replace(/[‘’]/g, "'");

function tokenise(text) {
  const folded = foldApostrophes(text);
  const tokens = [];
  for (const m of folded.matchAll(TOKEN)) {
    const lead = m[0].length - m[0].replace(/^'+/, "").length;
    const word = m[0].replace(/^'+|'+$/g, "");
    if (!word) continue;
    const start = m.index + lead;
    tokens.push({ word: word.toLowerCase(), start, end: start + word.length });
  }
  return tokens;
}

export function verbatimSpan(transcript, said) {
  const wanted = tokenise(said);
  if (wanted.length === 0) return null;
  const have = tokenise(transcript);
  for (let i = 0; i + wanted.length <= have.length; i++) {
    if (wanted.every((w, j) => have[i + j].word === w.word)) {
      let end = have[i + wanted.length - 1].end;
      while (end < transcript.length && !/\s/.test(transcript[end])) end++;
      return transcript.slice(have[i].start, end);
    }
  }
  return null;
}

// The M2 guard: the card never shows words that were not in the transcript.
export function enforceVerbatim(transcript, sentences) {
  if (!sentences.some((s) => s.hasSinglish)) return [plainSentence(transcript.trim())];
  const out = [];
  for (const s of sentences) {
    const span = verbatimSpan(transcript, s.said);
    if (span) out.push({ ...s, said: span });
    else if (s.hasSinglish) out.push(s);
    // a plain sentence that was reworded is dropped
  }
  return out;
}

export async function interpret({ transcript, context, sessionId }, env, fetchImpl = fetch) {
  const clean = Array.isArray(context) ? context.filter((c) => typeof c === "string") : [];
  const messages = buildMessages({ transcript, context: clean.slice(-1) });
  let res;
  try {
    res = await fetchImpl(`${OPENCODE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENCODE_API_KEY}`,
        "x-opencode-session": sessionId,
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify({ model: OPENCODE_MODEL, messages, temperature: 0.2 }),
      signal: AbortSignal.timeout(INTERPRET_TIMEOUT_MS),
    });
  } catch (e) {
    throw new InterpretError(`request failed: ${e.message}`);
  }
  if (!res.ok) throw new InterpretError(`OpenCode Go returned ${res.status}`);

  let content;
  try {
    content = (await res.json()).choices?.[0]?.message?.content;
  } catch {
    throw new InterpretError("reply body is not JSON");
  }
  const { sentences } = parseInterpretation(content);
  return { sentences: enforceVerbatim(transcript, sentences), passes: 1 };
}
