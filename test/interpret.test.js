import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInterpretation, interpret, InterpretError } from "../src/interpret.js";
import { ok, sentence, chatResponse } from "./helpers/replies.js";

test("parses a plain JSON reply", () => {
  const { sentences } = parseInterpretation(ok());
  assert.equal(sentences[0].tone, "firm");
  assert.equal(sentences[0].said, "Eh the deadline confirm cannot shift one lah");
});

test("strips a json fence and surrounding prose", () => {
  const raw = "Sure!\n```json\n" + ok() + "\n```\nHope that helps.";
  assert.equal(parseInterpretation(raw).sentences.length, 1);
});

test("rejects a tone outside TONES", () => {
  assert.throws(() => parseInterpretation(ok({ tone: "angry" })), InterpretError);
});

test("rejects missing said or hasSinglish", () => {
  assert.throws(() => parseInterpretation(JSON.stringify({ sentences: [{ hasSinglish: true }] })), InterpretError);
  assert.throws(() => parseInterpretation(JSON.stringify({ sentences: [{ said: "x" }] })), InterpretError);
  assert.throws(() => parseInterpretation(JSON.stringify({ sentences: [{ said: "  ", hasSinglish: false }] })), InterpretError);
});

test("rejects an empty sentences array, a missing one, and non-JSON", () => {
  assert.throws(() => parseInterpretation('{"sentences":[]}'), InterpretError);
  assert.throws(() => parseInterpretation("{}"), InterpretError);
  assert.throws(() => parseInterpretation("not json at all"), InterpretError);
  assert.throws(() => parseInterpretation("{ broken"), InterpretError);
  assert.throws(() => parseInterpretation(undefined), InterpretError);
});

test("plain-English sentences are normalised", () => {
  const { sentences } = parseInterpretation(
    ok({
      hasSinglish: false,
      tone: "firm",
      meaning: "x",
      confident: false,
      readings: [{ meaning: "a", tone: "firm" }, { meaning: "b", tone: "joking" }],
      terms: [{ term: "t", gloss: "g", known: true }],
    }),
  );
  const s = sentences[0];
  assert.equal(s.tone, "neutral");
  assert.equal(s.meaning, "");
  assert.equal(s.confident, true);
  assert.deepEqual(s.readings, []);
  assert.deepEqual(s.terms, []);
  assert.equal(s.hasSinglish, false);
});

test("Singlish sentence validation: meaning and confident are required", () => {
  assert.throws(() => parseInterpretation(ok({ meaning: "" })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ meaning: 5 })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ confident: "yes" })), InterpretError);
});

test("keeps at most 2 readings", () => {
  const readings = [
    { meaning: "a", tone: "doubtful" },
    { meaning: "b", tone: "neutral" },
    { meaning: "c", tone: "firm" },
  ];
  const s = parseInterpretation(ok({ confident: false, readings })).sentences[0];
  assert.equal(s.readings.length, 2);
  assert.equal(s.readings[1].meaning, "b");
});

test("confident true clears readings", () => {
  const s = parseInterpretation(ok({ confident: true, readings: [{ meaning: "a", tone: "firm" }] })).sentences[0];
  assert.deepEqual(s.readings, []);
});

test("readings and terms must have the right types and shapes", () => {
  assert.throws(() => parseInterpretation(ok({ readings: "no" })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ confident: false, readings: [{ meaning: "", tone: "firm" }] })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ confident: false, readings: [{ meaning: "a", tone: "angry" }] })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ terms: "no" })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ terms: [{ term: "", gloss: "g" }] })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ terms: [{ term: "t", gloss: 3 }] })), InterpretError);
  assert.throws(() => parseInterpretation(ok({ terms: [{ term: "t", gloss: "g", known: "x" }] })), InterpretError);
});

test("missing readings and terms default to []", () => {
  const raw = JSON.stringify({ sentences: [{ said: "a lah", hasSinglish: true, meaning: "m", tone: "casual", confident: true }] });
  const s = parseInterpretation(raw).sentences[0];
  assert.deepEqual(s.readings, []);
  assert.deepEqual(s.terms, []);
});

test("term known defaults to true", () => {
  const s = parseInterpretation(ok({ terms: [{ term: "lah", gloss: "emphasis" }] })).sentences[0];
  assert.equal(s.terms[0].known, true);
});

