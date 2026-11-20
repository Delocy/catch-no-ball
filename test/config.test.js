import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("every file in src/client is imported in src/index.js", () => {
  const index = read("src/index.js");
  const files = readdirSync(new URL("src/client/", root)).filter((f) => !f.startsWith("."));
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(index.includes(`./client/${f}`), `${f} missing from src/index.js`);
});

test("src/index.js wires the router and the text handler, and imports the app page", () => {
  const index = read("src/index.js");
  assert.match(index, /pages\/app\.html/);
  assert.match(index, /createRouter\(/);
  assert.match(index, /handleText/);
  assert.match(index, /export default/);
});

test("if wrangler.toml declares MeralionGuard, index.js exports it", () => {
  const toml = read("wrangler.toml");
  if (toml.includes("MeralionGuard")) assert.match(read("src/index.js"), /export\s*\{[^}]*MeralionGuard/);
});

test("wrangler.toml [vars] has no secret names", () => {
  const toml = read("wrangler.toml");
  const vars = toml.split(/^\[vars\]/m)[1];
  if (vars) {
    const block = vars.split(/^\[/m)[0];
    assert.doesNotMatch(block, /OPENCODE_API_KEY|MERALION_API_KEY/);
  }
  assert.doesNotMatch(toml.replace(/^#.*$/gm, ""), /OPENCODE_API_KEY|MERALION_API_KEY/);
});

test("wrangler.toml has the Text rule and [assets] directory ./public with run_worker_first", () => {
  const toml = read("wrangler.toml");
  assert.match(toml, /name = "catch-no-ball"/);
  assert.match(toml, /main = "src\/index\.js"/);
  assert.match(toml, /compatibility_date = "2025-08-01"/);
  assert.match(toml, /type = "Text"/);
  assert.match(toml, /fallthrough = false/);
  // Globs are relative to the entry file's folder (src/). "src/**" matches nothing and breaks the build.
  assert.ok(toml.includes('globs = ["**/*.html", "**/*.css", "**/client/*.js"]'), "Text-rule globs changed");
  assert.match(toml, /\[assets\]/);
  assert.match(toml, /directory = "\.\/public"/);
  const rwf = toml.match(/run_worker_first = \[([^\]]*)\]/);
  assert.ok(rwf, "run_worker_first missing");
  for (const p of ["/app", "/api/*", "/client/*"]) assert.ok(rwf[1].includes(`"${p}"`), p);
});

test("public/ contains nothing named app, app.html, app/, api/ or client/", () => {
  const dir = new URL("public/", root);
  if (!existsSync(dir)) return;
  const names = readdirSync(dir);
  for (const bad of ["app", "app.html", "api", "client"]) assert.ok(!names.includes(bad), bad);
});

test("package.json test and coverage scripts include both test globs", () => {
  const { scripts } = JSON.parse(read("package.json"));
  for (const s of ["test", "coverage"]) {
    assert.ok(scripts[s].includes("test/**/*.test.js"), s);
    assert.ok(scripts[s].includes("evals/**/*.test.js"), s);
  }
  assert.match(scripts.coverage, /--test-coverage-lines=81/);
  assert.match(scripts.coverage, /--test-coverage-branches=81/);
  assert.match(scripts.coverage, /--test-coverage-functions=81/);
});

test(".gitignore lists .dev.vars, evals/clips/, evals/results/", () => {
  const gi = read(".gitignore");
  for (const l of [".dev.vars", "evals/clips/", "evals/results/"]) assert.ok(gi.split("\n").includes(l), l);
});

test("package.json has no dependencies, only devDependencies.wrangler", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies), ["wrangler"]);
});

test(".dev.vars.example lists both secret names with empty values", () => {
  const ex = read(".dev.vars.example");
  assert.match(ex, /^OPENCODE_API_KEY=$/m);
  assert.match(ex, /^MERALION_API_KEY=$/m);
});

const strip = (s) => s.replace(/^\s*#.*$/gm, "");

test("wrangler.toml binds MERALION_GUARD with a v1 new_sqlite_classes migration, and index.js exports MeralionGuard", () => {
  const toml = strip(read("wrangler.toml"));
  assert.match(toml, /\[\[durable_objects\.bindings\]\]\s*\nname = "MERALION_GUARD"\s*\nclass_name = "MeralionGuard"/);
  assert.match(toml, /\[\[migrations\]\]\s*\ntag = "v1"\s*\nnew_sqlite_classes = \["MeralionGuard"\]/);
  assert.match(read("src/index.js"), /export\s*\{\s*MeralionGuard\s*\}\s*from\s*"\.\/guard\.js"/);
});

test("wrangler.toml binds the CACHE KV namespace", () => {
  assert.match(strip(read("wrangler.toml")), /\[\[kv_namespaces\]\]\s*\nbinding = "CACHE"\s*\nid = "[^"]+"/);
});

test("wrangler.toml has no [ai] binding yet", () => {
  assert.doesNotMatch(strip(read("wrangler.toml")), /^\[ai\]/m);
});

test("src/index.js wires handleChunk and handleBudget", () => {
  const index = read("src/index.js");
  assert.match(index, /handleChunk/);
  assert.match(index, /handleBudget/);
});

test("no FORCE_WHISPER anywhere in wrangler.toml or .dev.vars.example", () => {
  for (const f of ["wrangler.toml", ".dev.vars.example"]) assert.doesNotMatch(read(f), /FORCE_WHISPER/, f);
});

function srcFiles(dir = "src/") {
  let out = [];
  for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    if (e.isDirectory()) out = out.concat(srcFiles(`${dir}${e.name}/`));
    else out.push(`${dir}${e.name}`);
  }
  return out;
}

test("no ACCESS_CODE or DEMO_KEY anywhere in src/, wrangler.toml or .dev.vars.example, and .dev.vars.example lists exactly OPENCODE_API_KEY and MERALION_API_KEY", () => {
  for (const f of [...srcFiles(), "wrangler.toml", ".dev.vars.example"]) {
    assert.doesNotMatch(read(f), /ACCESS_CODE|DEMO_KEY/, f);
  }
  const names = read(".dev.vars.example").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split("=")[0]);
  assert.deepEqual(names.sort(), ["MERALION_API_KEY", "OPENCODE_API_KEY"]);
});

test("no file in src/ mentions a MERaLiON hint or a combined/two_call mode", () => {
  for (const f of srcFiles()) {
    const text = read(f);
    assert.doesNotMatch(text, /\bhint\b/i, f);
    assert.doesNotMatch(text, /two_call|["']combined["']/, f);
  }
});
