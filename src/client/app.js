// DOM glue only. Every decision (what card to show, what context a line carries, whether a
// clip is sent, what a mic error means) lives in a tested module: cards.js, session.js,
// queue.js, api.js, wav.js, clipper.js, mic.js.
import { createApi } from "./api.js";
import { createClipQueue } from "./queue.js";
import { contextAfter, sendContext, retryOf } from "./session.js";
import { cardHtml, renderResult, shouldAutoScroll, fixItem } from "./cards.js";
import { clipToSend } from "./wav.js";
import { createClipper } from "./clipper.js";
import { canRecord, micErrorKind, micErrorCopy } from "./mic.js";
import { COPY } from "./copy.js";
import {
  checkUpload, prepareUpload, planConfirm, uploadItems, createUploadPacer, durationVerdict,
  progressText, buttonsFor,
} from "./upload.js";

const api = createApi({ fetchImpl: (...a) => fetch(...a) });
const cardsEl = document.getElementById("cards");
const form = document.getElementById("typed");
const input = document.getElementById("text");
const listenBtn = document.getElementById("listen");
const banner = document.getElementById("banner");
const micHelp = document.getElementById("mic-help");
const uploadBtn = document.getElementById("upload");
const uploadFile = document.getElementById("upload-file");
const uploadStatus = document.getElementById("upload-status");
const uploadConfirm = document.getElementById("upload-confirm");
const uploadConfirmText = document.getElementById("upload-confirm-text");
const uploadSend = document.getElementById("upload-send");
const uploadDismiss = document.getElementById("upload-dismiss");
uploadSend.textContent = COPY.uploadSend;
uploadDismiss.textContent = COPY.uploadDismiss;
banner.querySelector(".translating-text").textContent = COPY.translating;
banner.querySelector(".tell").textContent = COPY.tellTable;

let sessionId = crypto.randomUUID(); // a new one per Listen
let context = []; // last few lines; a first try reads it when sent, a retry keeps its own
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

let mode = "idle"; // idle | listening | decoding | confirming | sending
let upload = null; // { id, wavs } while confirming, { id } while sending

function setMode(m) {
  mode = m;
  const b = buttonsFor(m);
  listenBtn.disabled = b.listenDisabled;
  uploadBtn.disabled = b.uploadDisabled;
  uploadBtn.textContent = b.uploadLabel;
}

function setStatus(text) {
  uploadStatus.textContent = text || "";
  uploadStatus.hidden = !text;
}

const pacer = createUploadPacer();
const queue = createClipQueue({
  gapMs: (next) => pacer.gap(next),
  send(item) {
    pacer.sent(item);
    item.context = sendContext(item, context); // kept on the item so a retry re-sends it (M6)
    return item.kind === "clip"
      ? api.sendClip({ wav: item.wav, sessionId: item.sessionId, context: item.context })
      : api.sendText({ text: item.text, sessionId: item.sessionId, context: item.context });
  },
  onResult(item, result, error) {
    pacer.done(item, result, error);
    try {
      const out = renderResult(item, result, error);
      insert(out.html, item.cardId);
      // inContext: this line already entered the context when its first try failed (M5, m1).
      context = contextAfter(context, error ? undefined : result, { retry: Boolean(item.inContext) });
      if (out.retryable) retryable.set(item.cardId, retryOf(item, result, error));
      else retryable.delete(item.cardId);
    } finally {
      if (item.uploadId && upload && upload.id === item.uploadId) {
        if (item.index === item.total) {
          upload = null;
          setStatus("");
          setMode("idle");
        } else {
          setStatus(progressText(item.index + 1, item.total));
        }
      }
    }
  },
});

// replaceId puts the item's card in place of an old one.
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
  enqueue({ kind: "text", text: item.text });
});

cardsEl.addEventListener("click", (e) => {
  const card = e.target.closest(".card.unavailable");
  if (!card || !retryable.has(card.id)) return;
  const original = retryable.get(card.id); // carries its first context and whether to append
  retryable.delete(card.id);
  enqueue(original, card.id);
});

