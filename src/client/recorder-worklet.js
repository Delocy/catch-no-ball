// Runs on the audio thread: posts a copy of channel 0 of every 128-sample frame.
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs && inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
