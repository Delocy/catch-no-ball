// Builds a PCM16 WAV in memory for tests. Outside the test glob.
// fill: a number (every sample, in [-1, 1]) or a function (i, sampleRate) => sample.
export function makeWav(seconds, { sampleRate = 16000, channels = 1, fill = 0 } = {}) {
  const frames = Math.round(seconds * sampleRate);
  const dataSize = frames * channels * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);
  const sample = typeof fill === "function" ? fill : () => fill;
  for (let i = 0; i < frames; i++) {
    const s = Math.max(-1, Math.min(1, sample(i, sampleRate)));
    const int = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
    for (let c = 0; c < channels; c++) v.setInt16(44 + (i * channels + c) * 2, int, true);
  }
  return new Uint8Array(buf);
}