cardsEl.addEventListener("submit", (e) => {
  const fix = e.target.closest("form.fix");
  if (!fix) return;
  e.preventDefault();
  const item = fixItem(fix.dataset.cardId, fix.elements.text.value);
  if (item) enqueue(item, item.replaces);
});

function showHelp(text) {
  micHelp.textContent = text;
  micHelp.hidden = false;
  input.focus();
}

function setListening(on) {
  banner.hidden = !on;
  listenBtn.textContent = on ? "Stop" : "Listen";
  setMode(on ? "listening" : "idle");
  listenBtn.setAttribute("aria-pressed", String(on));
}

function onClip(samples, rate) {
  const wav = clipToSend(samples, rate);
  if (wav) enqueue({ kind: "clip", wav });
}

async function start() {
  micHelp.hidden = true;
  if (!canRecord()) return showHelp(COPY.cantListen);
  // Created and resumed inside the tap, before any await, so Safari lets it run.
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const resumed = ctx.resume();
  listenBtn.disabled = true;
  uploadBtn.disabled = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    await resumed;
    await ctx.audioWorklet.addModule("/client/recorder-worklet.js");
  } catch (e) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    setMode("idle");
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

// ---- Upload audio (US-16): decode here, every decision in upload.js ----
async function decodeFile(file) {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const channels = [];
    for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
    return { channels, sampleRate: audio.sampleRate };
  } finally {
    ctx.close();
  }
}

function backToIdle(text) {
  upload = null;
  uploadConfirm.hidden = true;
  setStatus(text);
  setMode("idle");
}

uploadBtn.addEventListener("click", () => {
  if (mode === "sending") return cancelUpload();
  uploadFile.value = "";
  uploadFile.click();
});

// Reads the duration from the file's metadata without decoding it; NaN when unknown.
function probeDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const finish = (d) => {
      clearTimeout(timer);
      el.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(d);
    };
    const timer = setTimeout(() => finish(NaN), 4000);
    el.preload = "metadata";
    el.onloadedmetadata = () => finish(el.duration);
    el.onerror = () => finish(NaN);
    el.src = url;
  });
}

uploadFile.addEventListener("change", async () => {
  try {
    const file = uploadFile.files && uploadFile.files[0];
    if (!file) return backToIdle("");
    const checked = checkUpload({ name: file.name, type: file.type, size: file.size });
    if (!checked.ok) return backToIdle(checked.copy);
    setMode("decoding");
    setStatus(COPY.uploadReading);
    const probed = durationVerdict(await probeDuration(file));
    if (!probed.ok) return backToIdle(probed.copy);
    let prepared;
    try {
      prepared = prepareUpload(await decodeFile(file));
    } catch (e) {
      return backToIdle(COPY.uploadUnreadable);
    }
    if (!prepared.ok) return backToIdle(prepared.copy);
    let budget = null;
    try {
      budget = await api.budget();
    } catch (e) {
      budget = null;
    }
    let plan;
    try {
      plan = planConfirm(prepared.seconds, budget);
    } catch (e) {
      plan = planConfirm(prepared.seconds, null); // an odd budget body: still guarded server-side
    }
    upload = { id: crypto.randomUUID(), wavs: prepared.wavs };
    uploadConfirmText.textContent = plan.text;
    uploadConfirm.hidden = false;
    setStatus("");
    setMode("confirming");
  } catch (e) {
    backToIdle(COPY.uploadUnreadable); // never leave both buttons disabled
  }
});

uploadDismiss.addEventListener("click", () => backToIdle(COPY.uploadCancelled));

uploadSend.addEventListener("click", () => {
  if (mode !== "confirming" || !upload) return;
  const items = uploadItems(upload.wavs, upload.id);
  upload = { id: upload.id };
  uploadConfirm.hidden = true;
  sessionId = crypto.randomUUID();
  setMode("sending");
  setStatus(progressText(1, items.length));
  for (const item of items) enqueue(item);
});

function cancelUpload() {
  if (!upload) return;
  const id = upload.id;
  for (const item of queue.drop((i) => i.uploadId === id)) {
    const el = document.getElementById(item.cardId);
    if (el) el.remove();
  }
  backToIdle(COPY.uploadCancelled);
}

setMode("idle");
