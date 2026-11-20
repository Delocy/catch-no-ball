import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("app.html loads /client/app.js as a module, has a viewport meta, the icon link, a text input and dark-mode friendly meta", () => {
  const html = read("src/pages/app.html");
  assert.match(html, /<script[^>]+type="module"[^>]+src="\/client\/app\.js"/);
  assert.match(html, /<meta[^>]+name="viewport"/);
  assert.match(html, /<link rel="icon" href="\/logo-mark\.svg">/);
  assert.match(html, /<input[^>]+type="text"|<input[^>]+id="text"/);
  assert.match(html, /<link rel="stylesheet" href="\/client\/app\.css">/);
  assert.match(html, /aria-live/);
});

test("app.css has a prefers-color-scheme: dark rule and a faded plain card", () => {
  const css = read("src/client/app.css");
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /\.card\.plain/);
  assert.match(css, /u\.term/);
});

for (const name of ["logo.svg", "logo-mark.svg"]) {
  test(`public/${name} is an <svg> with a viewBox, no <script>, no external href, under 20 KB`, () => {
    const svg = read(`public/${name}`);
    assert.match(svg, /<svg[\s>]/);
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<script/i);
    assert.doesNotMatch(svg, /href\s*=\s*["'](?!#)/i);
    assert.ok(statSync(new URL(`public/${name}`, root)).size < 20 * 1024);
  });
}

// The landing contract (Person C's public/index.html). Todo until the file exists.
const hasLanding = existsSync(new URL("public/index.html", root));
const landing = (name, fn) => test(name, hasLanding ? {} : { todo: "waiting for Person C" }, () => { if (hasLanding) fn(read("public/index.html")); });

landing("landing has a viewport meta, the icon link, the logo img, name, tagline, example card, Open the app link and the exact privacy line", (html) => {
  assert.match(html, /<meta[^>]+name="viewport"/);
  assert.match(html, /<link rel="icon" href="\/logo-mark\.svg">/);
  assert.match(html, /<img[^>]+src="\/logo\.svg"[^>]+alt="[^"]+"|<img[^>]+alt="[^"]+"[^>]+src="\/logo\.svg"/);
  assert.ok(html.includes("Catch No Ball"));
  assert.ok(html.includes("For when you catch no ball."));
  assert.ok(html.includes("Eh the deadline confirm cannot shift one lah"));
  assert.match(html, /firm/);
  assert.match(html, /<a[^>]+href="\/app"[^>]*>\s*Open the app\s*<\/a>/);
  assert.ok(html.includes("Audio is sent to A*STAR's MERaLiON service to be transcribed and understood, and is never stored by us.") ||
            html.includes("Audio is sent to A&#42;STAR's MERaLiON service to be transcribed and understood, and is never stored by us.") ||
            html.includes("Audio is sent to A*STAR&#39;s MERaLiON service to be transcribed and understood, and is never stored by us."));
});

landing("landing has no <script> and no external URLs", (html) => {
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);
  assert.doesNotMatch(html, /url\(\s*["']?(?:https?:)?\/\//i);
});

landing("landing references no local paths other than /, /app, /logo.svg, /logo-mark.svg", (html) => {
  const allowed = new Set(["/", "/app", "/logo.svg", "/logo-mark.svg"]);
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*["'](\/[^"']*)["']/gi)].map((m) => m[1]);
  for (const r of refs) assert.ok(allowed.has(r), `unexpected path ${r}`);
});

landing("landing has a prefers-color-scheme: dark rule", (html) => {
  assert.match(html, /prefers-color-scheme:\s*dark/);
});
