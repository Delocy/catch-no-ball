// The running context sent with the next line: every sentence's `said` (plain ones too),
// last `keep` only. Pure; never mutates `prev`.
export const CONTEXT_KEEP = 3; // same value as CONTEXT_KEEP in prompt.js (a test pins them)

export function nextContext(prev, sentences, keep = CONTEXT_KEEP) {
  const said = (Array.isArray(sentences) ? sentences : []).map((s) => s.said);
  return [...(Array.isArray(prev) ? prev : []), ...said].slice(-keep);
}

// The context after a result (M5): a failed line's words count too. A retry's line already
// entered the context when it first failed, so a retry never appends again (M6).
export function contextAfter(prev, result, { retry = false, keep = CONTEXT_KEEP } = {}) {
  const base = Array.isArray(prev) ? prev : [];
  if (retry || !result) return base;
  if (result.status === "ok") return nextContext(base, result.sentences, keep);
  if (result.status === "meaning_unavailable") {
    const t = typeof result.transcript === "string" ? result.transcript.trim() : "";
    return t ? [...base, t].slice(-keep) : base;
  }
  return base; // silent, uncaught
}

// Each queued item carries the context it was created with (M6).
export function withContext(item, context) {
  return { ...item, context: Array.isArray(context) ? [...context] : [] };
}

// The context a queued item is sent with (review I3). A first try reads the live context when it
// is sent, so it sees every earlier line (the queue sends one at a time, after the previous
// result). A retry re-sends the context its first try had (M6).
export function sendContext(item, live) {
  if (item && item.retry && Array.isArray(item.context)) return [...item.context];
  return Array.isArray(live) ? [...live] : [];
}

// Whether a failed first try already put its line in the context (m1): only a
// meaning_unavailable result with words did. A retry of anything else appends when it succeeds.
export function enteredContext(result, error) {
  return Boolean(!error && result && result.status === "meaning_unavailable" &&
    typeof result.transcript === "string" && result.transcript.trim());
}

// The item to re-push when "tap to retry" is tapped: same first context (retry), and whether
// its result should be kept out of the context because the line is already there (inContext).
export function retryOf(item, result, error) {
  return { ...item, retry: true, inContext: Boolean(item.inContext) || enteredContext(result, error) };
}