test("drops extra fields", () => {
  const s = parseInterpretation(ok({ extra: 1, terms: [{ term: "lah", gloss: "g", known: false, junk: 1 }] })).sentences[0];
  assert.deepEqual(Object.keys(s).sort(), ["confident", "hasSinglish", "meaning", "readings", "said", "terms", "tone"]);
  assert.deepEqual(Object.keys(s.terms[0]).sort(), ["gloss", "known", "term"]);
});

test("requireReadings demands exactly 2 readings on every unsure Singlish sentence", () => {
  const one = { meaning: "a", tone: "firm" };
  assert.throws(() => parseInterpretation(ok({ confident: false, readings: [one] }), { requireReadings: true }), InterpretError);
  assert.doesNotThrow(() =>
    parseInterpretation(ok({ confident: false, readings: [one, { meaning: "b", tone: "joking" }] }), { requireReadings: true }),
  );
  assert.doesNotThrow(() => parseInterpretation(ok({ confident: true }), { requireReadings: true }));
});

function fakeFetch(responder) {
  const seen = [];
  const fn = async (url, init) => {
    seen.push({ url, init, body: JSON.parse(init.body) });
    return responder(url, init);
  };
  fn.seen = seen;
  return fn;
}

test("interpret sends the session id, user-agent, bearer key and model", async () => {
  const f = fakeFetch(() => chatResponse(ok()));
  await interpret({ transcript: "t", context: [], sessionId: "sess-1" }, { OPENCODE_API_KEY: "k" }, f);
  const { url, init, body } = f.seen[0];
  assert.equal(url, "https://opencode.ai/inference/go/v1/chat/completions");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-opencode-session"], "sess-1");
  assert.equal(init.headers["user-agent"], "CatchNoBall/1.0");
  assert.equal(init.headers.authorization, "Bearer k");
  assert.equal(init.headers["content-type"], "application/json");
  assert.equal(body.model, "deepseek-v4.1-flash");
  assert.equal(body.temperature, 0.2);
  assert.equal("response_format" in body, false);
  assert.ok(init.signal instanceof AbortSignal);
});

