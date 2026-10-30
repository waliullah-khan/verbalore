import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCaptions, shorten, truncate } from "./captions";
import { applyEdits, editable, usableOverride, type PlanScene } from "./plan-edits";
import { MAIN_PLATFORMS, platformsFor } from "./platforms";

const script = {
  beats: [
    { label: "Hook", text: "Meetings got half as long." },
    { label: "Body", text: "We stopped typing every word." },
    { label: "Body", text: "Everyone listens instead." },
    { label: "Body", text: "Notes come from the recording." },
    { label: "CTA", text: "Try it for a week." },
  ],
};

test("captions are built only from the script and respect each platform's limit", () => {
  const caps = defaultCaptions("Fallback", script, MAIN_PLATFORMS);
  assert.equal(caps.youtube, "Meetings got half as long.");
  assert.equal(caps.tiktok, "Meetings got half as long.");
  assert.equal(caps.instagram, "Meetings got half as long. Try it for a week.");
  assert.match(caps.linkedin, /^Meetings got half as long\.\n\nWe stopped typing every word\. Everyone listens instead\.\n\nTry it for a week\.$/);
  for (const p of MAIN_PLATFORMS) assert.ok(caps[p.id].length <= p.limit, p.id);
});

test("with no script a caption is just the title, never made up", () => {
  const caps = defaultCaptions("The cab that arrived late", { beats: [] }, MAIN_PLATFORMS);
  for (const p of MAIN_PLATFORMS) assert.equal(caps[p.id], "The cab that arrived late");
});

test("truncate and shorten", () => {
  assert.equal(truncate("short", 10), "short");
  assert.ok(truncate("one two three four five six", 12).length <= 12);
  assert.equal(shorten("A. B. C. D."), "A. B.");
});

test("only connected platforms beyond the main five are offered", () => {
  assert.equal(platformsFor([]).length, 5);
  const more = platformsFor(["x", "bluesky", "linkedin"]);
  assert.deepEqual(more.slice(5).map((p) => p.id), ["x", "bluesky"]);
  assert.equal(more.find((p) => p.id === "x")?.limit, 280);
});

const plan: PlanScene[] = [
  { type: "hook", start: 0, end: 4, text: "a", headline: "Hook line" },
  { type: "stat", start: 4, end: 9, text: "b", headline: "Meeting times", stat: "50%" },
  { type: "list", start: 9, end: 15, text: "c", headline: "Distractions", items: ["Typing", "Summarizing"] },
  { type: "cta", start: 15, end: 20, text: "d", headline: "Try it", sub: "Follow" },
];

test("an edit changes the words on screen and nothing else", () => {
  const out = applyEdits(plan, [
    { headline: "  A new   hook " },
    { headline: "Meetings", stat: "55%", sub: "ignored" },
    { items: ["One", "", "Two"], headline: "" },
    { sub: "Message me", start: 99 } as never,
  ]);
  assert.equal(out[0].headline, "A new hook");
  assert.equal(out[1].stat, "55%");
  assert.equal(out[1].sub, undefined);
  assert.deepEqual(out[2].items, ["One", "Two"]);
  assert.equal(out[2].headline, "Distractions");
  assert.equal(out[3].sub, "Message me");
  assert.equal(out[3].start, 15);
  assert.equal(plan[0].headline, "Hook line");
});

test("which fields each scene type allows", () => {
  assert.deepEqual(editable("stat"), { stat: true, items: false, sub: false });
  assert.deepEqual(editable("list"), { stat: false, items: true, sub: false });
  assert.deepEqual(editable("hook"), { stat: false, items: false, sub: false });
});

test("an edited plan is used only while it still fits the footage", () => {
  assert.equal(usableOverride(plan, 20)?.length, 4);
  assert.equal(usableOverride(plan, 60), null);
  assert.equal(usableOverride([], 20), null);
  assert.equal(usableOverride("nope", 20), null);
  const gap = plan.map((s, i) => (i === 2 ? { ...s, start: 11 } : s));
  assert.equal(usableOverride(gap, 20), null);
});
