import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristicScene, segment, validScene, wordsFromText } from "./plan";

const script =
  "Nobody tells you this about video. We booked 11 meetings from 60 notes. First spot the signal, then record thirty seconds, then send it today. Follow for the daily play.";

test("wordsFromText spans the whole take", () => {
  const w = wordsFromText(script, 24);
  assert.equal(w[0].start, 0);
  assert.ok(Math.abs(w[w.length - 1].end - 24) < 0.05);
});

test("segments run edge to edge with no gaps", () => {
  const w = wordsFromText(script, 24);
  const segs = segment(w, 24);
  assert.ok(segs.length >= 2);
  segs.forEach((s, i) => {
    if (i > 0) assert.equal(s.start, segs[i - 1].end);
  });
  assert.equal(segs[0].start, 0);
  assert.equal(segs[segs.length - 1].end, 24);
});

test("first scene is a hook and last is a cta", () => {
  const segs = segment(wordsFromText(script, 24), 24);
  const scenes = segs.map((s, i) => heuristicScene(s, i, segs.length));
  assert.equal(scenes[0].type, "hook");
  assert.equal(scenes[scenes.length - 1].type, "cta");
});

test("a spoken number becomes a stat scene", () => {
  const s = heuristicScene({ start: 5, end: 10, text: "We booked 11 meetings from 60 notes." }, 1, 4);
  assert.equal(s.type, "stat");
  assert.ok(s.stat);
  assert.ok(validScene(s));
});

test("a list scene needs items to be valid", () => {
  assert.equal(validScene({ type: "list", start: 0, end: 4, text: "x", headline: "h" }), false);
  assert.equal(validScene({ type: "list", start: 0, end: 4, text: "x", headline: "h", items: ["a b", "c d"] }), true);
});

import { extractCode, extractFacts, splitCompare } from "./plan";

test("backticked commands become code lines", () => {
  assert.deepEqual(extractCode("Run `npm i queue` then call `queue.add(job)`."), ["npm i queue", "queue.add(job)"]);
});

test("instead of splits into before and after", () => {
  const c = splitCompare("Use a typed queue instead of a cron job.");
  assert.equal(c?.left, "a cron job");
  assert.equal(c?.right, "Use a typed queue");
});

test("property facts are pulled as value and label", () => {
  const f = extractFacts("It has 4 beds, 3 baths and 2,400 sqft.");
  assert.ok(f.length >= 2);
  assert.equal(f[0].value, "4");
});

test("use case steers scene choice", () => {
  const seg = { start: 4, end: 9, text: "Use a typed queue instead of a cron job." };
  assert.equal(heuristicScene(seg, 1, 4, ["compare"]).type, "compare");
  assert.notEqual(heuristicScene(seg, 1, 4, ["stat"]).type, "compare");
});

test("an opening that is not a hook and an ending that is not a cta are corrected", async () => {
  const { planScenes: plan } = await import("./plan");
  const words = wordsFromText(
    "We booked eleven meetings from sixty notes. Here is the part nobody tells you. First spot the signal and then record thirty seconds. Then send it the same day. Pick one signal and send one note today.",
    24
  );
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY; // heuristic path: the structural rule must hold there as well
  const { scenes } = await plan(words, 24);
  if (saved) process.env.OPENROUTER_API_KEY = saved;
  assert.equal(scenes[0].type, "hook");
  assert.equal(scenes[scenes.length - 1].type, "cta");
});
