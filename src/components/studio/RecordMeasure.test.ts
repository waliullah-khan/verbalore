import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt, lengthCheck, lightCheck, soundCheck } from "./RecordMeasure";

test("a take is judged on what the camera and microphone actually saw", () => {
  const talking = Array.from({ length: 40 }, (_, i) => (i % 3 ? 0.12 : 0.04));
  assert.equal(soundCheck(talking)?.ok, true);
  assert.equal(soundCheck(Array(40).fill(0.004))?.ok, false);
  assert.equal(soundCheck([...talking, 0.95])?.ok, false);
  assert.equal(soundCheck([0.1, 0.1]), null);

  assert.equal(lightCheck([120, 130, 140])?.ok, true);
  assert.equal(lightCheck([20, 30])?.ok, false);
  assert.equal(lightCheck([240, 250])?.ok, false);
  assert.equal(lightCheck([]), null);
});

test("length is judged for social video", () => {
  assert.equal(fmt(42), "0:42");
  assert.equal(fmt(61), "1:01");
  assert.deepEqual(lengthCheck(42), { ok: true, text: "Length is 0:42, a good length for social video" });
  assert.equal(lengthCheck(3).ok, false);
  assert.equal(lengthCheck(200).ok, false);
});
