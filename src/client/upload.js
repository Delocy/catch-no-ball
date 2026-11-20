// Upload audio (US-16): pure helpers. The page decodes the file; everything else is decided here.
import { CLIP_SECONDS } from "./clipper.js";
import { resampleTo16k, clipToSend } from "./wav.js";
import { COPY } from "./copy.js";

export const UPLOAD_MAX_SECONDS = 120;
export const UPLOAD_MAX_BYTES = 41943040; // 40 MiB
export const UPLOAD_MAX_COMPRESSED_BYTES = 6291456; // 6 MiB for m4a/mp3: bounds decode memory
export const UPLOAD_PADDING_SECONDS = 0.5; // decoders pad a little; a tail under 0.5 s is never sent
export const UPLOAD_GAP_MS = 13000;
export const UPLOAD_ACCEPT = "audio/*,.m4a,.mp3,.wav";
export const UPLOAD_EXTENSIONS = ["m4a", "mp3", "wav"];

export function checkUpload({ name, type, size }) {
  const n = String(name || "").toLowerCase();
  const t = String(type || "");
  const ext = n.includes(".") ? n.split(".").pop() : "";
  if (!(t.startsWith("audio/") || UPLOAD_EXTENSIONS.includes(ext))) {
    return { ok: false, reason: "not_audio", copy: COPY.uploadUnreadable };
  }
  const isWav = ext === "wav" || /wav/.test(t);
  if (size > (isWav ? UPLOAD_MAX_BYTES : UPLOAD_MAX_COMPRESSED_BYTES)) {
    return { ok: false, reason: "too_big", copy: COPY.uploadTooLong };
  }
  return { ok: true };
}

export function checkDuration(seconds) {
  return seconds >= UPLOAD_MAX_SECONDS + UPLOAD_PADDING_SECONDS
    ? { ok: false, reason: "too_long", copy: COPY.uploadTooLong }
    : { ok: true };
}

// Metadata duration probed before decoding. Unknown (NaN, Infinity, 0) means: decode and check then.
export function durationVerdict(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? checkDuration(seconds) : { ok: true };
}

export function downmix(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i];
  for (let i = 0; i < out.length; i++) out[i] /= channels.length;
  return out;
}

export function splitIntoClips(samples, sampleRate, clipSeconds = CLIP_SECONDS) {
  const size = Math.round(sampleRate * clipSeconds);
  const clips = [];
  for (let i = 0; i < samples.length; i += size) clips.push(samples.subarray(i, Math.min(i + size, samples.length)));
  return clips;
}

export function prepareUpload({ channels, sampleRate }) {
  const dur = checkDuration(channels[0].length / sampleRate);
  if (!dur.ok) return dur;
  const samples16k = resampleTo16k(downmix(channels), sampleRate);
  const wavs = splitIntoClips(samples16k, 16000).map((c) => clipToSend(c, 16000)).filter(Boolean);
  if (wavs.length === 0) return { ok: false, reason: "silent", copy: COPY.uploadSilent };
  return { ok: true, wavs, seconds: wavs.reduce((s, w) => s + (w.length - 44) / 32000, 0) };
}

export const estimateMinutes = (seconds) => Math.ceil(seconds / 60);

export const minutesLeft = (budget) => Math.floor(Math.max(0, budget.limits.seconds - budget.used.seconds) / 60);

export function budgetOut(budget) {
  return (
    budget.limits.seconds - budget.used.seconds <= 0 ||
    budget.used.requests >= budget.limits.requests ||
    budget.used.tokens >= budget.limits.tokens
  );
}

export function formatCopy(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function planConfirm(seconds, budget) {
  const n = estimateMinutes(seconds);
  if (!budget) return { kind: "confirm", text: formatCopy(COPY.uploadConfirmNoBudget, { n }) };
  if (budgetOut(budget)) return { kind: "budget_out", text: COPY.uploadBudgetOut };
  return { kind: "confirm", text: formatCopy(COPY.uploadConfirm, { n, m: minutesLeft(budget) }) };
}

export const uploadItems = (wavs, uploadId) =>
  wavs.map((wav, i) => ({ kind: "clip", wav, uploadId, index: i + 1, total: wavs.length }));

// Pacing: a clip of an upload waits until 13 s after the last clip of that upload was sent, however
// many typed lines went in between. After a cached result no MERaLiON call was made, so no wait.
export function createUploadPacer(now = () => Date.now()) {
  let last = null; // { uploadId, at, cached }
  return {
    sent(item) {
      if (item.kind === "clip" && item.uploadId) last = { uploadId: item.uploadId, at: now(), cached: false };
    },
    done(item, result) {
      if (last && item.uploadId === last.uploadId && result?.cached === true) last.cached = true;
    },
    gap(next) {
      if (!last || next.kind !== "clip" || next.uploadId !== last.uploadId || last.cached) return 0;
      return Math.max(0, UPLOAD_GAP_MS - (now() - last.at));
    },
  };
}

export const progressText = (index, total) => formatCopy(COPY.uploadSending, { i: index, n: total });

export function buttonsFor(mode) {
  const uploadLabel = mode === "sending" ? COPY.uploadCancel : COPY.uploadButton;
  return {
    listenDisabled: mode === "decoding" || mode === "confirming" || mode === "sending",
    uploadDisabled: mode !== "idle" && mode !== "sending",
    uploadLabel,
  };
}
