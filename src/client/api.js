export class ApiError extends Error {
  constructor(message, kind, status = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind; // "network" | "bad_request" | "server"
    this.status = status;
  }
}

// The client holds no code or key and sends no auth header.
export function createApi({ fetchImpl, base = "" }) {
  async function call(path, init) {
    let res;
    try {
      res = await fetchImpl(base + path, init);
    } catch (e) {
      throw new ApiError(`network error: ${e.message}`, "network");
    }
    if (!res.ok) {
      const kind = res.status >= 400 && res.status < 500 ? "bad_request" : "server";
      throw new ApiError(`${path} returned ${res.status}`, kind, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new ApiError(`${path} returned an unreadable body`, "server", res.status);
    }
  }

  const postJson = (path, payload) =>
    call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

  return {
    sendText: ({ text, sessionId, context }) => postJson("/api/text", { text, sessionId, context }),
    // Multipart: the browser sets the content-type with its boundary.
    sendClip({ wav, sessionId, context }) {
      const form = new FormData();
      form.append("audio", new Blob([wav], { type: "audio/wav" }), "clip.wav");
      form.append("sessionId", sessionId);
      form.append("context", JSON.stringify(context));
      return call("/api/chunk", { method: "POST", body: form });
    },
    budget: () => call("/api/budget", { method: "GET" }),
  };
}
