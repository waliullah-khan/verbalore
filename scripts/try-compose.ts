import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { composeHtml, type Theme } from "../worker/compose";
import { heuristicScene, segment, wordsFromText } from "../worker/plan";
import { playbook, type UseCaseId } from "../src/lib/usecases";

const out = process.argv[2];
const clip = process.argv[3];
const brand = { accent: "#c2410c", paper: "#f6f1e7", ink: "#14110f" };

const samples: [UseCaseId, Theme, string][] = [
  ["real_estate", "listing", "This house just hit the market and it will not last. It has 4 beds, 3 baths and 2,400 sqft. Homes here are selling 3 percent over asking right now. Message me this week to see it in person."],
  ["developers", "terminal", "I deleted four hundred lines and the tests got faster. Run `npm i typed-queue` then call `queue.add(job)`. Use a typed queue instead of a cron job. Star the repo if this helped you."],
  ["gtm", "product", "We booked 11 meetings from 60 notes. First spot the signal, then record thirty seconds, then send it today. Use a video note instead of a cold email. Follow for the daily play."],
  ["c_suite", "boardroom", "Here is what I got wrong this quarter. Revenue grew 42 percent but churn rose to 6 percent. We hired too fast and I own that. The fix is simple and we start Monday."],
  ["founders", "kinetic", "We hit 10k in monthly revenue with no ads. The best advice I ignored was to charge sooner. Charge on day one, not day ninety. Follow along as we build in public."],
  ["general", "editorial", "Nobody tells you this about video. Three things matter, the hook, the proof and the ask. Keep every sentence short. Post it today."],
];

for (const [uc, theme, text] of samples) {
  const dir = path.join(out, `${uc}-${theme}`);
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  copyFileSync(clip, path.join(dir, "assets", "talk.mp4"));
  const dur = 24;
  const words = wordsFromText(text, dur);
  const segs = segment(words, dur);
  const scenes = segs.map((s, i) => heuristicScene(s, i, segs.length, playbook(uc).scenes));
  console.log(uc, theme, scenes.map((s) => s.type).join(","));
  writeFileSync(path.join(dir, "index.html"), composeHtml({ scenes, words, duration: dur, brand, theme, videoFile: "assets/talk.mp4", brandName: "Verbalore" }));
}
