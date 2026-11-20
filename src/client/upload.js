// Upload audio (US-16): pure helpers. The page decodes the file; everything else is decided here.
import { CLIP_SECONDS } from "./clipper.js";
import { resampleTo16k, clipToSend } from "./wav.js";
import { COPY } from "./copy.js";

export const UPLOAD_MAX_SECONDS = 120;
export const UPLOAD_MAX_BYTES = 41943040; // 40 MiB
export const UPLOAD_GAP_MS = 13000;
export const UPLOAD_ACCEPT = "audio/*,.m4a,.mp3,.wav";
export const UPLOAD_EXTENSIONS = ["m4a", "mp3", "wav"];

export function checkUpload({ name, type, size }) {
  if (size > UPLOAD_MAX_BYTES) return { ok: false, reason: "too_big", copy: COPY.uploadTooLong };
  const ext = String(name || "").toLowerCase().split(".").pop();
  const isAudio = String(type || "").startsWith("audio/") || (String(name || "").includes(".") && UPLOAD_EXTENSIONS.includes(ext));
  return isAudio ? { ok: true } : { ok: false, reason: "not_audio", copy: COPY.uploadUnreadable };
}

export function checkDuration(seconds) {
  return seconds > UPLOAD_MAX_SECONDS ? { ok: false, reason: "too_long", copy: COPY.uploadTooLong } : { ok: true };
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

// Pacing between two clips of one upload; none after a cached result (no MERaLiON call was made).
export function uploadGap(next, prev, prevResult) {
  const same = next && prev && next.kind === "clip" && prev.kind === "clip" && next.uploadId && next.uploadId === prev.uploadId;
  return same && prevResult?.cached !== true ? UPLOAD_GAP_MS : 0;
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
