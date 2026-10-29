import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { serviceClient } from "../src/lib/supabase/service";
import { enqueue } from "../src/lib/jobs";
import { adminEmails } from "../src/lib/access";

// Puts a recorded clip through the same edit as the Studio and saves it in a workspace's Library.
// usage: tsx scripts/add-video.ts <video file> "<title>" [template] [demo]
//   template: editorial, kinetic, product, listing, terminal or boardroom
//   the clip goes to the first ADMIN_EMAILS workspace, or the demo workspace when the last argument is "demo"
const [file, title, template = "editorial", target] = process.argv.slice(2);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!file || !title) throw new Error('usage: tsx scripts/add-video.ts <file> "<title>" [template] [demo]');
  const db = await serviceClient();

  let workspaceId: string;
  if (target === "demo") {
    const { data } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
    workspaceId = data!.id;
  } else {
    const email = adminEmails()[0];
    if (!email) throw new Error("Set ADMIN_EMAILS, or pass demo as the last argument");
    const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
    const user = users.users.find((u) => u.email?.toLowerCase() === email);
    if (!user) throw new Error("Run scripts/make-admin.ts first");
    const { data: m } = await db.from("vl_members").select("workspace_id").eq("user_id", user.id).limit(1).single();
    workspaceId = m!.workspace_id;
  }

  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim()) || 0;
  const { data: idea, error: iErr } = await db
    .from("vl_ideas")
    .insert({ workspace_id: workspaceId, angle: title, hook: title, why_now: "", score: 0, status: "note", use_case: "general", evidence: [], script: { title, beats: [] } })
    .select("id")
    .single();
  if (iErr) throw iErr;

  const path = `${workspaceId}/${idea.id}/${Date.now()}.mp4`;
  const up = await db.storage.from("vl-recordings").upload(path, readFileSync(file), { contentType: "video/mp4" });
  if (up.error) throw up.error;
  const { data: rec } = await db.from("vl_recordings").insert({ workspace_id: workspaceId, idea_id: idea.id, path, duration_s: Math.round(seconds) }).select("id").single();
  const { data: video } = await db
    .from("vl_videos")
    .insert({ workspace_id: workspaceId, idea_id: idea.id, recording_id: rec!.id, title: title.slice(0, 90), template, use_case: "general" })
    .select("id")
    .single();
  await enqueue(db, workspaceId, "render_video", { videoId: video!.id });
  console.log("queued", title, `(${Math.round(seconds)}s, ${template})`);

  for (;;) {
    await wait(4000);
    const { data: v } = await db.from("vl_videos").select("status,error,output_path,render_ms").eq("id", video!.id).single();
    if (v?.status === "ready") return console.log(`READY in ${Math.round((v.render_ms ?? 0) / 1000)}s`);
    if (v?.status === "failed") throw new Error(v.error ?? "render failed");
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
