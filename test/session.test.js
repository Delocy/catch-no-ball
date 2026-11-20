import { test } from "node:test";
import assert from "node:assert/strict";
import { nextContext } from "../src/client/session.js";

const s = (said) => ({ said, hasSinglish: true });

test("nextContext keeps the last 3 said values in order", () => {
  assert.deepEqual(nextContext(["a", "b"], [s("c"), s("d")]), ["b", "c", "d"]);
});

test("nextContext includes plain sentences", () => {
  assert.deepEqual(nextContext([], [{ said: "Plain one.", hasSinglish: false }]), ["Plain one."]);
});

test("nextContext handles an empty start and no sentences", () => {
  assert.deepEqual(nextContext([], [s("a")]), ["a"]);
  assert.deepEqual(nextContext(undefined, undefined), []);
  assert.deepEqual(nextContext(["a"], []), ["a"]);
});

test("nextContext honours a custom keep and does not mutate its input", () => {
  const prev = ["a", "b"];
  assert.deepEqual(nextContext(prev, [s("c")], 2), ["b", "c"]);
  assert.deepEqual(prev, ["a", "b"]);
});
