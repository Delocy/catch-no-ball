// Sends items one at a time, in push order. onResult for item n runs before send for
// item n+1 starts, so the next request sees updated context.
// gapMs(next, prev, prevResult): ms to wait before sending next (upload pacing). The head is
// re-read after the wait, so drop() during the gap is honoured.
export function createClipQueue({
  send,
  onResult,
  gapMs = () => 0,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const items = [];
  let running = null;
  let inFlight = null;
  let wake = null; // ends a pending gap early

  async function run() {
    while (items.length > 0) {
      const item = items[0];
      inFlight = item;
      let result;
      let error;
      try {
        result = await send(item);
      } catch (e) {
        error = e;
      }
      try {
        onResult(item, result, error);
      } catch (e) {
        // a UI bug must not stop the queue, but it must not be silent either
        console.error(`onResult failed: ${e && e.message}`);
      }
      items.shift();
      inFlight = null;
      if (items.length > 0) {
        const gap = gapMs(items[0], item, result);
        if (gap > 0) {
          await Promise.race([sleep(gap), new Promise((r) => { wake = r; })]);
          wake = null;
        }
      }
    }
    running = null;
  }

  return {
    // A typed line goes ahead of upload clips that are still waiting (never the one in flight).
    push(item) {
      let at = items.length;
      if (item.kind === "text") {
        const first = items.findIndex((x) => x !== inFlight && x.uploadId);
        if (first !== -1) at = first;
      }
      items.splice(at, 0, item);
      if (at === 0 && wake) wake();
      if (!running) running = run();
    },
    // Removes and returns the waiting items that match; the one being sent is never dropped.
    drop(pred) {
      const dropped = [];
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] !== inFlight && pred(items[i])) dropped.unshift(...items.splice(i, 1));
      }
      if (dropped.length && wake) wake();
      return dropped;
    },
    size: () => items.length,
    idle: () => running ?? Promise.resolve(),
  };
}
