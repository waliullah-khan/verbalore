import { serviceClient } from "../src/lib/supabase/service";

// Hits the live claim function with many claimers at once, using throwaway rows that it deletes afterwards.
// usage: tsx scripts/test-claim.ts
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function main() {
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
  const kind = "zz_claim";
  const tagged = Array.from({ length: 6 }, () => ({ workspace_id: ws!.id, kind, payload: { pool: "zz-claim-test" } }));
  try {
    await db.from("vl_jobs").insert(tagged);

    const claims = await Promise.all(Array.from({ length: 12 }, () => db.rpc("vl_claim_job", { kinds: [kind], pool: "zz-claim-test" })));
    const got = claims.flatMap((c) => (c.data as { id: string }[] | null) ?? []);
    ok(got.length === 6, `12 claimers took all 6 jobs and not more (took ${got.length})`);
    ok(new Set(got.map((g) => g.id)).size === got.length, "no job was claimed twice");

    // the way the older workers call it: no pool, so tagged jobs stay invisible to them
    await db.from("vl_jobs").update({ status: "queued", locked_at: null }).eq("kind", kind);
    const old = await db.rpc("vl_claim_job", { kinds: [kind] });
    ok(!old.error && ((old.data as unknown[]) ?? []).length === 0, "a claimer with no pool does not see tagged jobs");

    await db.from("vl_jobs").insert({ workspace_id: ws!.id, kind });
    const plain = await db.rpc("vl_claim_job", { kinds: [kind] });
    ok(!plain.error && ((plain.data as unknown[]) ?? []).length === 1, "the old call style still claims an untagged job");

    // the stuck-job sweep: a running job with an old lease goes back in the queue, then fails after three tries
    const { data: stuck } = await db.from("vl_jobs").insert({ workspace_id: ws!.id, kind, status: "running", attempts: 1, locked_at: new Date(Date.now() - 20 * 60_000).toISOString() }).select("id").single();
    const s1 = await db.rpc("vl_sweep_stuck_jobs");
    const mine1 = ((s1.data as { job_id: string; was_requeued: boolean }[]) ?? []).find((r) => r.job_id === stuck!.id);
    ok(!!mine1 && mine1.was_requeued, "a job stuck for 20 minutes is put back in the queue");
    await db.from("vl_jobs").update({ status: "running", attempts: 3, locked_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("id", stuck!.id);
    const s2 = await db.rpc("vl_sweep_stuck_jobs");
    const mine2 = ((s2.data as { job_id: string; was_requeued: boolean }[]) ?? []).find((r) => r.job_id === stuck!.id);
    const { data: after } = await db.from("vl_jobs").select("status,error").eq("id", stuck!.id).single();
    ok(!!mine2 && !mine2.was_requeued && after?.status === "failed", `after three tries it fails with a reason ("${(after?.error ?? "").slice(0, 60)}")`);
    const fresh = await db.rpc("vl_sweep_stuck_jobs");
    ok(!((fresh.data as unknown[]) ?? []).some((r) => (r as { job_id: string }).job_id === stuck!.id), "sweeping again changes nothing (safe to run on every replica)");
  } finally {
    await db.from("vl_jobs").delete().eq("kind", kind);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
