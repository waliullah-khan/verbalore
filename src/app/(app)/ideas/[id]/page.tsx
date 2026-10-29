import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentWorkspace } from "@/lib/workspace";
import { buildScript, type Idea } from "@/lib/ideas/types";

async function saveScript(formData: FormData) {
  "use server";
  const { db } = await currentWorkspace();
  const id = String(formData.get("id"));
  const texts = formData.getAll("beat").map(String).map((t) => t.trim()).filter(Boolean);
  if (texts.length < 2) return;
  const [hook, ...rest] = texts;
  const cta = rest.pop() as string;
  const { data: idea } = await db.from("vl_ideas").select("script").eq("id", id).single();
  await db.from("vl_ideas").update({ hook, script: buildScript(idea?.script?.method ?? "Direct", hook, rest, cta) }).eq("id", id);
  revalidatePath(`/ideas/${id}`);
}

export default async function IdeaPage({ params }: { params: { id: string } }) {
  const { db } = await currentWorkspace();
  const { data } = await db.from("vl_ideas").select("*").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const idea = data as Idea & { id: string };
  const ref = idea.reference;

  return (
    <div className="space-y-6">
      <Link href="/ideas" className="muted text-sm">← All ideas</Link>
      <div>
        <p className="eyebrow">{idea.script.method}</p>
        <h1 className="mt-1 text-4xl leading-tight">{idea.angle}</h1>
        <p className="muted mt-3 max-w-2xl">{idea.why_now}</p>
      </div>

      {ref && (
        <section className="card">
          <p className="eyebrow">Learn from this one{ref.viaJev ? " · picked by Jev" : ""}</p>
          <a href={ref.url} target="_blank" rel="noreferrer" className="display mt-2 block text-xl underline-offset-4 hover:underline">{ref.title}</a>
          <p className="muted mt-1 text-sm">{ref.platform}{ref.author && ` · ${ref.author}`} · {ref.engagement.toLocaleString()} engagement{ref.synthetic && " · sample"}</p>
          <p className="muted mt-2 text-sm">{ref.why}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="eyebrow">Hook</dt><dd className="mt-1">{ref.structure.hook}</dd></div>
            <div><dt className="eyebrow">Body</dt><dd className="mt-1">{ref.structure.body.join(" · ") || "—"}</dd></div>
            <div><dt className="eyebrow">Ending</dt><dd className="mt-1">{ref.structure.cta || "—"}</dd></div>
          </dl>
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Your script · about {idea.script.totalSeconds}s</p>
        </div>
        <p className="muted mt-1 text-sm">
          Drafted from the sources below. Before you record, check each number and claim against them, and cut anything that is not true for you.
        </p>
        <form action={saveScript} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={idea.id} />
          {idea.script.beats.map((b, i) => (
            <label key={i} className="block">
              <span className="chip">{b.label}</span>
              <textarea name="beat" defaultValue={b.text} rows={2} className="field mt-1" />
            </label>
          ))}
          <div className="flex flex-wrap gap-3 pt-1">
            <button className="btn btn-ghost">Save changes</button>
            <Link href={`/studio/${idea.id}`} className="btn btn-primary">Record this</Link>
          </div>
        </form>
      </section>

      <section>
        <p className="eyebrow">Why now</p>
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
          {idea.evidence.map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 py-2 text-sm">
              <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{e.title}</a>
              <span className="muted shrink-0">{e.platform} · {e.engagement.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
