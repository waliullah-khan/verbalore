import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "../src/lib/supabase/service";
import { handlers, RENDER_KINDS, PREPARE_KINDS, FINAL_KINDS, type Job } from "./handlers";
import { isAdminWorkspace } from "./admin";
import { allowanceMessage, videoAllowance } from "../src/lib/allowance";
import { adminEmails } from "../src/lib/access";
import { markScriptFailed } from "../src/lib/scripts/job";

const POLL = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A public demo signs anyone in, and these jobs spend real provider credits. JOB_LIMIT_PER_HOUR caps how many
// a single workspace can run per hour; unset means no cap, which is what you want on your own machine.
const LIMIT = Number(process.env.JOB_LIMIT_PER_HOUR ?? 0);
const COSTLY = ["generate_ideas", "scan_signals", "render_video", "render_note", "publish_video", "onboard_workspace", "write_script"];

const DAILY = Number(process.env.FREE_DAILY_JOBS ?? 0);

async function usedSince(db: SupabaseClient, job: Job, ms: number) {
  const { count } = await db
    .from("vl_jobs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", job.workspace_id)
    .in("kind", COSTLY)
    .in("status", ["running", "done"])
    .neq("id", job.id)
    .gte("locked_at", new Date(Date.now() - ms).toISOString());
  return count ?? 0;
}

async function overLimit(db: SupabaseClient, job: Job): Promise<string | null> {
  if (!job.workspace_id || !COSTLY.includes(job.kind)) return null;
  if (await isAdminWorkspace(db, job.workspace_id)) return null;
  if (LIMIT && (await usedSince(db, job, 3_600_000)) >= LIMIT) return `This workspace can run ${LIMIT} background jobs an hour and that limit was reached. Try again in a while.`;
  if (DAILY && (await usedSince(db, job, 86_400_000)) >= DAILY) return `You have used today’s ${DAILY} included runs. Come back tomorrow, or add your own keys to keep going.`;
  return null;
}

// One daily ceiling for the whole service, so the bill has an upper bound however many accounts there are.
// Admin workspaces are left out of the count and never refused. GLOBAL_DAILY_JOBS=0 turns it off.
const GLOBAL = process.env.GLOBAL_DAILY_JOBS === undefined ? 200 : Number(process.env.GLOBAL_DAILY_JOBS);
let adminSpaces: { at: number; ids: string[] } = { at: 0, ids: [] };

async function adminWorkspaceIds(db: SupabaseClient): Promise<string[]> {
  if (Date.now() - adminSpaces.at < 300_000) return adminSpaces.ids;
  const emails = adminEmails();
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const owners = (data?.users ?? []).filter((u) => u.email && emails.includes(u.email.toLowerCase())).map((u) => u.id);
  const { data: spaces } = owners.length ? await db.from("vl_workspaces").select("id").in("owner_id", owners) : { data: [] as { id: string }[] };
  adminSpaces = { at: Date.now(), ids: (spaces ?? []).map((w) => w.id as string) };
  return adminSpaces.ids;
}

async function overGlobalLimit(db: SupabaseClient, job: Job): Promise<string | null> {
  if (!GLOBAL || !job.workspace_id || !COSTLY.includes(job.kind)) return null;
  const admins = await adminWorkspaceIds(db);
  if (admins.includes(job.workspace_id)) return null;
  let q = db.from("vl_jobs").select("id", { count: "exact", head: true }).in("kind", COSTLY).in("status", ["running", "done"]).neq("id", job.id).gte("locked_at", new Date(Date.now() - 86_400_000).toISOString());
  if (admins.length) q = q.not("workspace_id", "in", `(${admins.join(",")})`);
  const { count } = await q;
  return (count ?? 0) >= GLOBAL ? "Verbalore has reached its limit for today and is paused until tomorrow. Please try again then." : null;
}

// A first-time video needs a free slot. An edit that already has a file is a re-edit and never counts.
async function overVideoAllowance(db: SupabaseClient, job: Job): Promise<string | null> {
  const videoId = job.payload?.videoId as string | undefined;
  if (job.kind !== "render_video" || !job.workspace_id || !videoId) return null;
  const { data: v } = await db.from("vl_videos").select("output_path").eq("id", videoId).maybeSingle();
  if (!v || v.output_path) return null;
  const { data: ws } = await db.from("vl_workspaces").select("id,is_demo").eq("id", job.workspace_id).maybeSingle();
  if (!ws) return null;
  const a = await videoAllowance(db, ws, await isAdminWorkspace(db, ws.id));
  // this video is already among the ones counted
  return a.unlimited || a.used <= a.limit ? null : allowanceMessage(a.limit);
}

// Which jobs this worker serves: the live queue by default, or only jobs queued with a given tag (load tests, trials).
const POOL = process.env.WORKER_POOL || null;
let stopping = false;
const holding = new Set<string>(); // jobs this process has claimed and not yet finished

