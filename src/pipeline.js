import { json } from "./http.js";
import { interpret } from "./interpret.js";
import { cleanContext } from "./prompt.js";

export const MAX_TEXT_CHARS = 1000;
// Header-safe: the id is sent as the x-opencode-session header.
const SESSION_ID = /^[A-Za-z0-9_-]{1,100}$/;

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
    typeof body.sessionId === "string" && SESSION_ID.test(body.sessionId)
      ? body.sessionId
      : crypto.randomUUID();
  const context = cleanContext(body.context);

  try {
    const { sentences, passes } = await deps.interpret({ transcript, context, sessionId }, env);
    return json({ status: "ok", source: "text", transcript, sentences, passes, cached: false, hint: null });
  } catch (e) {
    console.error(`interpret failed: ${e && e.message}`);
    return json({ status: "meaning_unavailable", source: "text", transcript, sentences: [], passes: 1, cached: false, hint: null });
  }
}
