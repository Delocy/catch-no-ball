// Phone-side audio: resample to 16 kHz, encode PCM16 mono WAV, detect silence. Pure.
export const SILENCE_RMS = 0.01;
const TARGET = 16000;

export function resampleTo16k(samples, fromRate) {
  if (fromRate === TARGET) return samples;
  const outLen = Math.round((samples.length * TARGET) / fromRate);
  const out = new Float32Array(outLen);
  const ratio = fromRate / TARGET;
  if (Number.isInteger(ratio)) {
    // Block average: also a cheap low-pass filter.
    for (let i = 0; i < outLen; i++) {
      let sum = 0;
      let n = 0;
      for (let j = i * ratio; j < (i + 1) * ratio && j < samples.length; j++, n++) sum += samples[j];
      out[i] = n ? sum / n : 0;
    }
    return out;
  }
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const a = Math.floor(pos);
    const b = Math.min(a + 1, samples.length - 1);
    const t = pos - a;
    out[i] = samples[a] * (1 - t) + samples[b] * t;
  }
  return out;
}

export function encodeWav(samples16k) {
  const dataSize = samples16k.length * 2;
  const out = new Uint8Array(44 + dataSize);
  const v = new DataView(out.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, TARGET, true);
  v.setUint32(28, TARGET * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);
  for (let i = 0; i < samples16k.length; i++) {
    const s = Math.max(-1, Math.min(1, samples16k[i]));
    v.setInt16(44 + i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return out;
}

export function rms(samples) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function isSilent(samples, threshold = SILENCE_RMS) {
  return rms(samples) < threshold;
}
