import { test } from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../src/router.js";

function setup() {
  const calls = [];
  const assets = {
    app: "<html>app</html>",
    client: { "app.js": "export {}", "app.css": "body{}" },
  };
  const handlers = {
    handleText: async (req, env) => {
      calls.push({ req, env });
      return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
    },
  };
  return { calls, router: createRouter(assets, handlers) };
}
const get = (router, path, init) => router.fetch(new Request("http://x" + path, init), {}, {});

test("GET /app serves the app page as text/html", async () => {
  const { router } = setup();
  const res = await get(router, "/app");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.equal(await res.text(), "<html>app</html>");
});

test("GET / is a 404 from the router (public/index.html answers it in production)", async () => {
  const { router } = setup();
  assert.equal((await get(router, "/")).status, 404);
});

test("GET /client/app.js is served as text/javascript", async () => {
  const { router } = setup();
  const res = await get(router, "/client/app.js");
  assert.equal(res.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(await res.text(), "export {}");
});

test("GET /client/app.css is served as text/css", async () => {
  const { router } = setup();
  const res = await get(router, "/client/app.css");
  assert.equal(res.headers.get("content-type"), "text/css; charset=utf-8");
});

test("GET /client/nope.js is 404 (and so is a prototype key)", async () => {
  const { router } = setup();
  assert.equal((await get(router, "/client/nope.js")).status, 404);
  assert.equal((await get(router, "/client/constructor")).status, 404);
  assert.equal((await get(router, "/client/data.json")).status, 404);
});

test("POST /api/text calls the text handler; no header is needed", async () => {
  const { router, calls } = setup();
  const res = await get(router, "/api/text", { method: "POST", body: "{}" });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
});

test("GET /api/text and unknown paths are 404", async () => {
  const { router } = setup();
  assert.equal((await get(router, "/api/text")).status, 404);
  assert.equal((await get(router, "/nowhere")).status, 404);
  assert.equal((await get(router, "/api/chunk", { method: "POST" })).status, 404);
});

test("API responses carry cache-control: no-store", async () => {
  const { router } = setup();
  const ok = await get(router, "/api/text", { method: "POST", body: "{}" });
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const nf = await get(router, "/api/nothing");
  assert.equal(nf.headers.get("cache-control"), "no-store");
});

test("a handler that throws becomes a 500 JSON error, not a crash", async () => {
  const router = createRouter({ app: "", client: {} }, { handleText: async () => { throw new Error("boom"); } });
  const res = await router.fetch(new Request("http://x/api/text", { method: "POST", body: "{}" }), {}, {});
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "server" });
});

test("handlers are called with exactly (request, env) so handleText's deps default is not clobbered by ctx", async () => {
  let args;
  const router = createRouter({ app: "", client: {} }, { handleText: async (...a) => { args = a; return new Response("{}"); } });
  await router.fetch(new Request("http://x/api/text", { method: "POST", body: "{}" }), { E: 1 }, { waitUntil() {} });
  assert.equal(args.length, 2);
  assert.deepEqual(args[1], { E: 1 });
});

test("a throwing handler is logged (message only) before the 500", async (t) => {
  const logged = [];
  t.mock.method(console, "error", (...a) => logged.push(a.join(" ")));
  const router = createRouter({ app: "", client: {} }, { handleText: async () => { throw new Error("boom detail"); } });
  await router.fetch(new Request("http://x/api/text", { method: "POST", body: '{"secret":"s3cr3t"}' }), {}, {});
  assert.equal(logged.length, 1);
  assert.match(logged[0], /POST \/api\/text/);
  assert.match(logged[0], /boom detail/);
  assert.doesNotMatch(logged[0], /s3cr3t/);
});

function routerWith(extra) {
  const calls = [];
  const h = (name) => async (req, env) => { calls.push({ name, req, env }); return Response.json({ from: name }); };
  return { calls, router: createRouter({ app: "", client: {} }, { handleText: h("text"), handleChunk: h("chunk"), handleBudget: h("budget"), ...extra }) };
}

test("POST /api/chunk calls the chunk handler", async () => {
  const { router, calls } = routerWith();
  const res = await router.fetch(new Request("http://x/api/chunk", { method: "POST", body: "x" }), { E: 2 }, {});
  assert.deepEqual(await res.json(), { from: "chunk" });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(calls[0].name, "chunk");
  assert.deepEqual(calls[0].env, { E: 2 });
});

test("GET /api/budget returns the handler's JSON", async () => {
  const { router } = routerWith();
  const res = await router.fetch(new Request("http://x/api/budget"), {}, {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { from: "budget" });
  assert.equal((await router.fetch(new Request("http://x/api/budget", { method: "POST" }), {}, {})).status, 404);
  assert.equal((await router.fetch(new Request("http://x/api/chunk"), {}, {})).status, 404);
});

test("neither route asks for a code or key", async () => {
  const { router } = routerWith();
  for (const [path, method] of [["/api/chunk", "POST"], ["/api/budget", "GET"]]) {
    const res = await router.fetch(new Request("http://x" + path, { method, body: method === "POST" ? "x" : undefined }), {}, {});
    assert.equal(res.status, 200, path);
  }
});
