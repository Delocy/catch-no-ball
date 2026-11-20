import { json, asset } from "./http.js";

const TYPES = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};

function noStore(res) {
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// assets = { app: string, client: Record<string, string> }
// handlers = { handleText, handleChunk?, handleBudget? }, each (request, env) => Promise<Response>
// The landing page, logos, icon and manifest are static assets in public/: they never reach here.
export function createRouter(assets, handlers) {
  const routes = {
    "POST /api/text": handlers.handleText,
    "POST /api/chunk": handlers.handleChunk,
    "GET /api/budget": handlers.handleBudget,
  };

  return {
    async fetch(request, env, ctx) {
      const { pathname } = new URL(request.url);

      if (pathname.startsWith("/api/")) {
        const handler = routes[`${request.method} ${pathname}`];
        if (!handler) return json({ error: "not_found" }, 404);
        try {
          return noStore(await handler(request, env, ctx));
        } catch {
          return json({ error: "server" }, 500);
        }
      }

      if (request.method === "GET" && pathname === "/app") {
        return asset(assets.app, "text/html; charset=utf-8");
      }

      if (request.method === "GET" && pathname.startsWith("/client/")) {
        const name = pathname.slice("/client/".length);
        const type = TYPES[name.split(".").pop()];
        if (type && Object.hasOwn(assets.client, name)) return asset(assets.client[name], type);
      }

      return new Response("Not found", { status: 404 });
    },
  };
}
