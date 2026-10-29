import Link from "next/link";
import { redirect } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import SubmitButton from "@/components/studio/SubmitButton";
import { activeJobs, enqueue } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { normaliseWebsite } from "@/lib/access";
import { isPublicHttpUrl } from "@/lib/brain/ingest";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const STEPS: [string, string][] = [
  ["website", "Reading your website"],
  ["linkedin", "Reading your LinkedIn"],
  ["brain", "Writing your brand brain"],
  ["signals", "Choosing signals to watch"],
  ["ideas", "Finding your first ideas"],
];
const DAILY_TRIES = 3;

async function start(formData: FormData) {
  "use server";
  const { db, ws, user } = await currentWorkspace();
  const { data: profile } = await db.from("vl_profiles").select("linkedin_url").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/home");

  let website: string | null = null;
  if (formData.get("none") !== "yes") {
    const raw = String(formData.get("website") ?? "");
    website = normaliseWebsite(raw);
    if (!website || !isPublicHttpUrl(website)) redirect("/welcome?error=website");
  }

  if ((await activeJobs(db, ws.id, ["onboard_workspace"])).length) redirect("/welcome");
  const { count } = await db
    .from("vl_jobs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws.id)
    .eq("kind", "onboard_workspace")
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= DAILY_TRIES) redirect("/welcome?error=tries");

  await enqueue(db, ws.id, "onboard_workspace", { website, linkedin: profile.linkedin_url });
  redirect("/welcome");
}

export default async function Welcome({ searchParams }: { searchParams: { error?: string } }) {
  const { db, ws, user } = await currentWorkspace();
  if (ws.is_demo) redirect("/home");
  const { data: profile } = await db.from("vl_profiles").select("full_name,email,linkedin_url,website,onboarded_at").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/home");

  const { data: job } = await db
    .from("vl_jobs")
    .select("id,status,result,error,payload,created_at")
    .eq("workspace_id", ws.id)
    .eq("kind", "onboard_workspace")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = (job?.result ?? {}) as { step?: string; company?: string; niche?: string; useCaseLabel?: string; source?: string; ideasJobId?: string };
  const working = job?.status === "queued" || job?.status === "running";
  const done = job?.status === "done";

  // the first ideas are written right after the brain; the page waits for them, but never for long
  let ideasRunning = false;
  if (done && result.ideasJobId) {
    const { data: ideas } = await db.from("vl_jobs").select("status,created_at").eq("id", result.ideasJobId).maybeSingle();
    ideasRunning = (ideas?.status === "queued" || ideas?.status === "running") && Date.now() - new Date(ideas.created_at).getTime() < 4 * 60_000;
  }
  if (done && !ideasRunning) redirect("/home");
  if (!job && profile.onboarded_at) redirect("/home");

  const current = done ? "ideas" : working ? result.step ?? "website" : "";
  const at = STEPS.findIndex(([k]) => k === current);
  const skippedWebsite = !!job && !(job.payload as { website?: string | null } | null)?.website;
  const failed = job?.status === "failed";
  const error =
    searchParams.error === "website" ? "That does not look like a website address. Try something like acme.com, or tick the box if you do not have one."
    : searchParams.error === "tries" ? "You have tried a few times today. Please come back tomorrow, or write to us."
    : null;

  return (
    <main className="mx-auto grid min-h-screen max-w-2xl content-center gap-6 px-4 py-10">
      <div>
        <Link href="/" className="display text-[1.6rem]">Verbalore</Link>
        <p className="eyebrow mt-8">Welcome, {profile.full_name.split(" ")[0] || "there"}</p>
        <h1 className="mt-2 text-[2.2rem] md:text-[2.8rem]">{working || done ? "Learning your business." : "One more thing."}</h1>
      </div>

      <section className="card grid gap-3">
        <p className="label">Your account</p>
        <p><b>{profile.full_name}</b><br /><span className="muted">{profile.email}</span></p>
        <p className="muted break-all text-sm">{profile.linkedin_url}</p>
      </section>

      {!working && !done && (
        <form action={start} className="card grid gap-4">
          {failed && (
            <p role="alert" className="text-sm font-bold" style={{ color: "var(--warn)" }}>
              {job?.error || "That did not work."} You can try again, with a website if you have one.
            </p>
          )}
          <div>
            <label htmlFor="website" className="label">Your company website</label>
            <input id="website" name="website" inputMode="url" autoComplete="url" placeholder="acme.com" defaultValue={profile.website ?? ""} className="lf" />
            <p className="muted mt-1 text-xs">We read your site, and your LinkedIn, to learn what you do and who you sell to.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="none" value="yes" /> I do not have a company website
          </label>
          {error && <p role="alert" className="text-sm font-bold" style={{ color: "var(--warn)" }}>{error}</p>}
          <SubmitButton className="btn btn-primary" busy="Starting…">{failed ? "Try again" : "Build my brand brain"}</SubmitButton>
          <p className="muted text-xs">Without a website we use your LinkedIn alone, which gives us less to go on.</p>
        </form>
      )}

      {(working || done) && (
        <section className="card grid gap-3" aria-live="polite">
          <AutoRefresh active every={2500} />
          <ol className="grid gap-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {STEPS.map(([key, label], i) => {
              const state = i < at || (done && key !== "ideas") ? "done" : i === at ? "active" : "wait";
              const skipped = key === "website" && skippedWebsite && state === "done";
              return (
                <li key={key} className="flex items-center gap-3" style={{ opacity: state === "wait" ? 0.5 : 1 }}>
                  <span
                    aria-hidden="true"
                    style={{ display: "grid", placeItems: "center", width: "1.7rem", height: "1.7rem", borderRadius: "50%", border: "2px solid currentColor", fontSize: ".8rem", fontWeight: 700,
                      background: state === "done" ? "var(--ok)" : "transparent", color: state === "done" ? "var(--surf)" : state === "active" ? "var(--acc)" : "var(--ink2)" }}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span style={{ fontWeight: state === "active" ? 700 : 400 }}>
                    {label}{state === "active" ? "…" : ""}{skipped ? " (skipped, no website)" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          {done && (
            <p className="muted text-sm">
              {result.company ? <>We read <b>{result.company}</b> as <b>{result.useCaseLabel}</b>, in the market of “{result.niche}”. </> : null}
              {result.source}
            </p>
          )}
          {working && <p className="muted text-xs">This usually takes a minute or two. You can leave this page open.</p>}
        </section>
      )}
    </main>
  );
}
