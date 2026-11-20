// Cuts the live PCM stream into fixed clips. Frames are split across clip boundaries.
export const CLIP_SECONDS = 15;

export function createClipper({ inputRate, clipSeconds = CLIP_SECONDS, onClip }) {
  const size = Math.round(inputRate * clipSeconds);
  let buf = new Float32Array(size);
  let filled = 0;

  return {
    push(frame) {
      let i = 0;
      while (i < frame.length) {
        const n = Math.min(size - filled, frame.length - i);
        buf.set(frame.subarray(i, i + n), filled);
        filled += n;
        i += n;
        if (filled === size) {
          onClip(buf);
          buf = new Float32Array(size);
          filled = 0;
        }
      }
    },
    flush() {
      if (filled === 0) return;
      const rest = buf.slice(0, filled);
      buf = new Float32Array(size);
      filled = 0;
      onClip(rest);
    },
  };
}