async function lane(name: string, kinds: () => string[], quiet = false) {
  const db = await serviceClient();
  if (!quiet) console.log(`[${name}] watching`, kinds().join(", "));
  while (!stopping) {
    const wanted = kinds();
    const { data, error } = await db.rpc("vl_claim_job", POOL ? { kinds: wanted, pool: POOL } : { kinds: wanted });
    const job = (data as Job[] | null)?.[0];
    if (error || !job) {
      if (error) console.error(`[${name}] claim failed:`, error.message);
      await sleep(POLL);
      continue;
    }
    holding.add(job.id);
    const limited = (await overLimit(db, job)) ?? (await overVideoAllowance(db, job)) ?? (await overGlobalLimit(db, job));
    if (limited) {
      console.warn(`[${name}] ${job.kind} ${job.id.slice(0, 8)} refused: hourly limit`);
      await db.from("vl_jobs").update({ status: "failed", error: limited }).eq("id", job.id);
      // the page watches the video, not the job, so a refused edit has to say so there too
      const videoId = (job.payload as { videoId?: string } | null)?.videoId;
      if (videoId && (job.kind === "render_video" || job.kind === "render_note" || job.kind === "render_final")) {
        const { data: v } = await db.from("vl_videos").select("output_path").eq("id", videoId).maybeSingle();
        // a video that already has an edit stays watchable; only one with nothing yet is marked failed
        await db.from("vl_videos").update({ status: v?.output_path ? "ready" : "failed", error: limited }).eq("id", videoId);
      }
      // a script that was never written must say so on its page, not stay on "writing"
      if (job.kind === "write_script") {
        const p = job.payload as { ideaId?: string; noteId?: string; kind?: "signal" | "note"; signalId?: string };
        await markScriptFailed(db, p, limited);
      }
      holding.delete(job.id);
      continue;
    }
    const t0 = Date.now();
    console.log(`[${name}] ${job.kind} ${job.id.slice(0, 8)} started`);
    try {
      const result = await handlers[job.kind](db, job);
      await db.from("vl_jobs").update({ status: "done", result, error: null }).eq("id", job.id);
      console.log(`[${name}] ${job.kind} done in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[${name}] ${job.kind} failed:`, message);
      await db.from("vl_jobs").update({ status: "failed", error: message.slice(0, 500) }).eq("id", job.id);
    } finally {
      holding.delete(job.id);
    }
  }
}

// A job that its worker died on stays 'running' for ever. Any worker may run this once a minute: it is safe to repeat,
// puts the job back in the queue, and after three tries fails it and says so where the person is looking.
async function sweep(db: SupabaseClient) {
  const { data, error } = await db.rpc("vl_sweep_stuck_jobs");
  if (error) return console.error("[sweep] failed:", error.message);
  type Swept = { job_id: string; job_kind: string; job_payload: { videoId?: string; ideaId?: string; noteId?: string; kind?: "signal" | "note"; signalId?: string } | null; was_requeued: boolean };
  for (const r of (data ?? []) as Swept[]) {
    console.warn(`[sweep] ${r.job_kind} ${r.job_id.slice(0, 8)} ${r.was_requeued ? "was stuck, put back in the queue" : "failed after three tries"}`);
    if (r.was_requeued) continue;
    const reason = "The editor stopped before this finished, and it was tried three times.";
    const videoId = r.job_payload?.videoId;
    if (videoId && (r.job_kind === "render_video" || r.job_kind === "render_final")) {
      const { data: v } = await db.from("vl_videos").select("output_path").eq("id", videoId).maybeSingle();
      await db.from("vl_videos").update({ status: v?.output_path ? "ready" : "failed", error: reason }).eq("id", videoId);
    }
    if (r.job_kind === "write_script" && r.job_payload) await markScriptFailed(db, r.job_payload, reason);
  }
}

// On a deploy or a scale-down the worker stops taking jobs, lets the running ones finish, and gives back any it cannot.
const DRAIN_MS = Number(process.env.WORKER_DRAIN_MS ?? 110_000);
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal}: taking no new jobs, waiting up to ${Math.round(DRAIN_MS / 1000)}s for ${holding.size} running`);
  const deadline = Date.now() + DRAIN_MS;
  while (holding.size && Date.now() < deadline) await sleep(1000);
  if (holding.size) {
    const db = await serviceClient();
    await db.from("vl_jobs").update({ status: "queued", locked_at: null }).in("id", [...holding]).eq("status", "running");
    console.warn(`[worker] gave ${holding.size} unfinished job(s) back to the queue`);
  }
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Three lanes, each with its own number of jobs at once. Preparing an edit mostly waits on other services, so many
// run together; rendering needs the CPU, so a machine runs few and more machines are added; research is network bound.
const num = (key: string, fallback: number) => Math.max(1, Math.floor(Number(process.env[key])) || fallback);
const PREPARE_N = num("PREPARE_CONCURRENCY", 4);
const RENDER_N = num("RENDER_CONCURRENCY", 1);
const WORK_N = num("WORK_CONCURRENCY", 3);

const general = () => Object.keys(handlers).filter((k) => !RENDER_KINDS.includes(k));
const prepareKinds = () => PREPARE_KINDS.filter((k) => k in handlers);
const finalKinds = () => FINAL_KINDS.filter((k) => k in handlers);
const loops = (n: number, name: string, kinds: () => string[]) => Array.from({ length: n }, (_, i) => lane(name, kinds, i > 0));

console.log(`[worker] prepare x${PREPARE_N}, render x${RENDER_N}, work x${WORK_N}${POOL ? `, pool "${POOL}"` : ""}`);
Promise.all([...loops(PREPARE_N, "prepare", prepareKinds), ...loops(RENDER_N, "render", finalKinds), ...loops(WORK_N, "work", general)]).catch((e) => {
  console.error(e);
  process.exit(1);
});

(async () => {
  const db = await serviceClient();
  await sleep(30_000);
  while (!stopping) {
    await sweep(db).catch((e) => console.error("[sweep] failed:", (e as Error).message));
    await sleep(60_000);
  }
})();