test("interpret sends only the last context sentence on the first pass", async () => {
  const f = fakeFetch(() => chatResponse(ok()));
  await interpret({ transcript: "t", context: ["s1", "s2"], sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f);
  const user = f.seen[0].body.messages[1].content;
  assert.match(user, /s2/);
  assert.doesNotMatch(user, /s1/);
});

test("interpret treats context null, non-array and non-strings as []/filtered", async () => {
  const f = fakeFetch(() => chatResponse(ok()));
  await interpret({ transcript: "t", context: null, sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f);
  await interpret({ transcript: "t", context: "str", sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f);
  await interpret({ transcript: "t", context: [1, null, "real"], sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f);
  assert.doesNotMatch(f.seen[0].body.messages[1].content, /Earlier:/);
  assert.doesNotMatch(f.seen[1].body.messages[1].content, /Earlier:/);
  assert.match(f.seen[2].body.messages[1].content, /Earlier: real/);
});

test("interpret returns passes 1 for a confident reply", async () => {
  const f = fakeFetch(() => chatResponse(ok()));
  const r = await interpret({ transcript: "Eh the deadline confirm cannot shift one lah", context: [], sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f);
  assert.equal(r.passes, 1);
  assert.equal(r.sentences[0].tone, "firm");
});

test("interpret applies the verbatim guard to the sentences", async () => {
  const f = fakeFetch(() => chatResponse(JSON.stringify({ sentences: [sentence({ said: "eh the deadline confirm cannot shift one lah" })] })));
  const r = await interpret({ transcript: "Eh the deadline confirm cannot shift one lah.", context: [], sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f);
  assert.equal(r.sentences[0].said, "Eh the deadline confirm cannot shift one lah.");
});

test("non-2xx throws InterpretError", async () => {
  const f = fakeFetch(() => new Response("nope", { status: 401 }));
  await assert.rejects(interpret({ transcript: "t", context: [], sessionId: "s" }, { OPENCODE_API_KEY: "bad" }, f), InterpretError);
});

test("a rejected fetch throws InterpretError", async () => {
  const f = fakeFetch(() => { throw new TypeError("network down"); });
  await assert.rejects(interpret({ transcript: "t", context: [], sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f), InterpretError);
});

test("a malformed reply (non-JSON body, no choices, bad content) throws InterpretError", async () => {
  const cases = [
    () => new Response("<html>", { status: 200 }),
    () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    () => chatResponse("sorry, no JSON"),
    () => chatResponse(ok({ tone: "angry" })),
  ];
  for (const c of cases) {
    await assert.rejects(interpret({ transcript: "t", context: [], sessionId: "s" }, { OPENCODE_API_KEY: "k" }, fakeFetch(c)), InterpretError);
  }
});

test("an empty or missing content (reasoning model ran out of tokens) throws InterpretError and no max_tokens is sent", async () => {
  for (const content of ["", "   ", null]) {
    const f = fakeFetch(() => chatResponse(content));
    await assert.rejects(interpret({ transcript: "t", context: [], sessionId: "s" }, { OPENCODE_API_KEY: "k" }, f), InterpretError);
    assert.equal("max_tokens" in f.seen[0].body, false);
  }
});

test("a missing OPENCODE_API_KEY throws InterpretError before any request", async () => {
  const f = fakeFetch(() => chatResponse(ok()));
  await assert.rejects(interpret({ transcript: "t", context: [], sessionId: "s" }, {}, f), /OPENCODE_API_KEY is not set/);
  assert.equal(f.seen.length, 0);
});

// ---- slice 2: two readings ----
const R2 = [{ meaning: "Is it really okay?", tone: "doubtful" }, { meaning: "Fine, it is okay.", tone: "neutral" }];
const unsure = (over = {}) => ok({ said: "can meh", confident: false, tone: "doubtful", readings: R2, ...over });
const KEY = { OPENCODE_API_KEY: "k" };

test("retries once with the last 3 context sentences when a Singlish sentence is unsure", async () => {
  const f = fakeFetch(() => chatResponse(unsure()));
  const r = await interpret({ transcript: "can meh", context: ["s1", "s2", "s3", "s4"], sessionId: "s" }, KEY, f);
  assert.equal(f.seen.length, 2);
  const u1 = f.seen[0].body.messages[1].content;
  const u2 = f.seen[1].body.messages[1].content;
  assert.match(u1, /s4/);
  assert.doesNotMatch(u1, /s3/);
  assert.match(u2, /s2[\s\S]*s3[\s\S]*s4/);
  assert.doesNotMatch(u2, /s1/);
  assert.match(f.seen[1].body.messages[0].content, /Reconsider with the extra context/);
  assert.equal(r.sentences[0].readings.length, 2);
  assert.equal(r.passes, 2);
});

test("a settled retry returns the confident sentence with passes 2", async () => {
  let n = 0;
  const f = fakeFetch(() => chatResponse(n++ === 0 ? unsure() : ok({ said: "can meh", tone: "reluctant" })));
  const r = await interpret({ transcript: "can meh", context: ["Can you finish the slides?"], sessionId: "s" }, KEY, f);
  assert.equal(r.passes, 2);
  assert.equal(r.sentences[0].confident, true);
  assert.equal(r.sentences[0].tone, "reluctant");
});

test("does not retry when an unsure sentence is plain English", async () => {
  const f = fakeFetch(() => chatResponse(ok({ said: "Let us move on", hasSinglish: false, confident: false })));
  const r = await interpret({ transcript: "Let us move on", context: [], sessionId: "s" }, KEY, f);
  assert.equal(f.seen.length, 1);
  assert.equal(r.passes, 1);
});

test("does not retry a confident Singlish sentence", async () => {
  const f = fakeFetch(() => chatResponse(ok()));
  await interpret({ transcript: "Eh the deadline confirm cannot shift one lah", context: [], sessionId: "s" }, KEY, f);
  assert.equal(f.seen.length, 1);
});

test("throws InterpretError when the retry still lacks exactly two readings", async () => {
  let n = 0;
  const f = fakeFetch(() => chatResponse(n++ === 0 ? unsure() : unsure({ readings: [R2[0]] })));
  await assert.rejects(interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f), InterpretError);
  assert.equal(f.seen.length, 2);
});

test("throws when the retry call returns 500", async () => {
  let n = 0;
  const f = fakeFetch(() => (n++ === 0 ? chatResponse(unsure()) : new Response("x", { status: 500 })));
  await assert.rejects(interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f), InterpretError);
});

test("rejects a reading whose tone is outside TONES", async () => {
  let n = 0;
  const bad = unsure({ readings: [{ meaning: "a", tone: "angry" }, R2[1]] });
  const f = fakeFetch(() => chatResponse(n++ === 0 ? unsure() : bad));
  await assert.rejects(interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f), InterpretError);
});

// ---- slice 2 review fixes ----
test("a failed retry throws an InterpretError carrying passes 2; a pass-1 failure carries none", async () => {
  let n = 0;
  const f = fakeFetch(() => (n++ === 0 ? chatResponse(unsure()) : new Response("x", { status: 500 })));
  await assert.rejects(interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f), (e) => e instanceof InterpretError && e.passes === 2);
  await assert.rejects(interpret({ transcript: "t", context: [], sessionId: "s" }, KEY, fakeFetch(() => new Response("x", { status: 500 }))), (e) => e.passes === undefined);
});

test("three readings on the retry fail the exactly-2 check", async () => {
  let n = 0;
  const three = unsure({ readings: [...R2, { meaning: "Third", tone: "joking" }] });
  const f = fakeFetch(() => chatResponse(n++ === 0 ? unsure() : three));
  await assert.rejects(interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f), InterpretError);
});

test("two exact-duplicate readings are not two readings", async () => {
  const dup = unsure({ readings: [R2[0], { meaning: "  IS IT really okay? ", tone: "doubtful" }] });
  assert.throws(() => parseInterpretation(dup, { requireReadings: true }), InterpretError);
  let n = 0;
  const f = fakeFetch(() => chatResponse(n++ === 0 ? unsure() : dup));
  await assert.rejects(interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f), InterpretError);
});

test("same meaning with a different tone, or same tone with a different meaning, is valid", () => {
  const a = unsure({ readings: [R2[0], { meaning: R2[0].meaning, tone: "neutral" }] });
  const b = unsure({ readings: [R2[0], { meaning: "Other", tone: "doubtful" }] });
  assert.doesNotThrow(() => parseInterpretation(a, { requireReadings: true }));
  assert.doesNotThrow(() => parseInterpretation(b, { requireReadings: true }));
});

test("a retry timeout and a non-JSON retry reply both throw", async () => {
  for (const second of [() => { throw new DOMException("timed out", "TimeoutError"); }, () => chatResponse("sorry")]) {
    let n = 0;
    const f = fakeFetch(() => (n++ === 0 ? chatResponse(unsure()) : second()));
    await assert.rejects(interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f), InterpretError);
  }
});

