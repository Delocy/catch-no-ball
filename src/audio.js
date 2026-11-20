// WAV header parsing and byte helpers for the Worker. Pure; no IO.
export const MIN_CLIP_SECONDS = 0.5;
export const MAX_CLIP_SECONDS = 30;
export const REQUIRED_SAMPLE_RATE = 16000;

const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

// Reads the RIFF/WAVE header, walking chunks to `fmt ` and `data` (LIST and others are skipped).
export function wavInfo(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || tag(bytes, 0) !== "RIFF" || tag(bytes, 8) !== "WAVE") {
    throw new Error("not_wav");
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt = null;
  let dataSize = null;
  let o = 12;
  while (o + 8 <= bytes.length) {
    const id = tag(bytes, o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt " && o + 8 + 16 <= bytes.length) {
      fmt = {
        format: v.getUint16(o + 8, true),
        channels: v.getUint16(o + 10, true),
        sampleRate: v.getUint32(o + 12, true),
        byteRate: v.getUint32(o + 16, true),
        bitsPerSample: v.getUint16(o + 22, true),
      };
    } else if (id === "data") {
      dataSize = Math.min(size, bytes.length - o - 8);
      break;
    }
    o += 8 + size + (size % 2);
  }
  if (!fmt || dataSize === null || fmt.format !== 1 || !fmt.byteRate) throw new Error("not_wav");
  const { sampleRate, channels, bitsPerSample, byteRate } = fmt;
  return { sampleRate, channels, bitsPerSample, seconds: dataSize / byteRate };
}

export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// btoa over 32 KB chunks: fast, and avoids call-stack limits on long arrays.
export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
