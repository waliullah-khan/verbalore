import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "../src/lib/supabase/service";
import { handlers, RENDER_KINDS, type Job } from "./handlers";
import { isAdmin } from "../src/lib/access";

const POLL = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A public demo signs anyone in, and these jobs spend real provider credits. JOB_LIMIT_PER_HOUR caps how many
// a single workspace can run per hour; unset means no cap, which is what you want on your own machine.
const LIMIT = Number(process.env.JOB_LIMIT_PER_HOUR ?? 0);
const COSTLY = ["generate_ideas", "scan_signals", "render_video", "render_note", "publish_video"];

const DAILY = Number(process.env.FREE_DAILY_JOBS ?? 0);
const adminWorkspace = new Map<string, boolean>();

// Admins are never limited. Everyone else, the public demo included, gets a daily allowance.
async function isAdminWorkspace(db: SupabaseClient, workspaceId: string) {
  const known = adminWorkspace.get(workspaceId);
  if (known !== undefined) return known;
  const { data: ws } = await db.from("vl_workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
  let admin = false;
  if (ws?.owner_id) {
    const { data } = await db.auth.admin.getUserById(ws.owner_id);
    admin = isAdmin(data.user?.email);
  }
  adminWorkspace.set(workspaceId, admin);
  return admin;
}

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

async function lane(name: string, kinds: () => string[]) {
  const db = await serviceClient();
  console.log(`[${name}] watching`, kinds().join(", "));
  for (;;) {
    const wanted = kinds();
    const { data, error } = await db.rpc("vl_claim_job", { kinds: wanted });
    const job = (data as Job[] | null)?.[0];
    if (error || !job) {
      if (error) console.error(`[${name}] claim failed:`, error.message);
      await sleep(POLL);
      continue;
    }
    const limited = await overLimit(db, job);
    if (limited) {
      console.warn(`[${name}] ${job.kind} ${job.id.slice(0, 8)} refused: hourly limit`);
      await db.from("vl_jobs").update({ status: "failed", error: limited }).eq("id", job.id);
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
    }
  }
}

// Renders are heavy, so they get their own lane and never wait behind research, and vice versa.
const general = () => Object.keys(handlers).filter((k) => !RENDER_KINDS.includes(k));
Promise.all([lane("render", () => RENDER_KINDS.filter((k) => k in handlers)), lane("work", general)]).catch((e) => {
  console.error(e);
  process.exit(1);
});
