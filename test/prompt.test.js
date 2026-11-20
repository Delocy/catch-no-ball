import { test } from "node:test";
import assert from "node:assert/strict";
import { TONES, SETTING, buildMessages, cleanContext, CONTEXT_KEEP, MAX_CONTEXT_CHARS } from "../src/prompt.js";

test("TONES is exactly firm, reluctant, doubtful, joking, casual, neutral", () => {
  assert.deepEqual(TONES, ["firm", "reluctant", "doubtful", "joking", "casual", "neutral"]);
});

test("SETTING is Office meeting", () => {
  assert.equal(SETTING, "Office meeting");
});

test("system prompt names every tone, Office meeting, JSON only, verbatim said, plain English rule, confident:false rule", () => {
  const [system] = buildMessages({ transcript: "hi" });
  assert.equal(system.role, "system");
  for (const t of TONES) assert.ok(system.content.includes(t), t);
  assert.match(system.content, /Office meeting/);
  assert.match(system.content, /confirm/);
  assert.match(system.content, /definitely/);
  assert.match(system.content, /JSON only/i);
  assert.match(system.content, /verbatim/i);
  assert.match(system.content, /never reword/i);
  assert.match(system.content, /hasSinglish/);
  assert.match(system.content, /known: false|known:false/);
  assert.ok(system.content.includes("If particles seem missing, infer tone from wording and context."));
  assert.ok(system.content.includes("Never guess confidently. Use confident:false."));
});

test("user message includes Earlier: context lines then the transcript", () => {
  const msgs = buildMessages({ transcript: "can lor", context: ["Can you finish?", "Yes."] });
  assert.equal(msgs[1].role, "user");
  const c = msgs[1].content;
  assert.match(c, /Earlier: Can you finish\?/);
  assert.match(c, /Earlier: Yes\./);
  assert.ok(c.indexOf("Earlier:") < c.indexOf("Transcript: can lor"));
});

test("context [] omits Earlier:", () => {
  const c = buildMessages({ transcript: "hi", context: [] })[1].content;
  assert.ok(!c.includes("Earlier:"));
  assert.match(c, /Transcript: hi/);
});

test("context null or missing does not throw", () => {
  assert.doesNotThrow(() => buildMessages({ transcript: "hi", context: null }));
  assert.doesNotThrow(() => buildMessages({ transcript: "hi" }));
});

test("cleanContext keeps the last 3 strings and caps each at 1000 characters", () => {
  assert.equal(CONTEXT_KEEP, 3);
  assert.equal(MAX_CONTEXT_CHARS, 1000);
  assert.deepEqual(cleanContext(["a", "b", "c", "d", "e"]), ["c", "d", "e"]);
  assert.equal(cleanContext(["x".repeat(500000)])[0].length, 1000);
  assert.deepEqual(cleanContext([1, null, "ok", "  "]), ["ok"]);
  assert.deepEqual(cleanContext(null), []);
  assert.deepEqual(cleanContext("str"), []);
});

test("buildMessages caps an oversized context line", () => {
  const c = buildMessages({ transcript: "t", context: ["y".repeat(5000)] })[1].content;
  assert.ok(c.length < 1200);
});

test("the retry prompt asks to reconsider and give exactly two readings", () => {
  const [system] = buildMessages({ transcript: "can meh", context: ["a"], retry: true });
  assert.ok(system.content.includes("Reconsider with the extra context. If still unsure, set confident false and give exactly two readings."));
});

test("the first-pass prompt does not ask to reconsider", () => {
  const [system] = buildMessages({ transcript: "can meh" });
  assert.ok(!system.content.includes("Reconsider"));
});

test("the base readings rule asks for two readings that differ, with different tones where they could", () => {
  const [system] = buildMessages({ transcript: "can meh" });
  assert.match(system.content, /exactly 2 plausible readings that differ from each other/);
  assert.match(system.content, /two different tones when the tones could differ/);
});
