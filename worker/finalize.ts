import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeHtml, type Brand, type Theme } from "./compose";
import { renderComposition } from "./render";
import { cachedPath, MATTE_FILE_REL } from "./matte";
import { clearWork, getWork, WORK_BUCKET, type Prepared } from "./staging";

// Stage two of an edit: build the page, run headless Chrome, upload the result. This is the only stage that needs
// the CPU, so it is the one that is limited per machine and scaled with more machines.
// It can be run again safely: it reads the prepared plan from the work area and clears it only when it is finished.
export async function finalizeVideo(db: SupabaseClient, videoId: string) {
  const t0 = Date.now();
  const { data: video } = await db.from("vl_videos").select("*").eq("id", videoId).single();
  if (!video) throw new Error("video not found");

  const raw = await getWork(db, videoId, "prepared.json");
  if (!raw) {
    // finished already (a repeated job), or the preparation is gone
    if (video.status === "ready" && video.output_path) return { skipped: "already finished" };
    const reason = "The prepared edit is missing. Please edit the video again.";
    await db.from("vl_videos").update({ status: "failed", error: reason }).eq("id", videoId);
    throw new Error(reason);
  }

  const dir = path.join(tmpdir(), `verbalore-${videoId}-render`);
  try {
    const prep = JSON.parse(raw.toString()) as Prepared;
    await db.from("vl_videos").update({ status: "processing", error: null }).eq("id", videoId);
    const [{ data: ws }, { data: rec }] = await Promise.all([
      db.from("vl_workspaces").select("name,brand").eq("id", video.workspace_id).single(),
      db.from("vl_recordings").select("path").eq("id", video.recording_id).maybeSingle(),
    ]);
    if (!ws) throw new Error("workspace missing");

    await mkdir(path.join(dir, "assets"), { recursive: true });
    const talk = await getWork(db, videoId, "talk.mp4");
    if (!talk) throw new Error("The prepared clip is missing. Please edit the video again.");
    await writeFile(path.join(dir, "assets", "talk.mp4"), talk);

    let matteFile: string | undefined;
    let matteLabel = prep.matte.label;
    if (prep.matte.from !== "none") {
      let bytes: Buffer | null = null;
      if (prep.matte.from === "work") bytes = await getWork(db, videoId, "matte.webm");
      else if (rec?.path) {
        const got = await db.storage.from(WORK_BUCKET).download(cachedPath(rec.path));
        if (!got.error && got.data) bytes = Buffer.from(await got.data.arrayBuffer());
      }
      if (bytes) {
        await writeFile(path.join(dir, MATTE_FILE_REL), bytes);
        matteFile = MATTE_FILE_REL;
      } else {
        // better a plain edit than a failed one
        matteLabel = "none:missing";
      }
    }
    const waited = Date.now() - prep.preparedAt;

    const html = composeHtml({
      scenes: prep.scenes, words: prep.words, duration: prep.secs, brand: ws.brand as Brand, theme: prep.theme as Theme,
      videoFile: "assets/talk.mp4", brandName: ws.name, seed: videoId, matteFile,
    });
    await writeFile(path.join(dir, "index.html"), html);

    const out = path.join(dir, "out.mp4");
    const r0 = Date.now();
    await renderComposition(dir, out);
    const renderMs = Date.now() - r0;

    const objectPath = `${video.workspace_id}/${videoId}.mp4`;
    const u0 = Date.now();
    const up = await db.storage.from("vl-videos").upload(objectPath, await readFile(out), { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const uploadMs = Date.now() - u0;

    // render_ms is the time spent working on the video, not the time it spent waiting for a free machine
    const workMs = prep.prepMs + (Date.now() - t0);
    const timings = { ...prep.timings, render: renderMs, upload: uploadMs, wait: waited };
    await db.from("vl_videos").update({
      status: "ready", output_path: objectPath, duration_s: prep.secs, render_ms: workMs, template: prep.theme,
      scene_plan: prep.scenes, transcript: { via: prep.via, planVia: prep.planVia, words: prep.words.length, skin: prep.theme, matte: matteLabel, timings },
    }).eq("id", videoId);
    if (video.idea_id) {
      await db.from("vl_video_notes").update({ video_id: videoId, status: "ready" }).eq("idea_id", video.idea_id).is("video_id", null);
    }
    await clearWork(db, videoId);
    return { renderMs: workMs, scenes: prep.scenes.length, via: prep.via, planVia: prep.planVia, timings };
  } catch (err) {
    await db.from("vl_videos").update({ status: "failed", error: (err as Error).message.slice(0, 500) }).eq("id", videoId);
    await clearWork(db, videoId);
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
