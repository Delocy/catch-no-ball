import { COPY } from "./copy.js";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Escaped HTML with <u class="term"> around each whole-word term. Matches on the raw
// text first and escapes each segment afterwards, so no HTML is built before escaping.
export function markTerms(said, terms) {
  const usable = (Array.isArray(terms) ? terms : [])
    .filter((t) => t && typeof t.term === "string" && t.term.trim() !== "")
    .sort((a, b) => b.term.length - a.term.length);

  const taken = [];
  for (const { term } of usable) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
    for (const m of said.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (!taken.some((t) => start < t.end && end > t.start)) taken.push({ start, end, term });
    }
  }
  taken.sort((a, b) => a.start - b.start);

  let out = "";
  let pos = 0;
  for (const t of taken) {
    out += escapeHtml(said.slice(pos, t.start));
    out += `<u class="term" data-term="${escapeHtml(t.term)}">${escapeHtml(said.slice(t.start, t.end))}</u>`;
    pos = t.end;
  }
  return out + escapeHtml(said.slice(pos));
}

export function toCardModels(result) {
  if (!result) return [];
  if (result.status === "meaning_unavailable") return [{ kind: "unavailable", transcript: result.transcript }];
  if (result.status !== "ok" || !Array.isArray(result.sentences)) return [];
  return result.sentences.map((s) =>
    s.hasSinglish
      ? { kind: "singlish", said: s.said, termsHtml: markTerms(s.said, s.terms), meaning: s.meaning, tone: s.tone }
      : { kind: "plain", text: s.said },
  );
}

const toneClass = (tone) => String(tone).toLowerCase().replace(/[^a-z]/g, "");

export function cardHtml(model, id) {
  const cid = escapeHtml(id);
  switch (model.kind) {
    case "singlish":
      // termsHtml is already escaped by markTerms
      return (
        `<article class="card singlish" id="${cid}">` +
        `<p class="said">${model.termsHtml}</p>` +
        `<p class="meaning">${escapeHtml(model.meaning)}</p>` +
        `<span class="chip tone-${toneClass(model.tone)}">${escapeHtml(model.tone)}</span>` +
        `</article>`
      );
    case "plain":
      return `<article class="card plain" id="${cid}"><p class="said">${escapeHtml(model.text)}</p></article>`;
    case "unavailable":
      return (
        `<article class="card unavailable" id="${cid}" data-card-id="${cid}">` +
        `<p class="said">${escapeHtml(model.transcript)}</p>` +
        `<button type="button" class="retry" data-card-id="${cid}">${escapeHtml(COPY.unavailable)}</button>` +
        `</article>`
      );
    case "pending":
      return (
        `<article class="card pending" id="${cid}">` +
        `<p class="said">${escapeHtml(model.text)}</p>` +
        `<p class="status">${escapeHtml(COPY.translating)}…</p>` +
        `</article>`
      );
    default:
      return "";
  }
}

export function shouldAutoScroll({ scrollTop, clientHeight, scrollHeight }, slackPx = 48) {
  return scrollHeight - scrollTop - clientHeight <= slackPx;
}
