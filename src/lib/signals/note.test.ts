import { test } from "node:test";
import assert from "node:assert/strict";
import { templateNote } from "./note";
import { TARGETS, draftWords } from "../scripts/validate";

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
  assert.ok(s.beats[0].text.includes(" I saw "), "the I stays a capital");
  assert.equal(s.beats[s.beats.length - 1].label, "CTA");
});

test("even the sources-only note is a real script, not a few lines", () => {
  const s = templateNote(input, "A team went from 2 to 7 percent replies.");
  const w = draftWords({ hook: s.beats[0].text, beats: s.beats.slice(1, -1), cta: s.beats[s.beats.length - 1].text });
  assert.ok(s.beats.length >= TARGETS.note.minBeats, `${s.beats.length} beats`);
  assert.ok(w >= TARGETS.note.minWords, `${w} words`);
  assert.ok(s.totalSeconds >= 40 && s.totalSeconds <= 75, `${s.totalSeconds}s`);
});
