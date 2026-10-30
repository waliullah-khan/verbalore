import { revalidatePath } from "next/cache";
import AutoRefresh from "@/components/AutoRefresh";
import JobNotice from "@/components/JobNotice";
import IdeaBanner from "@/components/studio/IdeaBanner";
import IdeaCards, { type IdeaCardData } from "@/components/studio/IdeaCards";
import IdeaGreeting from "@/components/studio/IdeaGreeting";
import IdeaTabs from "@/components/studio/IdeaTabs";
import { activeJobs, enqueue } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { serviceClient } from "@/lib/supabase/service";
import { loadActivity, multiplier, streaks } from "@/lib/game";
import { PLAYBOOKS, isUseCase, playbook, THEMES } from "@/lib/usecases";
import { STRENGTH, sentence, strengthOf } from "@/lib/ideas/strength";
import type { Idea } from "@/lib/ideas/types";

async function generate(formData: FormData) {
  "use server";
  const { db, ws } = await currentWorkspace();
  const raw = String(formData.get("uc") ?? "general");
  const useCase = isUseCase(raw) ? raw : "general";
  const running = await activeJobs(db, ws.id, ["generate_ideas"]);
  if (!running.some((j) => (j.payload as { useCase?: string }).useCase === useCase)) {
    await enqueue(db, ws.id, "generate_ideas", { count: 5, useCase });
  }
  revalidatePath("/ideas");
}

// A first name for the greeting, from what the person told us when they asked for access. Nobody is guessed at.
async function firstName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const meta = String(user.user_metadata?.full_name ?? "").trim().split(/\s+/)[0];
  if (meta) return meta;
  if (!user.email) return "";
  const svc = await serviceClient();
  const { data } = await svc.from("vl_access_requests").select("full_name").ilike("email", user.email).maybeSingle();
  return String(data?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
}

export default async function Ideas({ searchParams }: { searchParams: { uc?: string } }) {
  const { db, ws, user } = await currentWorkspace();
  const uc = isUseCase(searchParams.uc) ? searchParams.uc : "gtm";
  const pb = playbook(uc);

  const { data: latest } = await db
    .from("vl_ideas").select("day").eq("workspace_id", ws.id).eq("use_case", uc)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: ideas } = latest
    ? await db.from("vl_ideas").select("*").eq("workspace_id", ws.id).eq("use_case", uc).eq("day", latest.day).order("score", { ascending: false })
    : { data: [] };
  const allRunning = await activeJobs(db, ws.id, ["generate_ideas"]);
  const running = allRunning.filter((j) => (j.payload as { useCase?: string }).useCase === uc);

  const [name, activity] = await Promise.all([firstName(user), loadActivity(db, ws.id)]);
  const streak = streaks(activity.videoTimes);

  const cards: IdeaCardData[] = ((ideas ?? []) as (Idea & { id: string })[]).map((idea) => {
    const str = strengthOf(idea.score);
    return {
      id: idea.id,
      hook: idea.hook,
      why: sentence(idea.why_now),
      str,
      label: STRENGTH[str].label,
      rar: STRENGTH[str].rar,
      hit: Math.round(STRENGTH[str].atk * multiplier(streak.current + 1)),
      fmt: idea.script.method,
      seconds: idea.script.totalSeconds,
      src: idea.evidence.length,
      lines: idea.script.beats.map((b) => b.text),
      sample: idea.evidence.some((e) => e.synthetic),
    };
  });

  return (
    <section className="screen" data-screen="today">
      <AutoRefresh active={allRunning.length > 0} />
      <JobNotice kinds={["generate_ideas"]} />
      <IdeaBanner />
      <IdeaGreeting name={name} posted={streak.postedToday} />

      <IdeaTabs items={PLAYBOOKS.map((p) => ({ id: p.id, label: p.label }))} current={uc} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", alignItems: "center", marginBottom: "1.25rem" }}>
        {pb.formats.map((f) => (
          <span key={f.name} className="pill" title={f.pattern}>{f.name}</span>
        ))}
        <span className="pill acc">Edits: {pb.themes.map((t) => THEMES[t].label).join(" · ")}</span>
        <form action={generate} style={{ marginLeft: "auto" }}>
          <input type="hidden" name="uc" value={uc} />
          <button className="btn primary" disabled={running.length > 0}>{running.length ? "Researching…" : "Find new ideas"}</button>
        </form>
      </div>

      {cards.length > 0 ? (
        <IdeaCards cards={cards} />
      ) : (
        !running.length && (
          <div className="card" style={{ textAlign: "center" }}>
            <h3>No ideas for {pb.label} yet</h3>
            <p className="muted" style={{ marginTop: ".4rem" }}>{pb.tagline} Press “Find new ideas”. The research runs in the background and takes about a minute.</p>
          </div>
        )
      )}
    </section>
  );
}
