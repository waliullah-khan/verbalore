import { test } from "node:test";
import assert from "node:assert/strict";
import { queueText } from "./queue";

test("the line says where you are", () => {
  assert.equal(queueText(null), null);
  assert.equal(queueText({ stage: "working", ahead: 0 }), "Editing now.");
  assert.equal(queueText({ stage: "waiting", ahead: 2 }), "Waiting for a free editor, 2 edits ahead of you.");
  assert.equal(queueText({ stage: "waiting", ahead: 1 }), "Waiting for a free editor, 1 edit ahead of you.");
  assert.equal(queueText({ stage: "waiting", ahead: 0 }), "Waiting for a free editor. You are next.");
});
