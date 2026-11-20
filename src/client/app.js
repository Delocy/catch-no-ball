// DOM glue only. Every decision (what card to show, what context a line carries, whether a
// clip is sent, what a mic error means) lives in a tested module: cards.js, session.js,
// queue.js, api.js, wav.js, clipper.js, mic.js.
import { createApi } from "./api.js";
import { createClipQueue } from "./queue.js";
import { contextAfter, withContext } from "./session.js";
import { cardHtml, renderResult, shouldAutoScroll, fixItem } from "./cards.js";
import { clipToSend } from "./wav.js";
import { createClipper } from "./clipper.js";
import { canRecord, micErrorKind, micErrorCopy } from "./mic.js";
import { COPY } from "./copy.js";

const api = createApi({ fetchImpl: (...a) => fetch(...a) });
const cardsEl = document.getElementById("cards");
const form = document.getElementById("typed");
const input = document.getElementById("text");
const listenBtn = document.getElementById("listen");
const banner = document.getElementById("banner");
const micHelp = document.getElementById("mic-help");

let sessionId = crypto.randomUUID(); // a new one per Listen
let context = []; // last few lines, copied into each item when it is created
const retryable = new Map(); // card id -> the original item, for "tap to retry"
let nextId = 1;
let rec = null; // the live recording, or null

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
  send: (item) =>
    item.kind === "clip"
      ? api.sendClip({ wav: item.wav, sessionId: item.sessionId, context: item.context })
      : api.sendText({ text: item.text, sessionId: item.sessionId, context: item.context }),
  onResult(item, result, error) {
    const out = renderResult(item, result, error);
    insert(out.html, item.cardId);
    context = contextAfter(context, error ? undefined : result, { retry: item.retry });
    if (out.retryable) retryable.set(item.cardId, item);
    else retryable.delete(item.cardId);
  },
});

// item already carries its context (withContext); replaceId puts it in place of an old card.
function enqueue(item, replaceId) {
  const cardId = replaceId || `card-${nextId++}`;
  insert(cardHtml({ kind: "pending", text: item.text || "" }, cardId), replaceId);
  queue.push({ sessionId, ...item, cardId });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const item = fixItem(null, input.value);
  if (!item) return;
  input.value = "";
  enqueue(withContext({ kind: "text", text: item.text }, context));
});

cardsEl.addEventListener("click", (e) => {
  const card = e.target.closest(".card.unavailable");
  if (!card || !retryable.has(card.id)) return;
  const original = retryable.get(card.id);
  retryable.delete(card.id);
  enqueue({ ...original, retry: true }, card.id); // same context as the first try (M6)
});

cardsEl.addEventListener("submit", (e) => {
  const fix = e.target.closest("form.fix");
  if (!fix) return;
  e.preventDefault();
  const item = fixItem(fix.dataset.cardId, fix.elements.text.value);
  if (item) enqueue(withContext(item, context), item.replaces);
});

function showHelp(text) {
  micHelp.textContent = text;
  micHelp.hidden = false;
  input.focus();
}

function setListening(on) {
  banner.hidden = !on;
  listenBtn.textContent = on ? "Stop" : "Listen";
  listenBtn.setAttribute("aria-pressed", String(on));
}

function onClip(samples, rate) {
  const wav = clipToSend(samples, rate);
  if (wav) enqueue(withContext({ kind: "clip", wav }, context));
}

async function start() {
  micHelp.hidden = true;
  if (!canRecord()) return showHelp(COPY.cantListen);
  // Created and resumed inside the tap, before any await, so Safari lets it run.
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const resumed = ctx.resume();
  listenBtn.disabled = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    await resumed;
    await ctx.audioWorklet.addModule("/client/recorder-worklet.js");
  } catch (e) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    listenBtn.disabled = false;
    return showHelp(micErrorCopy(micErrorKind(e)));
  }
  const rate = ctx.sampleRate;
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture");
  const mute = ctx.createGain(); // keeps the graph pulling frames without playing the mic back
  mute.gain.value = 0;
  const clipper = createClipper({ inputRate: rate, onClip: (s) => onClip(s, rate) });
  node.port.onmessage = (e) => clipper.push(e.data);
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  stream.getTracks().forEach((t) => t.addEventListener("ended", stop));

  sessionId = crypto.randomUUID();
  rec = { ctx, stream, source, node, clipper, wakeLock: null };
  listenBtn.disabled = false;
  setListening(true);

  // Best effort: iOS stops audio when the screen locks.
  if (navigator.wakeLock) {
    const r = rec;
    navigator.wakeLock.request("screen").then((lock) => {
      if (rec === r) r.wakeLock = lock;
      else lock.release();
    }, () => {});
  }
}

function stop() {
  if (!rec) return;
  const r = rec;
  rec = null;
  r.node.port.onmessage = null;
  r.clipper.flush(); // the partial clip is sent if it is long enough and not silent
  r.stream.getTracks().forEach((t) => t.stop());
  r.source.disconnect();
  r.node.disconnect();
  r.ctx.close();
  if (r.wakeLock) r.wakeLock.release().catch(() => {});
  setListening(false);
}

listenBtn.addEventListener("click", () => (rec ? stop() : start()));
