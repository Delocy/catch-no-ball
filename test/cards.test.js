import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, markTerms, toCardModels, cardHtml, shouldAutoScroll } from "../src/client/cards.js";
import { sentence } from "./helpers/replies.js";

const result = (over) => ({ status: "ok", source: "text", transcript: "t", sentences: [], passes: 1, cached: false, hint: null, ...over });

test("escapeHtml escapes & < > \" '", () => {
  assert.equal(escapeHtml(`& < > " '`), "&amp; &lt; &gt; &quot; &#39;");
});

test("markTerms underlines lah as a whole word, case-insensitive, not inside lahat", () => {
  const out = markTerms("Cannot Lah, lahat is fine", [{ term: "lah", gloss: "g", known: true }]);
  assert.match(out, /<u class="term" data-term="lah">Lah<\/u>/);
  assert.match(out, /lahat is fine/);
  assert.equal((out.match(/<u /g) || []).length, 1);
});

test("markTerms prefers the longer term when terms overlap", () => {
  const out = markTerms("can lah ok", [
    { term: "can", gloss: "", known: true },
    { term: "can lah", gloss: "", known: true },
  ]);
  assert.equal((out.match(/<u /g) || []).length, 1);
  assert.match(out, />can lah<\/u>/);
});

test("markTerms escapes model text: an <img onerror> stays inert", () => {
  const out = markTerms("<img src=x onerror=alert(1)> lah", [{ term: "lah", gloss: "", known: true }]);
  assert.ok(!out.includes("<img"));
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const evil = markTerms("a lah", [{ term: "lah", gloss: "", known: true }, { term: '"><script>', gloss: "", known: true }]);
  assert.ok(!evil.includes("<script"));
});

test("markTerms escapes special characters in a term safely and handles no terms", () => {
  assert.equal(markTerms("a (b) c", [{ term: "(b)", gloss: "", known: true }]), 'a <u class="term" data-term="(b)">(b)</u> c');
  assert.equal(markTerms("a & b", []), "a &amp; b");
  assert.equal(markTerms("a & b", undefined), "a &amp; b");
  assert.equal(markTerms("a & b", [{ term: "", gloss: "", known: true }]), "a &amp; b");
});

test("a Singlish sentence becomes a singlish card with meaning and tone", () => {
  const [m] = toCardModels(result({ sentences: [sentence()] }));
  assert.equal(m.kind, "singlish");
  assert.equal(m.said, "Eh the deadline confirm cannot shift one lah");
  assert.equal(m.meaning, "The deadline is fixed and will not move.");
  assert.equal(m.tone, "firm");
  assert.match(m.termsHtml, /<u class="term" data-term="confirm">confirm<\/u>/);
});

test("M2: a plain sentence becomes one plain card whose text is exactly the sentence's said", () => {
  const models = toCardModels(result({ sentences: [sentence({ said: "Let's move on to the next agenda item.", hasSinglish: false })] }));
  assert.deepEqual(models, [{ kind: "plain", text: "Let's move on to the next agenda item." }]);
});

test("M2: cardHtml for a plain card has class plain and contains no meaning, tone or term elements", () => {
  const html = cardHtml({ kind: "plain", text: "Let's <b>move</b> on." }, "c1");
  assert.match(html, /class="card plain"/);
  assert.match(html, /Let&#39;s &lt;b&gt;move&lt;\/b&gt; on\./);
  assert.ok(!/meaning|chip|tone|<u/.test(html));
});

test("M2: a plain sentence that still carries a meaning is shown without it", () => {
  const models = toCardModels(result({ sentences: [{ ...sentence({ hasSinglish: false }), meaning: "x", tone: "firm" }] }));
  assert.equal(models[0].kind, "plain");
  assert.equal("meaning" in models[0], false);
  assert.equal("tone" in models[0], false);
  assert.ok(!cardHtml(models[0], "c").includes("x</"));
});

test("meaning_unavailable becomes an unavailable card with the transcript and the retry copy", () => {
  const models = toCardModels(result({ status: "meaning_unavailable", transcript: "hello lah" }));
  assert.deepEqual(models, [{ kind: "unavailable", transcript: "hello lah" }]);
  const html = cardHtml(models[0], "c9");
  assert.match(html, /Meaning unavailable, tap to retry/);
  assert.match(html, /hello lah/);
  assert.match(html, /data-card-id="c9"/);
  assert.match(html, /<button/);
});

test("silent and unknown statuses become no cards", () => {
  assert.deepEqual(toCardModels(result({ status: "silent", transcript: "" })), []);
  assert.deepEqual(toCardModels(null), []);
  assert.deepEqual(toCardModels(result({ status: "ok", sentences: undefined })), []);
});

test("the tone chip shows the tone word as text, not colour only", () => {
  const html = cardHtml({ kind: "singlish", said: "a", termsHtml: "a", meaning: "m", tone: "firm" }, "c2");
  assert.match(html, /<span class="chip tone-firm">firm<\/span>/);
  assert.match(html, /class="card singlish"/);
  assert.match(html, /id="c2"/);
});

test("cardHtml escapes the meaning, the id and an unexpected tone", () => {
  const html = cardHtml({ kind: "singlish", said: "a", termsHtml: "a", meaning: "<script>x</script>", tone: '"><i>' }, 'x"y');
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<i>"));
  assert.ok(!html.includes('x"y'));
});

test("shouldAutoScroll is true within 48 px of the bottom and false when scrolled further up", () => {
  assert.equal(shouldAutoScroll({ scrollTop: 520, clientHeight: 400, scrollHeight: 960 }), true);
  assert.equal(shouldAutoScroll({ scrollTop: 100, clientHeight: 400, scrollHeight: 960 }), false);
  assert.equal(shouldAutoScroll({ scrollTop: 400, clientHeight: 400, scrollHeight: 900 }, 100), true);
});

test("a pending card shows the typed text and the Translating label, escaped", () => {
  const html = cardHtml({ kind: "pending", text: "<b>hi</b> lah" }, "p1");
  assert.match(html, /class="card pending"/);
  assert.match(html, /id="p1"/);
  assert.match(html, /&lt;b&gt;hi&lt;\/b&gt; lah/);
  assert.match(html, /Translating/);
});

test("an unknown card kind renders as an empty string", () => {
  assert.equal(cardHtml({ kind: "mystery" }, "z"), "");
});
