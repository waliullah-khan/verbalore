import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUseCase } from "../src/lib/usecases";
import type { ThemeId } from "../src/lib/usecases";
import { usableOverride } from "../src/lib/publish/plan-edits";
import { enqueue } from "../src/lib/jobs";
import { chooseSkin, heuristicScene, planScenes, segment, type Scene } from "./plan";
import { isFamily } from "./skins";
import { duration, normalise, transcribe } from "./render";
import { ensureMatte } from "./matte";
import { clearWork, putWork, type Prepared } from "./staging";

// Stage one of an edit. It spends its time waiting on other services (speech to text, the planner, the cut-out), so
// many of these can run at once on one machine. It ends by handing a finished plan to the render stage.
export async function prepareVideo(db: SupabaseClient, videoId: string, pool: string | null = null) {
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

  const dir = path.join(tmpdir(), `verbalore-${videoId}-prepare`);
  const stop = new AbortController();
  try {
    if (!rec || !ws) throw new Error("recording or workspace missing");
    await mkdir(path.join(dir, "assets"), { recursive: true });
    const raw = path.join(dir, "raw" + path.extname(rec.path));
    const dl = await db.storage.from("vl-recordings").download(rec.path);
    if (dl.error || !dl.data) throw new Error(`download failed: ${dl.error?.message}`);
    await writeFile(raw, Buffer.from(await dl.data.arrayBuffer()));
    lap("download");

    const talk = path.join(dir, "assets", "talk.mp4");
    await normalise(raw, talk);
    const secs = Math.min(await duration(talk), 90);
    lap("normalise");

    // the speaker cut-out runs while the words are transcribed and planned, and is awaited before the plan is saved
    const matteFile = path.join(dir, "assets", "matte.webm");
    const matting = ensureMatte({
      db, recordingPath: rec.path, normalisedPath: talk, dest: matteFile,
      workspaceId: video.workspace_id, videoId, secs, log: (m) => console.log(`[matte] ${videoId.slice(0, 8)} ${m}`), signal: stop.signal,
    });

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

    const matte = await matting;
    timings.matte = matte.ms;
    lap("plan");

    // everything the render needs goes to the shared work area, so any machine can pick it up
    const hasMatte = !!matte.file;
    // a cached or freshly made cut-out is already stored beside the recording; an override is not, so it travels here
    const from: Prepared["matte"]["from"] = !hasMatte ? "none" : matte.label === "cached" || matte.label === "fresh" ? "cache" : "work";
    await putWork(db, videoId, "talk.mp4", await readFile(talk), "video/mp4");
    if (from === "work") await putWork(db, videoId, "matte.webm", await readFile(matteFile), "video/webm");
    lap("handoff");
    const prepared: Prepared = {
      v: 1, secs, words, via, planVia, scenes, theme,
      matte: { label: matte.label, ms: matte.ms, from }, timings, prepMs: Date.now() - t0, preparedAt: Date.now(),
    };
    await putWork(db, videoId, "prepared.json", JSON.stringify(prepared), "application/json");

    await db.from("vl_videos").update({
      template: theme,
      transcript: { stage: "render", via, planVia, words: words.length, skin: theme, matte: matte.label, timings },
    }).eq("id", videoId);

    // a repeated prepare (a retried job) must not leave two renders queued for one video
    const { data: queued } = await db.from("vl_jobs").select("id").eq("kind", "render_final").in("status", ["queued", "running"]).eq("payload->>videoId", videoId).limit(1);
    if (!queued?.length) await enqueue(db, video.workspace_id, "render_final", { videoId, ...(pool ? { pool } : {}) });
    return { prepMs: prepared.prepMs, scenes: scenes.length, via, planVia, matte: matte.label, timings };
  } catch (err) {
    stop.abort();
    await db.from("vl_videos").update({ status: "failed", error: (err as Error).message.slice(0, 500) }).eq("id", videoId);
    await clearWork(db, videoId);
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
