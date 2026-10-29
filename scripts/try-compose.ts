import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { composeHtml, type Theme } from "../worker/compose";
import { chooseSkin, heuristicScene, planScenes, segment, wordsFromText, type Word } from "../worker/plan";
import { transcribe } from "../worker/render";
import type { UseCaseId } from "../src/lib/usecases";

// Builds the showreel for one clip and one skin, then snapshots frames (or renders the whole thing).
// usage: tsx scripts/try-compose.ts <work dir> <clip> <skin|auto> [snap|render] [useCase] [times]
//   keep the work dir path short on Windows: hyperframes snapshot hits MAX_PATH under long folders
const [work, clip, skinArg = "auto", action = "snap", useCase = "general", times] = process.argv.slice(2);
const brand = { accent: "#c2410c", paper: "#f6f1e7", ink: "#14110f" };
const bin = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "hyperframes.cmd" : "hyperframes");

async function main() {
  mkdirSync(path.join(work, "assets"), { recursive: true });
  const talk = path.join(work, "assets", "talk.mp4");
  if (!existsSync(talk)) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", clip, "-vf", "fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-g", "30", "-c:a", "aac", "-ar", "44100", "-ac", "1", talk]);
  }
  const secs = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", talk]).toString().trim());

  const cache = path.join(work, "words.json");
  let words: Word[];
  if (existsSync(cache)) words = JSON.parse(readFileSync(cache, "utf8"));
  else {
    const t = await transcribe(talk, "Your video", secs);
    words = t.words.length ? t.words : wordsFromText("Your video", secs);
    writeFileSync(cache, JSON.stringify(words));
  }

  // MATTE_FILE=<alpha webm> switches to the cutout layout
  let matteFile: string | undefined;
  if (process.env.MATTE_FILE) {
    copyFileSync(process.env.MATTE_FILE, path.join(work, "assets", "matte.webm"));
    matteFile = "assets/matte.webm";
  }

  const uc = useCase as UseCaseId;
  const preview = segment(words, secs).map((s, i, a) => heuristicScene(s, i, a.length));
  const skin = (skinArg === "auto" ? chooseSkin(preview, uc, work) : skinArg) as Theme;
  const planCache = path.join(work, `plan-${skin}.json`);
  let scenes;
  if (existsSync(planCache)) scenes = JSON.parse(readFileSync(planCache, "utf8"));
  else {
    const p = await planScenes(words, secs, uc, { family: skin });
    scenes = p.scenes;
    writeFileSync(planCache, JSON.stringify(scenes));
    console.log("plan via", p.via);
  }
  console.log(skin, `${secs.toFixed(1)}s`, `${scenes.length} beats`, scenes.map((s: { type: string }) => s.type).join(","));

  writeFileSync(path.join(work, "index.html"), composeHtml({ scenes, words, duration: secs, brand, theme: skin, videoFile: "assets/talk.mp4", brandName: "Clearpath", seed: work, matteFile }));

  const run = (args: string[]) => {
    const r = spawnSync(`"${bin}"`, args, { cwd: work, shell: true, encoding: "utf8" });
    return `${r.stdout ?? ""}${r.stderr ?? ""}`;
  };
  if (action === "render") {
    const t0 = Date.now();
    const out = run(["render", "--fps", "24", "--crf", "24", ...(process.env.RENDER_WORKERS ? ["--workers", process.env.RENDER_WORKERS] : []), "--quiet", "-o", path.join(work, "out.mp4")]);
    console.log(`render ${((Date.now() - t0) / 1000).toFixed(0)}s`, out.trim().slice(-200));
  } else {
    const at = times ?? scenes.map((s: { start: number }) => (s.start + 0.9).toFixed(2)).join(",");
    console.log(run(["snapshot", "--at", at, "-o", path.join(work, "snaps")]).trim().slice(-600));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
