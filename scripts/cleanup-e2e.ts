import { serviceClient } from "../src/lib/supabase/service";

// Removes any account a sign-up test left behind (addresses like e2e-signup-<time>@example.com) and everything it made.
async function main() {
  const db = await serviceClient();
  const { data: people } = await db.from("vl_profiles").select("user_id,workspace_id,email").like("email", "e2e-signup-%@example.com");
  for (const p of people ?? []) {
    const wid = p.workspace_id as string | null;
    if (wid) {
      const { data: recs } = await db.from("vl_recordings").select("path").eq("workspace_id", wid);
      if (recs?.length) await db.storage.from("vl-recordings").remove(recs.map((r) => r.path as string));
      await db.from("vl_publish_jobs").delete().eq("workspace_id", wid);
      for (const t of ["vl_jobs", "vl_signal_watches", "vl_brain_docs", "vl_videos", "vl_recordings", "vl_ideas", "vl_members"]) await db.from(t).delete().eq("workspace_id", wid);
      await db.from("vl_profiles").delete().eq("workspace_id", wid);
      await db.from("vl_workspaces").delete().eq("id", wid);
    }
    await db.auth.admin.deleteUser(p.user_id as string);
    console.log("removed", p.email);
  }
  const { count } = await db.from("vl_profiles").select("user_id", { count: "exact", head: true }).like("email", "e2e-signup-%");
  console.log(`test accounts left: ${count ?? 0}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
