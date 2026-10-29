import { serviceClient } from "../src/lib/supabase/service";
import { handlers, RENDER_KINDS, type Job } from "./handlers";

const POLL = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
