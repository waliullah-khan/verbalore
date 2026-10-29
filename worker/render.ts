import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeHtml, type Brand, type Theme } from "./compose";
import { isUseCase } from "../src/lib/usecases";
import { planScenes, wordsFromText, type Word } from "./plan";

function run(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, shell: process.platform === "win32" && cmd === "npx" });
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
// re-encoded to a constant 30 fps H.264 file cropped to the speaker frame.
async function normalise(input: string, output: string) {
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", input,
    "-vf", "fps=30,scale=1000:1100:force_original_aspect_ratio=increase,crop=1000:1100",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-g", "30",
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

const hyperframes = () =>
  process.env.HYPERFRAMES_BIN ? { cmd: process.env.HYPERFRAMES_BIN, pre: [] as string[] } : { cmd: "npx", pre: ["--yes", "hyperframes@0.8.216"] };

export async function renderComposition(dir: string, out: string) {
  const { cmd, pre } = hyperframes();
  await run(cmd, [...pre, "render", "--fps", process.env.RENDER_FPS ?? "24", "--quiet", "-o", out], dir);
}

export async function renderVideo(db: SupabaseClient, videoId: string) {
  const t0 = Date.now();
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

    const talk = path.join(dir, "assets", "talk.mp4");
    await normalise(raw, talk);
    const secs = Math.min(await duration(talk), 90);

    const scriptText = (idea?.script?.beats ?? []).map((b: { text: string }) => b.text).join(" ");
    const { words, via } = await transcribe(talk, scriptText || "Your video", secs);
    const { scenes, via: planVia } = await planScenes(words, secs, isUseCase(video.use_case) ? video.use_case : "general");

    const html = composeHtml({
      scenes, words, duration: secs, brand: ws.brand as Brand, theme: video.template as Theme,
      videoFile: "assets/talk.mp4", brandName: ws.name,
    });
    await writeFile(path.join(dir, "index.html"), html);

    const out = path.join(dir, "out.mp4");
    await renderComposition(dir, out);

    const objectPath = `${video.workspace_id}/${videoId}.mp4`;
    const up = await db.storage.from("vl-videos").upload(objectPath, await readFile(out), { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);

    const renderMs = Date.now() - t0;
    await db.from("vl_videos").update({
      status: "ready", output_path: objectPath, duration_s: secs, render_ms: renderMs,
      scene_plan: scenes, transcript: { via, planVia, words: words.length },
    }).eq("id", videoId);
    return { renderMs, scenes: scenes.length, via, planVia };
  } catch (err) {
    await db.from("vl_videos").update({ status: "failed", error: (err as Error).message.slice(0, 500) }).eq("id", videoId);
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
