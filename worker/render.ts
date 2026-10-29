import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { wordsFromText, type Word } from "./plan";

export function run(cmd: string, args: string[], cwd?: string): Promise<string> {
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

export async function duration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.trim()) || 0;
}

// MediaRecorder output has no duration header and a variable frame rate, so every take is
// re-encoded to a constant 30 fps H.264 portrait file. The edit moves the speaker between a framed window, a
// small circle and full bleed, so the whole 9:16 picture is kept and each layout crops it with object-fit.
export async function normalise(input: string, output: string) {
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

// Headless Chrome workers per render. Several renders can share a container, so the cores are divided between them,
// and the count is capped because a container often reports the whole host’s cores, not its own share.
export function renderWorkers(env: Record<string, string | undefined> = process.env, cores = availableParallelism()): number {
  const explicit = Number(env.RENDER_WORKERS);
  if (explicit >= 1) return Math.floor(explicit);
  const sharing = Math.max(1, Math.floor(Number(env.RENDER_CONCURRENCY) || 1));
  return Math.min(4, Math.max(1, Math.floor(cores / sharing)));
}

export async function renderComposition(dir: string, out: string) {
  const { cmd, pre } = hyperframes();
  // CRF 24 is plenty for a phone screen and keeps the file near 8 MB, which matters for upload time
  await run(cmd, [...pre, "render", "--fps", process.env.RENDER_FPS ?? "24", "--crf", process.env.RENDER_CRF ?? "24", "--workers", String(renderWorkers()), "--quiet", "-o", out], dir);
}
