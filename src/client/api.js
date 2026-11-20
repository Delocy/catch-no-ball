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
  async function post(path, payload) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
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

  return {
    sendText: ({ text, sessionId, context }) => post("/api/text", { text, sessionId, context }),
  };
}
