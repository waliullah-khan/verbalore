import { test } from "node:test";
import assert from "node:assert/strict";
import { sentence, strengthOf } from "./strength";

test("an idea's strength comes from its score", () => {
  assert.equal(strengthOf(96), "epic");
  assert.equal(strengthOf(80), "epic");
  assert.equal(strengthOf(79), "rare");
  assert.equal(strengthOf(55), "rare");
  assert.equal(strengthOf(54), "common");
  assert.equal(strengthOf(0), "common");
});

test("why-now text always ends as a sentence", () => {
  assert.equal(sentence("Three reports agree"), "Three reports agree.");
  assert.equal(sentence("Already done. "), "Already done.");
  assert.equal(sentence("Really?"), "Really?");
});
