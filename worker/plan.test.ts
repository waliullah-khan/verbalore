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

import { chooseSkin, keyPhrase, styleBrief } from "./plan";
import { isFamily, skinFor } from "./skins";
import { composeHtml } from "./compose";

test("beats are short so the picture keeps changing", () => {
  // a steady speaker: about 2.5 words a second, a breath after each clause
  const toks = "So today we are here to talk about advertising, and honestly a lot of it comes down to confusing advice, not a lack of trying, because the truth is simpler than that, and you can start this week.".split(" ");
  const w = toks.map((word, i) => ({ word, start: Number((i * 0.4).toFixed(2)), end: Number((i * 0.4 + 0.34).toFixed(2)) }));
  const dur = w[w.length - 1].end;
  const segs = segment(w, dur);
  assert.ok(segs.length >= 4, `expected several beats, got ${segs.length}`);
  for (const s of segs.slice(0, -1)) assert.ok(s.end - s.start <= 4.2, `a beat ran ${(s.end - s.start).toFixed(1)}s`);
});

test("a key phrase is a few words around the emphasis word, not the sentence", () => {
  const p = keyPhrase("And honestly a lot of it comes down to confusing advice, not a lack of trying.", "confusing", 5);
  assert.ok(p.split(" ").length <= 5);
  assert.ok(p.toLowerCase().includes("confusing"));
  assert.equal(keyPhrase("Short line here.", "line", 5), "Short line here");
});

test("plain speech rotates its treatments instead of repeating one", () => {
  const texts = ["We realized something was off here.", "Nobody takes notes during meetings anymore.", "Discussions got more honest and spacious.", "The shift changed everything for our team."];
  const types = texts.map((t, i) => heuristicScene({ start: i * 2, end: i * 2 + 2, text: t }, i + 1, 8).type);
  assert.ok(new Set(types).size >= 3, types.join(","));
});

test("every family and the older theme names resolve to a skin, and the brief names real reference films", () => {
  for (const id of ["typography", "productui", "explainer", "generative", "handdrawn", "cartoon", "pixel", "retro", "collage", "lowpoly", "cinematic3d", "photoreal", "kinetic", "product", "terminal", "boardroom", "listing", "editorial"]) {
    assert.ok(isFamily(id), id);
    assert.ok(skinFor(id).id);
  }
  assert.match(styleBrief("typography"), /kinetic typography/i);
  assert.match(styleBrief("typography"), /Reference films/);
});

test("the skin choice follows the content and is stable for one video", () => {
  const code = [{ type: "code", start: 0, end: 3, text: "x", headline: "h", code: ["npm i a"] }] as Parameters<typeof chooseSkin>[0];
  assert.equal(chooseSkin(code, "general", "a"), "retro");
  const plain = [{ type: "tip", start: 0, end: 3, text: "x", headline: "h" }] as Parameters<typeof chooseSkin>[0];
  assert.equal(chooseSkin(plain, "founders", "same-seed"), chooseSkin(plain, "founders", "same-seed"));
});

test("every skin composes a page with a speaker, scenes, captions and a registered timeline", () => {
  const text = "We booked 11 meetings from 60 notes. First spot the signal, then record thirty seconds, then send it today. Follow for the daily play.";
  const words = wordsFromText(text, 24);
  const segs = segment(words, 24);
  const scenes = segs.map((s, i) => heuristicScene(s, i, segs.length));
  for (const theme of ["typography", "productui", "explainer", "generative", "handdrawn", "cartoon", "pixel", "retro", "collage", "lowpoly", "cinematic3d", "photoreal"] as const) {
    const html = composeHtml({ scenes, words, duration: 24, brand: { accent: "#c2410c", paper: "#f6f1e7", ink: "#14110f" }, theme, videoFile: "assets/talk.mp4", brandName: "Test" });
    assert.match(html, /id="talk"/, theme);
    assert.match(html, /window\.__timelines\["main"\] = tl/, theme);
    assert.ok((html.match(/class="scene clip/g) ?? []).length === scenes.length, theme);
    assert.ok(!/repeat: -1/.test(html), `${theme} has an endless repeat`);
    assert.ok(!/Math\.random|Date\.now/.test(html), `${theme} uses a render-time clock`);
  }
});

import { printableBrand } from "./skins/engine";

test("an auto-named workspace is never printed into a video, a real brand name is", () => {
  for (const auto of ["Ada's workspace", "Admin's workspace", "Wali's Workspace", "", "   "]) assert.equal(printableBrand(auto), "", JSON.stringify(auto));
  assert.equal(printableBrand("Clearpath"), "Clearpath");
  const words = wordsFromText("We booked 11 meetings from 60 notes. Follow for the daily play.", 20);
  const segs = segment(words, 20);
  const scenes = segs.map((s, i) => heuristicScene(s, i, segs.length));
  const brand = { accent: "#c2410c", paper: "#f6f1e7", ink: "#14110f" };
  for (const theme of ["typography", "productui", "retro"] as const) {
    const html = composeHtml({ scenes, words, duration: 20, brand, theme, videoFile: "assets/talk.mp4", brandName: "Ada's workspace" });
    assert.ok(!/Ada/.test(html), `${theme} printed the workspace name`);
    assert.ok(!/class="l3"/.test(html), `${theme} still has the lower third`);
  }
  assert.match(composeHtml({ scenes, words, duration: 20, brand, theme: "productui", videoFile: "assets/talk.mp4", brandName: "Clearpath" }), /class="l3"/);
});
