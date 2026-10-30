import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentWorkspace } from "@/lib/workspace";
import { buildScript, type Idea } from "@/lib/ideas/types";
import { STRENGTH, sentence, strengthOf } from "@/lib/ideas/strength";
import ProjectCookie from "@/components/studio/IdeaProject";
import Sticker from "@/components/studio/Sticker";

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
  const str = strengthOf(idea.score);

  return (
    <section className="screen" data-screen="today">
      <ProjectCookie id={idea.id} />
      <p style={{ marginBottom: ".75rem" }}>
        <Link href="/ideas" className="btn quiet sm">Back to today&apos;s ideas</Link>
      </p>

      <article className={`card idea ${str} feat`}>
        <Sticker name="bulb" size={4.4} label="Idea bulb" className="g-on" style={{ position: "absolute", right: "1.4rem", top: "1.2rem" }} />
        <div className="str">
          <span className={`pill ${str === "epic" ? "acc" : ""}`}>{STRENGTH[str].label}</span>
          <span className="muted" style={{ fontSize: ".9rem" }}>{idea.script.method}, about {idea.script.totalSeconds} seconds</span>
          {idea.evidence.some((e) => e.synthetic) && <span className="pill">sample data</span>}
        </div>
        <h3>{idea.hook}</h3>
        <p className="why">Why now: {sentence(idea.why_now)} Based on {idea.evidence.length} source{idea.evidence.length === 1 ? "" : "s"}.</p>
        <div className="acts">
          <Link href={`/studio/${idea.id}`} className="btn primary lg">Record this idea</Link>
        </div>
      </article>

      {ref && (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <p className="lab">Learn from this one{ref.viaJev ? ", picked by Jev" : ""}</p>
          <h3 style={{ marginTop: ".4rem" }}>
            <a href={ref.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", textUnderlineOffset: "4px" }}>{ref.title}</a>
          </h3>
          <p className="muted" style={{ marginTop: ".35rem", fontSize: ".95rem" }}>
            {ref.platform}{ref.author && `, ${ref.author}`}, {ref.engagement.toLocaleString("en-US")} engagement{ref.synthetic && ", sample"}
          </p>
          <p className="muted" style={{ marginTop: ".5rem" }}>{ref.why}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(13rem,1fr))", gap: "1rem", marginTop: "1rem" }}>
            <div><p className="lab">Hook</p><p>{ref.structure.hook}</p></div>
            <div><p className="lab">Body</p><p>{ref.structure.body.join(" · ") || "None"}</p></div>
            <div><p className="lab">Ending</p><p>{ref.structure.cta || "None"}</p></div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h3>Your script <span className="pill" style={{ verticalAlign: "middle" }}>about {idea.script.totalSeconds} seconds</span></h3>
        <p className="muted" style={{ margin: ".4rem 0 1rem" }}>
          Drafted from the sources below. Before you record, check each number and claim against them, and cut anything that is not true for you.
        </p>
        <form action={saveScript}>
          <input type="hidden" name="id" value={idea.id} />
          {idea.script.beats.map((b, i) => (
            <div className="field" key={i}>
              <label htmlFor={`beat-${i}`}>{b.label}</label>
              <textarea id={`beat-${i}`} name="beat" defaultValue={b.text} rows={2} />
            </div>
          ))}
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <button className="btn quiet">Save changes</button>
            <Link href={`/studio/${idea.id}`} className="btn primary lg">Record this idea</Link>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h3>Why now</h3>
        <div className="crew" style={{ marginTop: ".5rem" }}>
          {idea.evidence.map((e, i) => (
            <div className="crow" key={i}>
              <a href={e.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}>{e.title}</a>
              <span className="muted" style={{ fontSize: ".9rem" }}>{e.platform}, {e.engagement.toLocaleString("en-US")}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
