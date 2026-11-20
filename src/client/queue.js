// Sends items one at a time, in push order. onResult for item n runs before send for
// item n+1 starts, so the next request sees updated context.
export function createClipQueue({ send, onResult }) {
  const items = [];
  let running = null;

  async function run() {
    while (items.length > 0) {
      const item = items[0];
      let result;
      let error;
      try {
        result = await send(item);
      } catch (e) {
        error = e;
      }
      try {
        onResult(item, result, error);
      } catch {
        // a UI bug must not stop the queue
      }
      items.shift();
    }
    running = null;
  }

  return {
    push(item) {
      items.push(item);
      if (!running) running = run();
    },
    size: () => items.length,
    idle: () => running ?? Promise.resolve(),
  };
}
