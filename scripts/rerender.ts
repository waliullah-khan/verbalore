import { serviceClient } from "../src/lib/supabase/service";
import { enqueue } from "../src/lib/jobs";

// Queues a fresh edit of existing videos in the given styles, two at a time, and waits for each.
// usage: tsx scripts/rerender.ts "<title>=<style>" ...
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const wanted = process.argv.slice(2).map((a) => {
    const i = a.lastIndexOf("=");
    return { title: a.slice(0, i), style: a.slice(i + 1) };
  });
  if (!wanted.length) throw new Error('usage: tsx scripts/rerender.ts "<title>=<style>" ...');
  const db = await serviceClient();
  const { data: spaces } = await db.from("vl_workspaces").select("id").eq("is_demo", false);
  const ids = (spaces ?? []).map((w) => w.id);

  const jobs = [];
  for (const w of wanted) {
    const { data: v } = await db.from("vl_videos").select("id,workspace_id,transcript,recording_id").in("workspace_id", ids).eq("title", w.title).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!v?.recording_id) { console.log("skip (no video or recording):", w.title); continue; }
    jobs.push({ ...w, video: v });
  }

  for (let i = 0; i < jobs.length; i += 2) {
    const batch = jobs.slice(i, i + 2);
    for (const j of batch) {
      const transcript = { ...((j.video.transcript as Record<string, unknown> | null) ?? {}) };
      delete transcript.plan_override;
      await db.from("vl_videos").update({ status: "queued", template: j.style, error: null, transcript }).eq("id", j.video.id);
      await enqueue(db, j.video.workspace_id, "render_video", { videoId: j.video.id });
      console.log("queued", j.title, `(${j.style})`);
    }
    await Promise.all(batch.map(async (j) => {
      for (;;) {
        await wait(5000);
        const { data: v } = await db.from("vl_videos").select("status,error,render_ms").eq("id", j.video.id).single();
        if (v?.status === "ready") return console.log(`READY ${j.title} in ${Math.round((v.render_ms ?? 0) / 1000)}s`);
        if (v?.status === "failed") return console.log(`FAILED ${j.title}: ${v.error}`);
      }
    }));
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
