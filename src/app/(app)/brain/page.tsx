import { revalidatePath } from "next/cache";
import { currentWorkspace } from "@/lib/workspace";
import { addDoc, readUrl } from "@/lib/brain/ingest";
import { buildVoiceProfile, type VoiceProfile } from "@/lib/brain/voice";

async function addNote(formData: FormData) {
  "use server";
  const { db, ws } = await currentWorkspace();
  const title = String(formData.get("title") ?? "").trim() || "Untitled note";
  const content = String(formData.get("content") ?? "").trim();
  const kind = String(formData.get("kind") ?? "note");
  if (content) await addDoc(db, ws.id, { kind, title, content });
  revalidatePath("/brain");
}

async function addLink(formData: FormData) {
  "use server";
  const { db, ws } = await currentWorkspace();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return;
  const page = await readUrl(url);
  await addDoc(db, ws.id, { kind: "url", title: page.title.slice(0, 120), content: page.text, source_url: url });
  revalidatePath("/brain");
}

async function removeDoc(formData: FormData) {
  "use server";
  const { db } = await currentWorkspace();
  await db.from("vl_brain_docs").delete().eq("id", String(formData.get("id")));
  revalidatePath("/brain");
}

async function relearn() {
  "use server";
  const { db, ws } = await currentWorkspace();
  await buildVoiceProfile(db, ws.id);
  revalidatePath("/brain");
}

export default async function Brain() {
  const { db, ws } = await currentWorkspace();
  const [{ data: docs }, { data: voice }] = await Promise.all([
    db.from("vl_brain_docs").select("id,kind,title,source_url,content,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    db.from("vl_voice_profiles").select("profile,updated_at").eq("workspace_id", ws.id).maybeSingle(),
  ]);
  const profile = voice?.profile as VoiceProfile | undefined;

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Brain</p>
        <h1 className="mt-1 text-4xl">Everything about you</h1>
        <p className="muted mt-2 max-w-xl">Drop in what you know: your offer, customer proof, past posts and call notes. Scripts are written from this, in your voice, and never invent facts beyond it.</p>
      </div>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">How you write</p>
          <form action={relearn}><button className="btn btn-ghost">Re-learn</button></form>
        </div>
        {profile ? (
          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            <div><p className="muted">Tone</p><p className="mt-1">{profile.tone}</p></div>
            <div><p className="muted">Sentence length</p><p className="mt-1">about {profile.avgSentenceWords} words</p></div>
            <div><p className="muted">Often opens with</p><p className="mt-1">{profile.openers.join(" · ") || "—"}</p></div>
            <div><p className="muted">Phrases you repeat</p><p className="mt-1">{profile.phrases.join(" · ") || "Not enough text yet"}</p></div>
            <div className="sm:col-span-2"><p className="muted">Rules</p><div className="mt-1 flex flex-wrap gap-2">{profile.rules.map((r) => <span key={r} className="chip">{r}</span>)}</div></div>
          </div>
        ) : (
          <p className="muted mt-3 text-sm">Add a few of your own posts, then press Re-learn.</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={addNote} className="card space-y-3">
          <p className="eyebrow">Add text</p>
          <input name="title" placeholder="Title" className="field" />
          <select name="kind" className="field">
            <option value="note">Note about my business</option>
            <option value="post">One of my posts or scripts</option>
          </select>
          <textarea name="content" rows={5} placeholder="Paste anything" className="field" required />
          <button className="btn btn-primary">Save to brain</button>
        </form>
        <form action={addLink} className="card space-y-3">
          <p className="eyebrow">Add a page</p>
          <input name="url" type="url" placeholder="https://your-site.com/about" className="field" required />
          <p className="muted text-sm">Your site, a case study or a podcast page. It is read and stored.</p>
          <button className="btn btn-primary">Read this page</button>
        </form>
      </div>

      <section>
        <p className="eyebrow">{docs?.length ?? 0} documents</p>
        <ul className="mt-3 grid gap-3">
          {(docs ?? []).map((d) => (
            <li key={d.id} className="card flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">{d.title}</p>
                <p className="muted mt-1 line-clamp-2 text-sm">{d.content}</p>
                <p className="muted mt-2 text-xs"><span className="chip">{d.kind}</span> {d.source_url && <a href={d.source_url} target="_blank" rel="noreferrer" className="ml-2 underline">{new URL(d.source_url).hostname}</a>}</p>
              </div>
              <form action={removeDoc}>
                <input type="hidden" name="id" value={d.id} />
                <button className="muted text-sm underline-offset-4 hover:underline">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
