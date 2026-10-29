import { test } from "node:test";
import assert from "node:assert/strict";
import { templateNote } from "./note";

const input = {
  workspace: { id: "w", name: "Clearpath", offer: "Clearpath turns account signals into personal video notes." },
  account: { name: "Ramp" },
  contact: { name: "Taylor Kim", title: "CRO" },
  signal: { kind: "leadership", headline: "New VP of Sales", summary: "" },
};

test("the note opens with the contact's first name and the signal", () => {
  const s = templateNote(input, "A team went from 2 to 7 percent replies.");
  assert.equal(s.beats[0].label, "Hook");
  assert.ok(s.beats[0].text.startsWith("Taylor,"));
  assert.ok(s.beats[0].text.includes("Ramp"));
  assert.equal(s.beats[s.beats.length - 1].label, "CTA");
});

test("a note stays short enough to watch", () => {
  assert.ok(templateNote(input, "x").totalSeconds <= 45);
});
