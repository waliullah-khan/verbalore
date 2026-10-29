import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDraft, writeScript, type Models } from "./writer";
import { fallbackDraft, sentencePool } from "./fallback";
import { TARGETS, beatCount, draftWords, isTiny, ungroundedNumbers, validateDraft, type Draft, type Issue } from "./validate";
import type { WriterInput } from "./types";

const SOURCE = "Austin issued 300 new-home permits last month, up 22% on the month before. A 176-unit project near the airport took 54 teardown permits. Builders say lumber costs held at $450,000 per project on average.";
const input: WriterInput = {
  kind: "idea",
  structure: "Myth-bust",
  hook: "Austin permits jumped 22% in one month.",
  angle: "new home permits",
  evidence: [SOURCE, "Permits are public record. Anyone can look them up on the city's open data portal and check the numbers themselves."],
  brain: "We help buyers read the market before they bid. Our clients check permit data before every offer.",
};

const beat = (label: string, text: string) => ({ label, text });
const long = (): Draft => ({
  method: "Myth-bust",
  hook: "Austin permits jumped 22% in one month.",
  beats: [
    beat("Setup", "Most people think the market only moves when prices move. The city's permit records say something else."),
    beat("Stakes", "Last month Austin issued 300 new-home permits. That is 22% more than the month before."),
    beat("Proof", "One project near the airport pulled 54 teardown permits on its own. That is a lot of old homes coming down at once."),
    beat("Proof", "Builders say costs held at $450,000 per project on average. So the money is still flowing into new supply."),
    beat("Counterpoint", "You might say permits are not homes. That's fair. A permit is a promise, not a finished house."),
    beat("Example", "But a promise this big shows where builders are putting their bets. They don't pull permits on a hunch."),
    beat("Turn", "So if you are buying, watch where the permits land. New supply near you changes what you should offer."),
  ],
  cta: "Want me to pull the permits for your street? Message me and I'll send them over.",
});

