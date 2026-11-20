// What the browser can do, and what a microphone error means for the user.
import { COPY } from "./copy.js";

export function canRecord(g = globalThis) {
  return Boolean(
    typeof g.navigator?.mediaDevices?.getUserMedia === "function" &&
      (g.AudioContext || g.webkitAudioContext) &&
      g.AudioWorkletNode,
  );
}

export function micErrorKind(err) {
  const name = err && typeof err === "object" ? err.name : undefined;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_mic";
  return "other";
}

export function micErrorCopy(kind) {
  return kind === "denied" ? COPY.micBlocked : COPY.cantListen;
}