test("pass 1 unsure with 0 readings still retries; call 1 has no Reconsider line", async () => {
  let n = 0;
  const f = fakeFetch(() => chatResponse(n++ === 0 ? unsure({ readings: [] }) : unsure()));
  const r = await interpret({ transcript: "can meh", context: [], sessionId: "s" }, KEY, f);
  assert.equal(f.seen.length, 2);
  assert.doesNotMatch(f.seen[0].body.messages[0].content, /Reconsider/);
  assert.equal(r.passes, 2);
});

test("a mixed clip with one unsure sentence makes exactly 2 calls and keeps the plain sentence verbatim", async () => {
  const plain = sentence({ said: "Let us begin.", hasSinglish: false, meaning: "", tone: "neutral", terms: [] });
  const body = (u) => JSON.stringify({ sentences: [plain, JSON.parse(u)] });
  const f = fakeFetch(() => chatResponse(body(unsure())));
  const r = await interpret({ transcript: "Let us begin. can meh", context: [], sessionId: "s" }, KEY, f);
  assert.equal(f.seen.length, 2);
  assert.equal(r.sentences[0].said, "Let us begin.");
  assert.equal(r.sentences[0].hasSinglish, false);
});

test("known limit: if the retry rewords a plain sentence, it is dropped (never shown reworded)", async () => {
  const plain = (said) => sentence({ said, hasSinglish: false, meaning: "", tone: "neutral", terms: [] });
  let n = 0;
  const f = fakeFetch(() => chatResponse(JSON.stringify({ sentences: [plain(n++ === 0 ? "Let us begin." : "Let's start."), JSON.parse(unsure())] })));
  const r = await interpret({ transcript: "Let us begin. can meh", context: [], sessionId: "s" }, KEY, f);
  assert.equal(r.sentences.length, 1);
  assert.equal(r.sentences[0].said, "can meh");
});
