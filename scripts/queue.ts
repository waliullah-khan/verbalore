import { serviceClient } from "../src/lib/supabase/service";
import { enqueue, type JobKind } from "../src/lib/jobs";

// usage: tsx scripts/queue.ts generate_ideas '{"useCase":"real_estate"}'
async function main() {
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
  const id = await enqueue(db, ws!.id, process.argv[2] as JobKind, process.argv[3] ? JSON.parse(process.argv[3]) : {});
  console.log("queued", id);
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data: j } = await db.from("vl_jobs").select("status,result,error").eq("id", id).single();
    if (j!.status === "done") return console.log("done", JSON.stringify(j!.result));
    if (j!.status === "failed") throw new Error(j!.error ?? "failed");
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
