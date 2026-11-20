import { test } from "node:test";
import assert from "node:assert/strict";
import { verbatimSpan, enforceVerbatim } from "../src/interpret.js";
import { sentence } from "./helpers/replies.js";

test("verbatimSpan returns the exact transcript span (apostrophe matters)", () => {
  const t = "OK. Let's move on to the next item, can?";
  assert.equal(verbatimSpan(t, "lets move on to the next item"), null);
  assert.equal(verbatimSpan(t, "let's move on to the next item"), "Let's move on to the next item,");
});

test("verbatimSpan folds curly apostrophes and case", () => {
  assert.equal(verbatimSpan("Let’s go now.", "LET'S GO NOW"), "Let’s go now.");
  assert.equal(verbatimSpan("Let's go now.", "let’s go"), "Let's go");
});

test("verbatimSpan returns null when not found or said is empty", () => {
  assert.equal(verbatimSpan("hello there", "goodbye"), null);
  assert.equal(verbatimSpan("hello there", ""), null);
  assert.equal(verbatimSpan("hello there", "!!!"), null);
  assert.equal(verbatimSpan("", "x"), null);
});

test("verbatimSpan extends over trailing punctuation up to whitespace", () => {
  assert.equal(verbatimSpan("Ok can. Next one?!", "next one"), "Next one?!");
});

test("an all-plain clip becomes one plain sentence equal to transcript.trim()", () => {
  const transcript = "  Let's move on. Thanks everyone.  ";
  const plain = (said) => sentence({ said, hasSinglish: false });
  const out = enforceVerbatim(transcript, [plain("Let's move on."), plain("Thanks all.")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].said, "Let's move on. Thanks everyone.");
  assert.equal(out[0].hasSinglish, false);
  assert.equal(out[0].meaning, "");
  assert.equal(out[0].tone, "neutral");
  assert.equal(out[0].confident, true);
  assert.deepEqual(out[0].readings, []);
  assert.deepEqual(out[0].terms, []);
});

test("a reworded plain sentence in a mixed clip is dropped", () => {
  const transcript = "Okay team. Cannot shift one lah.";
  const out = enforceVerbatim(transcript, [
    sentence({ said: "Alright everybody", hasSinglish: false }),
    sentence({ said: "Cannot shift one lah" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].hasSinglish, true);
});

test("a matching plain sentence takes the transcript's exact span", () => {
  const out = enforceVerbatim("Okay team. Cannot shift one lah.", [
    sentence({ said: "okay team", hasSinglish: false }),
    sentence({ said: "cannot shift one lah" }),
  ]);
  assert.equal(out[0].said, "Okay team.");
  assert.equal(out[1].said, "Cannot shift one lah.");
});

test("an unmatched Singlish sentence keeps the model's said", () => {
  const out = enforceVerbatim("Something else entirely", [sentence({ said: "cannot shift one lah" })]);
  assert.equal(out[0].said, "cannot shift one lah");
});
