import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { mergeMatte } from "../worker/matte";

// Checks the merge step with files you already have, so no cloud call is needed.
// usage: tsx scripts/try-matte.ts <source clip> <mask video> <work dir> [seconds]
// The result is <work dir>/slice-alpha.webm; render it with: MATTE_FILE=<that file> tsx scripts/try-compose.ts ...
const [clip, mask, work, secs = "8"] = process.argv.slice(2);

async function main() {
  mkdirSync(work, { recursive: true });
  const sliceClip = path.join(work, "slice.mp4");
  const sliceMask = path.join(work, "slice-mask.mp4");
  const out = path.join(work, "slice-alpha.webm");
  for (const [src, dst] of [[clip, sliceClip], [mask, sliceMask]]) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-t", secs, "-i", src, "-an", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", dst]);
  }
  const t = Date.now();
  await mergeMatte(sliceClip, sliceMask, out);
  const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate:stream_tags=alpha_mode", "-of", "csv=p=0", out]).toString().trim().replace(/\n/g, " ");
  console.log(`merged ${secs}s in ${((Date.now() - t) / 1000).toFixed(1)}s -> ${out} (${info})`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
