// DOM glue only. Every decision (what card to show, when to scroll, what an error means)
// lives in a tested module: cards.js, queue.js, api.js.
import { createApi } from "./api.js";
import { createClipQueue } from "./queue.js";
import { toCardModels, cardHtml, shouldAutoScroll } from "./cards.js";

const api = createApi({ fetchImpl: (...a) => fetch(...a) });
const sessionId = crypto.randomUUID();
const cardsEl = document.getElementById("cards");
const form = document.getElementById("typed");
const input = document.getElementById("text");
const texts = new Map(); // card id -> typed text, for retry
let nextId = 1;

function insert(html, replaceId) {
  const scroller = document.scrollingElement;
  const follow = shouldAutoScroll(scroller);
  const old = replaceId && document.getElementById(replaceId);
  if (old) {
    old.insertAdjacentHTML("beforebegin", html);
    old.remove();
  } else {
    cardsEl.insertAdjacentHTML("beforeend", html);
  }
  if (follow) scroller.scrollTop = scroller.scrollHeight;
}

const queue = createClipQueue({
  send: (item) => api.sendText({ text: item.text, sessionId, context: [] }),
  onResult(item, result, error) {
    const models = error
      ? toCardModels({ status: "meaning_unavailable", transcript: item.text })
      : toCardModels(result);
    const html = models.map((m, i) => cardHtml(m, i === 0 ? item.cardId : `${item.cardId}-${i}`)).join("");
    insert(html, item.cardId);
    for (const m of models) if (m.kind === "unavailable") texts.set(item.cardId, item.text);
  },
});

function submit(text, replaceId) {
  const cardId = replaceId || `card-${nextId++}`;
  texts.set(cardId, text);
  insert(cardHtml({ kind: "pending", text }, cardId), replaceId);
  queue.push({ kind: "text", text, cardId, replaces: replaceId });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  submit(text);
});

cardsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".retry");
  if (!btn) return;
  const id = btn.dataset.cardId;
  if (texts.has(id)) submit(texts.get(id), id);
});
