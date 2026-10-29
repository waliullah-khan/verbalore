import { serviceClient } from "../src/lib/supabase/service";
import { enqueue } from "../src/lib/jobs";

// Queues N edits at once and reports how the workers handled them.
// usage: tsx scripts/load-test.ts <N> [style ...]
//
// It edits COPIES of the existing demo videos (same recordings, so cached cut-outs are reused), tagged with a pool so
// only a worker started with WORKER_POOL=loadtest takes them, and it removes the copies afterwards.
const POOL = "loadtest";
const TITLES = ["How we cut our meetings in half", "Weight loss does not have to be miserable", "How advertising lost the plot", "The cab that arrived late"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secs = (ms: number | null | undefined) => (ms == null ? "   - " : `${(ms / 1000).toFixed(0).padStart(4)}s`);

type Row = { id: string; title: string; style: string; created: number; processing?: number; render?: number; ready?: number; failed?: string };

async function main() {
  const n = Math.max(1, Number(process.argv[2]) || 4);
  const styles = process.argv.slice(3);
  const db = await serviceClient();
  const { data: spaces } = await db.from("vl_workspaces").select("id").eq("is_demo", false);
  const ids = (spaces ?? []).map((w) => w.id as string);
  const { data: sources } = await db.from("vl_videos").select("id,title,workspace_id,idea_id,recording_id,template,use_case").in("workspace_id", ids).in("title", TITLES).not("recording_id", "is", null);
  const only = process.env.LOAD_ONLY; // e.g. LOAD_ONLY=advertising to use just the shortest clip
  const pool = TITLES.filter((t) => !only || t.toLowerCase().includes(only.toLowerCase())).map((t) => (sources ?? []).find((s) => s.title === t)).filter(Boolean) as NonNullable<typeof sources>;
  if (!pool.length) throw new Error("no source videos found");

  const rows: Row[] = [];
  const t0 = Date.now();
  try {
    for (let i = 0; i < n; i++) {
      const src = pool[i % pool.length];
      const style = styles.length ? styles[i % styles.length] : String(src.template);
      const { data: v, error } = await db
        .from("vl_videos")
        .insert({ workspace_id: src.workspace_id, idea_id: src.idea_id, recording_id: src.recording_id, title: `Load test ${i + 1}`, status: "queued", template: style, use_case: src.use_case })
        .select("id")
        .single();
      if (error) throw error;
      await enqueue(db, src.workspace_id, "render_video", { videoId: v.id, pool: POOL });
      rows.push({ id: v.id as string, title: `Load test ${i + 1}`, style, created: Date.now() });
    }
    console.log(`queued ${n} edits at once (${rows.map((r) => r.style).join(", ")})`);

    const deadline = Date.now() + 25 * 60_000;
    while (rows.some((r) => !r.ready && !r.failed) && Date.now() < deadline) {
      await wait(2000);
      const { data } = await db.from("vl_videos").select("id,status,error,transcript").in("id", rows.map((r) => r.id));
      for (const v of data ?? []) {
        const r = rows.find((x) => x.id === v.id)!;
        const now = Date.now();
        const stage = (v.transcript as { stage?: string } | null)?.stage;
        if (v.status === "processing" && !r.processing) r.processing = now;
        if (stage === "render" && !r.render) r.render = now;
        if (v.status === "ready" && !r.ready) r.ready = now;
        if (v.status === "failed" && !r.failed) r.failed = String(v.error ?? "failed");
      }
    }
    const wall = Date.now() - t0;

    const { data: done } = await db.from("vl_videos").select("id,render_ms,transcript").in("id", rows.map((r) => r.id));
    console.log("\nvideo          style        queue wait   prepare   render stage  total   (work time)");
    let serial = 0;
    for (const r of rows) {
      const d = (done ?? []).find((x) => x.id === r.id);
      const work = Number(d?.render_ms ?? 0);
      serial += work;
      const start = r.created;
      const total = (r.ready ?? Date.now()) - start;
      const queueWait = r.processing ? r.processing - start : null;
      const prepare = r.processing && r.render ? r.render - r.processing : null;
      const renderStage = r.render && r.ready ? r.ready - r.render : null;
      console.log(`${r.title.padEnd(14)} ${r.style.padEnd(12)} ${secs(queueWait)}      ${secs(prepare)}   ${secs(renderStage)}        ${secs(total)}   (${secs(work).trim()})${r.failed ? `  FAILED: ${r.failed}` : ""}`);
    }
    const ok = rows.filter((r) => r.ready).length;
    console.log(`\n${ok}/${n} finished. Wall time ${(wall / 1000).toFixed(0)}s. Doing them one after another would take about ${(serial / 1000).toFixed(0)}s of work.`);
    console.log(`Throughput ${(ok / (wall / 60000)).toFixed(2)} edits a minute; one at a time it is ${(ok / (serial / 60000 || 1)).toFixed(2)}.`);
  } finally {
    // the copies, their jobs and any files they left behind
    const vids = rows.map((r) => r.id);
    if (vids.length) {
      await db.from("vl_jobs").delete().eq("payload->>pool", POOL);
      const { data: left } = await db.from("vl_videos").select("output_path").in("id", vids);
      const outs = (left ?? []).map((v) => v.output_path as string | null).filter(Boolean) as string[];
      if (outs.length) await db.storage.from("vl-videos").remove(outs).catch(() => undefined);
      await db.storage.from("vl-recordings").remove(vids.flatMap((id) => ["prepared.json", "talk.mp4", "matte.webm"].map((f) => `_work/${id}/${f}`))).catch(() => undefined);
      await db.from("vl_videos").delete().in("id", vids);
    }
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
