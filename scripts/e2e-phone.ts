import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "../src/lib/supabase/service";

// Plays the phone's part against a running app: open the link, upload through a signed URL, finish.
const base = "http://localhost:3000";
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function main() {
  const clip = process.argv[2];
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
  const { data: idea } = await db.from("vl_ideas").select("id,angle").eq("workspace_id", ws!.id).neq("status", "note").limit(1).single();
  const { data: s } = await db.from("vl_capture_sessions").insert({ workspace_id: ws!.id, idea_id: idea!.id }).select("token").single();
  const t = s!.token as string;

  // 1. the phone opens the link without signing in
  const page = await fetch(`${base}/r/${t}`);
  const html = await page.text();
  ok(page.status === 200 && html.includes("Record on your phone") || html.includes("fixed inset-0") || html.includes(idea!.angle.slice(0, 20)), `phone page loads without login (${page.status})`);

  // 2. status and script
  const st = await (await fetch(`${base}/api/capture/${t}`)).json();
  ok(st.status === "waiting" && Array.isArray(st.beats) && st.beats.length >= 2, `status is waiting and carries ${st.beats?.length} script beats`);

  // 3. bad tokens are refused
  ok((await fetch(`${base}/api/capture/${"0".repeat(32)}`)).status === 404, "unknown token is 404");
  ok((await fetch(`${base}/r/${"0".repeat(32)}`)).status === 200, "unknown token page renders a message, not an error");

  // 4. sign, upload with the anon key like a browser would, then finish
  const sign = await (await fetch(`${base}/api/capture/${t}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "sign", ext: "mp4" }) })).json();
  ok(!!sign.path && !!sign.token && sign.path.startsWith(`${ws!.id}/${idea!.id}/phone-`), "signed upload path is inside the session's own folder");

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const up = await anon.storage.from("vl-recordings").uploadToSignedUrl(sign.path, sign.token, readFileSync(clip), { contentType: "video/mp4" });
  ok(!up.error, `anon client uploads through the signed URL${up.error ? ": " + up.error.message : ""}`);

  const bad = await fetch(`${base}/api/capture/${t}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "done", path: `${ws!.id}/other-idea/phone-1.mp4`, durationS: 5 }) });
  ok(bad.status === 400, "finishing with a path outside the session is refused");

  // anon must not be able to write anywhere else
  const sneaky = await anon.storage.from("vl-recordings").upload(`${ws!.id}/${idea!.id}/direct.mp4`, readFileSync(clip), { contentType: "video/mp4" });
  ok(!!sneaky.error, "anon cannot upload directly without a signed URL");

  const done = await fetch(`${base}/api/capture/${t}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "done", path: sign.path, durationS: 24 }) });
  ok(done.ok, "done is accepted");

  // 5. the desktop sees it
  const after = await (await fetch(`${base}/api/capture/${t}`)).json();
  ok(after.status === "uploaded" && after.path === sign.path && !!after.previewUrl, "desktop poll now reports uploaded with a preview URL");
  if (!after.previewUrl) console.log("   api returned:", JSON.stringify({ ...after, beats: undefined }));
  const head = await fetch(after.previewUrl, { method: "HEAD" });
  ok(head.ok, `preview URL plays (${head.status}, ${head.headers.get("content-length")} bytes)`);

  // 6. an expired link is refused
  await db.from("vl_capture_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("token", t);
  ok((await fetch(`${base}/api/capture/${t}`)).status === 410, "expired link is 410");
  ok((await fetch(`${base}/api/capture/${t}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "sign" }) })).status === 410, "expired link cannot sign uploads");
}
main().catch((e) => { console.error(e); process.exit(1); });
