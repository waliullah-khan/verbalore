import Link from "next/link";
import { revalidatePath } from "next/cache";
import AutoRefresh from "@/components/AutoRefresh";
import { activeJobs, enqueue } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { PLAYBOOKS, isUseCase, playbook, THEMES } from "@/lib/usecases";
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

export default async function Ideas({ searchParams }: { searchParams: { uc?: string } }) {
  const { db, ws } = await currentWorkspace();
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

  return (
    <div>
      <AutoRefresh active={allRunning.length > 0} />

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Use case">
        {PLAYBOOKS.map((p) => (
          <Link
            key={p.id}
            href={`/ideas?uc=${p.id}`}
            role="tab"
            aria-selected={p.id === uc}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${p.id === uc ? "bg-[var(--ink)] text-[var(--paper)]" : "hover:bg-[var(--paper-2)]"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{latest ? new Date(latest.day + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Today"}</p>
          <h1 className="mt-1 text-4xl">{pb.label}</h1>
          <p className="muted mt-2 max-w-xl">{pb.tagline}</p>
        </div>
        <form action={generate}>
          <input type="hidden" name="uc" value={uc} />
          <button className="btn btn-primary" disabled={running.length > 0}>{running.length ? "Researching…" : "Find new ideas"}</button>
        </form>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {pb.formats.map((f) => (
          <span key={f.name} className="chip" title={f.pattern}>{f.name}</span>
        ))}
        <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          Edits: {pb.themes.map((t) => THEMES[t].label).join(" · ")}
        </span>
      </div>

      <div className="mt-8 grid gap-4">
        {(ideas as (Idea & { id: string })[] | null)?.map((idea) => (
          <Link key={idea.id} href={`/ideas/${idea.id}`} className="card block transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl leading-snug">{idea.hook}</h2>
              <span className="chip shrink-0">{idea.score}</span>
            </div>
            <p className="muted mt-2 text-sm">{idea.why_now}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip">{idea.script.method}</span>
              {Array.from(new Set(idea.evidence.map((e) => e.platform))).map((p) => (
                <span key={p} className="chip">{p}</span>
              ))}
              <span className="chip">{idea.script.totalSeconds}s</span>
              {idea.evidence.some((e) => e.synthetic) && <span className="chip">sample data</span>}
            </div>
          </Link>
        ))}
        {!ideas?.length && !running.length && (
          <div className="card text-center">
            <p className="display text-xl">No {pb.label.toLowerCase()} ideas yet</p>
            <p className="muted mt-1 text-sm">Press “Find new ideas”. The research runs in the background and takes about a minute.</p>
          </div>
        )}
      </div>
    </div>
  );
}