const fakes = (large: unknown[], fast: unknown[] = []): Models & { calls: { large: number; fast: number } } => {
  const calls = { large: 0, fast: 0 };
  return {
    calls,
    large: async () => {
      const r = large[Math.min(calls.large++, large.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
    fast: async () => {
      const r = fast[Math.min(calls.fast++, fast.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
};

test("a full, grounded script passes validation", () => {
  const issues = validateDraft(long(), TARGETS.idea, [SOURCE, input.brain ?? ""]);
  assert.deepEqual(issues, []);
  assert.ok(draftWords(long()) >= 150 && beatCount(long()) >= 7);
});

test("a three-line script is rejected for length and structure", () => {
  const short: Draft = { hook: "Permits jumped.", beats: [beat("Body", "It was 22% more."), beat("Body", "Builders are busy.")], cta: "Message me." };
  const codes = validateDraft(short, TARGETS.idea, [SOURCE]).map((i) => i.code);
  assert.ok(codes.includes("short"));
  assert.ok(codes.includes("few-beats"));
});

test("figures must come from the sources, with formatting differences allowed", () => {
  assert.deepEqual(ungroundedNumbers("It was up 22 percent to 300 permits, around $450k each.", [SOURCE]), []);
  assert.deepEqual(ungroundedNumbers("That is 73% of all builders and 1,200 homes.", [SOURCE]), ["73", "1,200"]);
  assert.deepEqual(ungroundedNumbers("It is 2026.", [SOURCE], [2026]), []);
});

test("hype, emojis, long hooks and greetings are flagged", () => {
  const d = long();
  d.hook = "Hey guys, today we are going to talk about the unbelievable and absolutely game-changing permit surge in Austin";
  d.beats[0].text += " Time to supercharge your offer 🚀";
  const codes = validateDraft(d, TARGETS.idea, [SOURCE, input.brain ?? ""]).map((i) => i.code);
  assert.ok(codes.includes("hook"));
  assert.ok(codes.filter((c) => c === "filler").length >= 1);
});

test("only small slips go to the fast model", () => {
  const i = (code: Issue["code"]): Issue => ({ code, detail: "x" });
  assert.equal(isTiny([i("hook"), i("filler")]), true);
  assert.equal(isTiny([i("hook"), i("short")]), false);
  assert.equal(isTiny([i("numbers")]), false);
  assert.equal(isTiny([]), false);
});

test("a script that passes first time costs one model call", async () => {
  const m = fakes([long()]);
  const r = await writeScript(input, m);
  assert.equal(r.via, "model");
  assert.equal(r.attempts, 1);
  assert.equal(m.calls.large, 1);
  assert.ok(r.script.beats[0].label === "Hook" && r.script.beats[r.script.beats.length - 1].label === "CTA");
  assert.ok(r.script.beats.some((b) => b.label === "Proof"));
});

test("a short draft is sent back to the large model with the exact problem, and passes", async () => {
  const m = fakes([{ hook: "Permits jumped.", beats: [beat("Body", "It was 22% more.")], cta: "Message me." }, long()]);
  const r = await writeScript(input, m);
  assert.equal(r.via, "repaired");
  assert.equal(r.attempts, 2);
  assert.equal(m.calls.large, 2);
  assert.equal(m.calls.fast, 0);
  assert.ok(r.words >= 150);
});

test("a hook-only problem is fixed by the fast model", async () => {
  const bad = long();
  bad.hook = "Hey guys, here is a really surprising thing that happened with Austin permits last month and it matters";
  const m = fakes([bad], [long()]);
  const r = await writeScript(input, m);
  assert.equal(r.via, "repaired");
  assert.equal(m.calls.fast, 1);
  assert.equal(m.calls.large, 1);
});

test("when the model is down the script is built from the sources and is never short", async () => {
  const r = await writeScript(input, fakes([new Error("503")]));
  assert.equal(r.via, "fallback");
  assert.ok(r.words >= TARGETS.idea.minWords, `only ${r.words} words`);
  assert.ok(r.beats >= TARGETS.idea.minBeats);
  assert.equal(r.script.beats[0].label, "Hook");
  assert.equal(r.script.beats[r.script.beats.length - 1].label, "CTA");
});

test("a model that keeps writing short scripts is topped up from the sources", async () => {
  const stubborn = { hook: "Permits jumped 22%.", beats: [beat("Setup", "Austin issued 300 new-home permits last month.")], cta: "Message me." };
  const r = await writeScript(input, fakes([stubborn]));
  assert.equal(r.via, "expanded");
  assert.equal(r.attempts, 3);
  assert.ok(r.words >= TARGETS.idea.minWords && r.beats >= TARGETS.idea.minBeats);
});

test("figures that are not in the sources are removed rather than shipped", async () => {
  const invented = long();
  invented.beats[1].text = "Last month Austin issued 912 new-home permits. That is 61% more than the month before.";
  const r = await writeScript(input, fakes([invented]));
  const text = r.script.beats.map((b) => b.text).join(" ");
  assert.deepEqual(ungroundedNumbers(text, [SOURCE, input.brain ?? "", input.hook ?? "", ...input.evidence], [new Date().getFullYear()]), []);
  assert.ok(r.words >= TARGETS.idea.minWords);
});

test("every kind gets a long enough script even from one thin source", async () => {
  for (const kind of ["idea", "signal", "note"] as const) {
    const thin: WriterInput = { kind, structure: "Direct", hook: "A team hired a new VP of Marketing.", evidence: ["Brightpath hired a VP of Marketing in October."], person: { name: "Dana Lee", title: "CMO", company: "Brightpath" } };
    const r = await writeScript(thin, fakes([new Error("down")]));
    assert.ok(r.words >= TARGETS[kind].minWords, `${kind}: ${r.words} words`);
    assert.ok(r.beats >= TARGETS[kind].minBeats, `${kind}: ${r.beats} beats`);
  }
});

test("a note to one person addresses them by first name", () => {
  const d = fallbackDraft({ kind: "note", structure: "Video note", hook: "Brightpath just hired a VP of Marketing.", evidence: ["Brightpath hired a VP of Marketing in October."], person: { name: "Dana Lee", title: "CMO", company: "Brightpath" } }, TARGETS.note);
  assert.match(d.hook, /^Dana,/);
});

test("the sentence pool drops markdown, links and page furniture", () => {
  const pool = sentencePool({ ...input, evidence: ["# Heading\n[Read more](http://x.com) Austin issued 300 new-home permits last month. Subscribe to our newsletter today for more updates."], brain: "" });
  assert.ok(pool.some((s) => s.includes("300 new-home permits")));
  assert.ok(!pool.some((s) => /subscribe|http/i.test(s)));
});

test("the model's answer is accepted in a few reasonable shapes", () => {
  assert.equal(parseDraft(null), null);
  const a = parseDraft({ hook: "H", beats: [{ label: "Hook", text: "H" }, { label: "Body", text: "B1" }, { label: "CTA", text: "C" }], cta: "C" });
  assert.deepEqual(a?.beats.map((b) => b.text), ["B1"]);
  const b = parseDraft({ hook: "H", body: ["one", "two"], cta: "C" });
  assert.equal(b?.beats.length, 2);
});

test("when the large model errors, the fast model drafts before the sources-only builder is used", async () => {
  const m = fakes([new Error("timeout")], [long()]);
  const r = await writeScript(input, m);
  assert.equal(r.via, "model");
  assert.equal(m.calls.fast, 1);
  assert.ok(r.notes.some((n) => n.includes("large model failed")));
});

test("the sources-only script does not repeat the hook, borrow another poster's voice or keep ads", () => {
  const d = fallbackDraft(
    {
      kind: "idea", structure: "Direct", hook: "This East Austin home has payments starting at $2,024.",
      evidence: ["This East Austin home has payments starting at $2,024. I'm on a hunt to find a new community, DM for details or a showing! Three beds, two baths, 1,499 square feet. Rates as low as 3.25 percent from the builder."],
      brain: "I offer a free 20 minute buyer plan call. Last quarter I closed 9 homes.",
    },
    TARGETS.idea,
  );
  const text = d.beats.map((b) => b.text).join(" ");
  assert.ok(!/on a hunt/i.test(text), "another poster's first person");
  assert.ok(!/\bDM\b/.test(text), "an ad line");
  assert.equal((text.match(/payments starting at \$2,024/g) ?? []).length, 0, "the hook is not said twice");
  assert.ok(/buyer plan call/.test(text), "the speaker's own notes are still used");
});

test("dashes in a draft become commas", async () => {
  const d = long();
  d.beats[0].text = "Most people think the market only moves when prices move\u2014the permit records say something else.";
  const r = await writeScript(input, fakes([d]));
  const text = r.script.beats.map((b) => b.text).join(" ");
  assert.ok(!/[\u2014\u2013]/.test(text));
  assert.ok(text.includes("move, the permit records"));
});
