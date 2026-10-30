import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeHtml, type Brand, type Theme } from "./compose";
import { isUseCase } from "../src/lib/usecases";
import { chooseSkin, heuristicScene, planScenes, segment, wordsFromText, type Scene, type Word } from "./plan";
import { isFamily } from "./skins";
import type { ThemeId } from "../src/lib/usecases";
import { usableOverride } from "../src/lib/publish/plan-edits";

function run(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // .cmd shims need a shell on Windows, and the project path contains spaces, so quote it
    const shell = process.platform === "win32" && cmd.endsWith(".cmd");
    const p = spawn(shell ? `"${cmd}"` : cmd, args, { cwd, shell });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${out.slice(-600)}`))));
  });
}

async function duration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.trim()) || 0;
}

// MediaRecorder output has no duration header and a variable frame rate, so every take is
// re-encoded to a constant 30 fps H.264 portrait file. The edit moves the speaker between a framed window, a
// small circle and full bleed, so the whole 9:16 picture is kept and each layout crops it with object-fit.
async function normalise(input: string, output: string) {
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", input,
    "-vf", "fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-g", "30",
    "-c:a", "aac", "-ar", "44100", "-ac", "1", output,
  ]);
}

export async function transcribe(video: string, scriptText: string, secs: number): Promise<{ words: Word[]; via: "cartesia" | "script" }> {
  const key = process.env.CARTESIA_API_KEY;
  if (key) {
    try {
      const wav = video.replace(/\.\w+$/, ".wav");
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav]);
      const form = new FormData();
      form.append("file", new Blob([await readFile(wav)], { type: "audio/wav" }), "audio.wav");
      form.append("model", "ink-whisper");
      form.append("language", "en");
      form.append("timestamp_granularities[]", "word");
      const res = await fetch("https://api.cartesia.ai/stt", {
        method: "POST",
        headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16" },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { words?: { word: string; start: number; end: number }[] };
        if (json.words?.length) return { words: json.words, via: "cartesia" };
      }
    } catch {
      // fall through to the script timings
    }
  }
  return { words: wordsFromText(scriptText, secs), via: "script" };
}

// hyperframes is a dev dependency; the render runs in a temp folder, so the binary is addressed absolutely.
const hyperframes = () => ({
  cmd: process.env.HYPERFRAMES_BIN ?? path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "hyperframes.cmd" : "hyperframes"),
  pre: [] as string[],
});

export async function renderComposition(dir: string, out: string) {
  const { cmd, pre } = hyperframes();
  // CRF 24 is plenty for a phone screen and keeps the file near 8 MB, which matters for upload time
  await run(cmd, [...pre, "render", "--fps", process.env.RENDER_FPS ?? "24", "--crf", process.env.RENDER_CRF ?? "24", ...(process.env.RENDER_WORKERS ? ["--workers", process.env.RENDER_WORKERS] : []), "--quiet", "-o", out], dir);
}

export async function renderVideo(db: SupabaseClient, videoId: string) {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  let mark = t0;
  const lap = (name: string) => { timings[name] = Date.now() - mark; mark = Date.now(); };
  const { data: video } = await db.from("vl_videos").select("*").eq("id", videoId).single();
  if (!video) throw new Error("video not found");
  await db.from("vl_videos").update({ status: "processing", error: null }).eq("id", videoId);

  const [{ data: rec }, { data: ws }, { data: idea }] = await Promise.all([
    db.from("vl_recordings").select("*").eq("id", video.recording_id).single(),
    db.from("vl_workspaces").select("name,brand").eq("id", video.workspace_id).single(),
    video.idea_id ? db.from("vl_ideas").select("script").eq("id", video.idea_id).single() : Promise.resolve({ data: null }),
  ]);
  if (!rec || !ws) throw new Error("recording or workspace missing");

  const dir = path.join(tmpdir(), `verbalore-${videoId}`);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  try {
    const raw = path.join(dir, "raw" + path.extname(rec.path));
    const dl = await db.storage.from("vl-recordings").download(rec.path);
    if (dl.error || !dl.data) throw new Error(`download failed: ${dl.error?.message}`);
    await writeFile(raw, Buffer.from(await dl.data.arrayBuffer()));
    lap("download");

    const talk = path.join(dir, "assets", "talk.mp4");
    await normalise(raw, talk);
    const secs = Math.min(await duration(talk), 90);
    lap("normalise");

    const scriptText = (idea?.script?.beats ?? []).map((b: { text: string }) => b.text).join(" ");
    const { words, via } = await transcribe(talk, scriptText || "Your video", secs);
    lap("transcribe");
    // words a person edited in the Library are used as they are, as long as they still fit the footage
    const edited = usableOverride((video.transcript as { plan_override?: unknown } | null)?.plan_override, secs) as Scene[] | null;
    const useCase = isUseCase(video.use_case) ? video.use_case : "general";
    // "auto" (or an unknown name) lets the edit pick the style that suits what was said
    const asked = String(video.template ?? "auto");
    const preview = segment(words, secs).map((sg, i, all) => heuristicScene(sg, i, all.length));
    const theme = (asked !== "auto" && isFamily(asked) ? asked : chooseSkin(preview, useCase, videoId)) as ThemeId;
    const family = theme === "editorial" ? "collage" : theme === "kinetic" ? "typography" : theme === "product" ? "productui" : theme === "terminal" ? "retro" : theme === "boardroom" ? "explainer" : theme === "listing" ? "photoreal" : theme;
    const planned = edited ? { scenes: edited, via: "edited" } : await planScenes(words, secs, useCase, { family });
    const { scenes, via: planVia } = planned;

    const html = composeHtml({
      scenes, words, duration: secs, brand: ws.brand as Brand, theme: theme as Theme,
      videoFile: "assets/talk.mp4", brandName: ws.name, seed: videoId,
    });
    await writeFile(path.join(dir, "index.html"), html);

    lap("plan");
    const out = path.join(dir, "out.mp4");
    await renderComposition(dir, out);
    lap("render");

    const objectPath = `${video.workspace_id}/${videoId}.mp4`;
    const up = await db.storage.from("vl-videos").upload(objectPath, await readFile(out), { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    lap("upload");

    const renderMs = Date.now() - t0;
    await db.from("vl_videos").update({
      status: "ready", output_path: objectPath, duration_s: secs, render_ms: renderMs, template: theme,
      scene_plan: scenes, transcript: { via, planVia, words: words.length, skin: theme, timings },
    }).eq("id", videoId);
    if (video.idea_id) {
      await db.from("vl_video_notes").update({ video_id: videoId, status: "ready" }).eq("idea_id", video.idea_id).is("video_id", null);
    }
    return { renderMs, scenes: scenes.length, via, planVia, timings };
  } catch (err) {
    await db.from("vl_videos").update({ status: "failed", error: (err as Error).message.slice(0, 500) }).eq("id", videoId);
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
