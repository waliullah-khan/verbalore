import { readFileSync } from "node:fs";
import { serviceClient } from "../src/lib/supabase/service";
import { enqueue } from "../src/lib/jobs";

// Queues a render the same way the Studio does, then waits for the worker to finish it.
async function main() {
  const clip = process.argv[2];
  const template = process.argv[3] ?? "editorial";
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
  const { data: idea } = await db.from("vl_ideas").select("id,hook,use_case").eq("workspace_id", ws!.id).neq("status", "note").order("created_at", { ascending: false }).limit(1).single();
  if (!idea) throw new Error("no idea to record against; generate some first");

  const path = `${ws!.id}/${idea.id}/e2e-${Date.now()}.mp4`;
  const up = await db.storage.from("vl-recordings").upload(path, readFileSync(clip), { contentType: "video/mp4" });
  if (up.error) throw up.error;
  const { data: rec } = await db.from("vl_recordings").insert({ workspace_id: ws!.id, idea_id: idea.id, path, duration_s: 24 }).select("id").single();
  const { data: video } = await db.from("vl_videos").insert({ workspace_id: ws!.id, idea_id: idea.id, recording_id: rec!.id, title: idea.hook.slice(0, 90), template, use_case: idea.use_case }).select("id").single();
  await enqueue(db, ws!.id, "render_video", { videoId: video!.id });
  console.log("queued video", video!.id, "template", template);

  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data: v } = await db.from("vl_videos").select("status,error,render_ms,output_path,duration_s,scene_plan,transcript").eq("id", video!.id).single();
    process.stdout.write(`\r${v!.status} ${Math.round((Date.now() - t0) / 1000)}s   `);
    if (v!.status === "ready") {
      console.log("\nREADY render_ms", v!.render_ms, "duration", v!.duration_s, "scenes", (v!.scene_plan as unknown[]).length, JSON.stringify(v!.transcript));
      console.log(db.storage.from("vl-videos").getPublicUrl(v!.output_path!).data.publicUrl);
      return;
    }
    if (v!.status === "failed") throw new Error(`render failed: ${v!.error}`);
    if (Date.now() - t0 > 480_000) throw new Error("timed out waiting for the worker");
  }
}
main().catch((e) => { console.error("\n", e.message); process.exit(1); });
