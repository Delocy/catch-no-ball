// The running context sent with the next line: every sentence's `said` (plain ones too),
// last `keep` only. Pure; never mutates `prev`.
export function nextContext(prev, sentences, keep = 3) {
  const said = (Array.isArray(sentences) ? sentences : []).map((s) => s.said);
  return [...(Array.isArray(prev) ? prev : []), ...said].slice(-keep);
}
