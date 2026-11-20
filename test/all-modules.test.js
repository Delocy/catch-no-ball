import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, relative } from "node:path";

// Files never imported are invisible to Node's coverage. Import every module so an
// untested one shows up at 0% instead of being silently skipped.
globalThis.registerProcessor ??= () => {};
globalThis.AudioWorkletProcessor ??= class {};

const root = fileURLToPath(new URL("../", import.meta.url));
const EXCLUDED = new Set(["src/index.js", "src/client/app.js", "evals/run.js"]);

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // a missing evals/ is fine
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith(".js") && !e.name.endsWith(".test.js")) out.push(p);
  }
  return out;
}

test("every module under src/ and evals/ imports cleanly", async () => {
  const files = [...walk(join(root, "src")), ...walk(join(root, "evals"))]
    .filter((f) => !EXCLUDED.has(relative(root, f)));
  assert.ok(files.length > 0);
  for (const f of files) await import(pathToFileURL(f).href);
});
