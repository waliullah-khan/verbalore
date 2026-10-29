import { test } from "node:test";
import assert from "node:assert/strict";
import { draftWords, words } from "./length";

test("a script is counted across hook, body and call to action", () => {
  assert.equal(words("  one two   three "), 3);
  assert.equal(draftWords({ hook: "Stop doing this.", body: ["It costs you a week.", "Here is the fix."], cta: "Reply for the checklist." }), 16);
});
