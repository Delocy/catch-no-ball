import { json } from "./http.js";
import { interpret } from "./interpret.js";

export const MAX_TEXT_CHARS = 1000;
const MAX_SESSION_CHARS = 100;

const badText = () => json({ error: "bad_text" }, 400);

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

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0 && body.sessionId.length <= MAX_SESSION_CHARS
      ? body.sessionId
      : crypto.randomUUID();
  const context = Array.isArray(body.context) ? body.context.filter((c) => typeof c === "string") : [];

  try {
    const { sentences, passes } = await deps.interpret({ transcript, context, sessionId }, env);
    return json({ status: "ok", source: "text", transcript, sentences, passes, cached: false });
  } catch (e) {
    console.error(`interpret failed: ${e && e.message}`);
    return json({ status: "meaning_unavailable", source: "text", transcript, sentences: [], passes: 1, cached: false });
  }
}
