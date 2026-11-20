import { test } from "node:test";
import assert from "node:assert/strict";
import { TONES, SETTING, buildMessages } from "../src/prompt.js";

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
