// The running context sent with the next line: every sentence's `said` (plain ones too),
// last `keep` only. Pure; never mutates `prev`.
export const CONTEXT_KEEP = 3; // same value as CONTEXT_KEEP in prompt.js (a test pins them)

export function nextContext(prev, sentences, keep = CONTEXT_KEEP) {
  const said = (Array.isArray(sentences) ? sentences : []).map((s) => s.said);
  return [...(Array.isArray(prev) ? prev : []), ...said].slice(-keep);
}
