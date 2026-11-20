// DOM glue only. Every decision (what card to show, when to scroll, what an error means)
// lives in a tested module: cards.js, queue.js, api.js.
import { createApi } from "./api.js";
import { createClipQueue } from "./queue.js";
import { cardHtml, renderResult, shouldAutoScroll } from "./cards.js";

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
    const { html, retryable } = renderResult(item, result, error);
    insert(html, item.cardId);
    if (!retryable) texts.delete(item.cardId);
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
  const card = e.target.closest(".card.unavailable");
  if (!card) return;
  const id = card.dataset.cardId;
  if (texts.has(id)) submit(texts.get(id), id);
});
