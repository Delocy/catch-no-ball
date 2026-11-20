export const TONES = ["firm", "reluctant", "doubtful", "joking", "casual", "neutral"];
export const SETTING = "Office meeting";
export const CONTEXT_KEEP = 3;
export const MAX_CONTEXT_CHARS = 1000;

// The one place context is cleaned: strings only, last CONTEXT_KEEP, each capped.
export function cleanContext(context) {
  if (!Array.isArray(context)) return [];
  return context
    .filter((c) => typeof c === "string" && c.trim())
    .slice(-CONTEXT_KEEP)
    .map((c) => c.slice(0, MAX_CONTEXT_CHARS));
}

const SYSTEM = `You help a newcomer to Singapore understand Singlish. The setting is: ${SETTING}. The listener is a newcomer at a Singapore office. In this setting, "confirm" means "definitely".

You get a transcript of what was just said, and sometimes earlier sentences for context. Reply with JSON only, no prose and no code fence, in exactly this shape:
{ "sentences": [ { "said": string, "hasSinglish": boolean, "meaning": string, "tone": string, "confident": boolean, "readings": [ { "meaning": string, "tone": string } ], "terms": [ { "term": string, "gloss": string, "known": boolean } ] } ] }

Rules:
- Split the transcript into sentences. Copy each "said" verbatim from the transcript: the exact words, in the same order, never corrected or paraphrased.
- If a sentence is plain English with no Singlish, set hasSinglish to false. Never reword it, and leave meaning, tone and terms empty (meaning "", tone "neutral", terms []).
- For a Singlish sentence, set hasSinglish to true. Keep "meaning" to one short plain-English sentence.
- "tone" must be exactly one of: ${TONES.join(", ")}.
- "terms" lists the Singlish words and particles in the sentence (lah, lor, meh, one, confirm and so on), each with a short gloss. Set known: false for a term you do not recognise.
- If particles seem missing, infer tone from wording and context. Never guess confidently. Use confident:false.
- When confident is true, "readings" is []. When confident is false, give exactly 2 plausible readings, each with its own meaning and tone.`;

export function buildMessages({ transcript, context = [], retry = false } = {}) {
  const lines = cleanContext(context).map((c) => `Earlier: ${c}`);
  lines.push(`Transcript: ${transcript}`);
  let system = SYSTEM;
  if (retry) {
    system += "\n- Reconsider with the extra context. If still unsure, set confident false and give exactly two readings.";
  }
  return [
    { role: "system", content: system },
    { role: "user", content: lines.join("\n") },
  ];
}
