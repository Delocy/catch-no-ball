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
  if (result.status === "uncaught") return [{ kind: "uncaught" }];
  if (result.status !== "ok" || !Array.isArray(result.sentences)) return [];
  return result.sentences.map(sentenceModel);
}

// An unsure Singlish sentence is never shown as one guess: it shows both readings, or (if the
// server sent anything else) the "meaning unavailable" card.
function sentenceModel(s) {
  if (!s.hasSinglish) return { kind: "plain", text: s.said };
  const termsHtml = markTerms(s.said, s.terms);
  if (s.confident === false) {
    const r = Array.isArray(s.readings) ? s.readings : [];
    if (r.length !== 2) return { kind: "unavailable", transcript: s.said };
    return { kind: "unsure", said: s.said, termsHtml, readings: r.map(({ meaning, tone }) => ({ meaning, tone })) };
  }
  return { kind: "singlish", said: s.said, termsHtml, meaning: s.meaning, tone: s.tone };
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
    case "unsure": {
      const reading = ({ meaning, tone }) =>
        `<p class="reading"><span class="meaning">${escapeHtml(meaning)}</span> ` +
        `<span class="chip tone-${toneClass(tone)}">${escapeHtml(tone)}</span></p>`;
      return (
        `<article class="card unsure" id="${cid}">` +
        `<p class="said">${model.termsHtml}</p>` +
        `<p class="could-mean">${escapeHtml(COPY.couldMean)}</p>` +
        reading(model.readings[0]) +
        `<p class="or">${escapeHtml(COPY.or)}</p>` +
        reading(model.readings[1]) +
        `</article>`
      );
    }
    case "plain":
      return `<article class="card plain" id="${cid}"><p class="said">${escapeHtml(model.text)}</p></article>`;
    case "unavailable":
      return (
        `<article class="card unavailable" id="${cid}" data-card-id="${cid}">` +
        (model.transcript ? `<p class="said">${escapeHtml(model.transcript)}</p>` : "") +
        `<button type="button" class="retry" data-card-id="${cid}">${escapeHtml(COPY.unavailable)}</button>` +
        `</article>`
      );
    case "uncaught":
      return (
        `<article class="card uncaught" id="${cid}">` +
        `<p class="said">${escapeHtml(COPY.uncaught)}</p>` +
        `<form class="fix" data-card-id="${cid}" autocomplete="off">` +
        `<input type="text" name="text" maxlength="1000" placeholder="Type what you heard" aria-label="Type what you heard" enterkeyhint="send">` +
        `<button type="submit">Send</button>` +
        `</form>` +
        `</article>`
      );
    case "pending":
      return (
        `<article class="card pending" id="${cid}">` +
        (model.text ? `<p class="said">${escapeHtml(model.text)}</p>` : "") +
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

// What to show when a queued item finishes. An API error becomes the "meaning unavailable"
// card for the typed text (a clip has no words yet, so its card shows only the retry). Ids: the first card replaces the pending card, others are id-1, id-2.
export function renderResult(item, result, error) {
  const models = error
    ? toCardModels({ status: "meaning_unavailable", transcript: item.text ?? "" })
    : toCardModels(result);
  return {
    html: models.map((m, i) => cardHtml(m, i === 0 ? item.cardId : `${item.cardId}-${i}`)).join(""),
    retryable: models.some((m) => m.kind === "unavailable"),
  };
}

// A typed fix for a "Couldn't catch that" card: a text item that replaces that card.
export function fixItem(cardId, value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? { kind: "text", text, replaces: cardId } : null;
}
