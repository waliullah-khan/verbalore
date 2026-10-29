import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { currentWorkspace } from "@/lib/workspace";
import { hasResend } from "@/lib/email/resend";
import type { Script } from "@/lib/ideas/types";
import { retryScript, saveNoteScript, sendNote } from "../../actions";

const errors: Record<string, string> = {
  email: "That does not look like an email address.",
  "demo-address": "This contact is a sample with an example.com address. Type your own address to test a real send.",
  confirm: "Tick the box to confirm you want to send this.",
  "demo-email": "Sending real email is turned off in the public demo. The share link above still works.",
};

export default async function NotePage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; sent?: string } }) {
  const { db } = await currentWorkspace();
  const { data: note } = await db
    .from("vl_video_notes")
    .select("*, contact:vl_crm_contacts(name,title,email), signal:vl_signals(headline,kind, account:vl_crm_accounts(name))")
    .eq("id", params.id)
    .maybeSingle();
  if (!note) notFound();

  const script = note.script as Script;
  const { data: video } = note.video_id ? await db.from("vl_videos").select("status,output_path").eq("id", note.video_id).maybeSingle() : { data: null };
  const { data: pending } = !note.video_id && note.idea_id
    ? await db.from("vl_videos").select("status").eq("idea_id", note.idea_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const url = video?.output_path ? db.storage.from("vl-videos").getPublicUrl(video.output_path).data.publicUrl : null;
  const { count: views } = await db.from("vl_note_views").select("id", { count: "exact", head: true }).eq("note_id", note.id);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <section className="screen" data-screen="signals">
      <AutoRefresh active={script.state === "writing" || (!!pending && !note.video_id && pending.status !== "failed")} />
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/signals" className="btn quiet sm">Back to Signals</Link>
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <p className="lab">{note.signal?.account?.name} · {note.signal?.kind}</p>
        <h2 style={{ marginTop: ".3rem" }}>Video note for {note.contact?.name}</h2>
        <p className="muted" style={{ marginTop: ".4rem" }}>{note.contact?.title} · because: {note.signal?.headline}</p>
      </div>

      {pending && !note.video_id && (
        <p className="card" role="status" style={{ marginBottom: "1rem" }}>
          {pending.status === "failed" ? "The edit failed. Record again from the button below." : "Your note is being edited. This page updates when it is ready."}
        </p>
      )}

      <div className="postgrid">
        {script.state ? (
          <div className="card" role="status">
            <p className="lab">{script.state === "writing" ? "Writing your script" : "The script could not be written"}</p>
            {script.state === "writing" ? (
              <p style={{ marginTop: ".5rem" }}>Writing your script… A proper note takes about a minute to draft and check against what we know. This page fills in by itself.</p>
            ) : (
              <>
                <p style={{ marginTop: ".5rem" }}>{script.error ?? "Something went wrong while writing it."}</p>
                {note.idea_id && script.retry && (
                  <form action={retryScript} style={{ marginTop: ".75rem" }}>
                    <input type="hidden" name="idea" value={note.idea_id} />
                    <button className="btn primary">Try again</button>
                  </form>
                )}
              </>
            )}
          </div>
        ) : (
        <div className="card">
          <p className="lab">Script, about {script.totalSeconds} seconds</p>
          <form action={saveNoteScript} style={{ marginTop: ".75rem" }}>
            <input type="hidden" name="note" value={note.id} />
            {script.beats.map((b, i) => (
              <div className="field" key={i}>
                <label htmlFor={`beat-${i}`}><span className="pill">{b.label}</span></label>
                <textarea id={`beat-${i}`} name="beat" defaultValue={b.text} rows={2} />
              </div>
            ))}
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
              <button className="btn">Save changes</button>
              {note.idea_id && !note.video_id && <Link href={`/studio/${note.idea_id}?note=${note.id}`} className="btn primary">Record it</Link>}
            </div>
          </form>
        </div>
        )}

        {url && (
          <aside className="sumside">
            <div className="card">
              <div className="sumrow">
                <video src={url} controls playsInline preload="metadata" style={{ width: "9rem", aspectRatio: "9/16", objectFit: "cover", borderRadius: ".8rem", border: "2px solid var(--ink)", background: "#000" }} />
                <div style={{ display: "grid", gap: ".5rem", alignContent: "start", minWidth: 0 }}>
                  <b>Share page</b>
                  <span className="muted mono" style={{ fontSize: ".8rem", overflowWrap: "anywhere" }}>{base}/v/{note.token}</span>
                  <span className="muted" style={{ fontSize: ".9rem" }}>
                    {views ?? 0} view{views === 1 ? "" : "s"}
                    {note.sent_at && ` · sent to ${note.sent_to} on ${new Date(note.sent_at).toLocaleString()}`}
                  </span>
                </div>
              </div>
            </div>

            <form action={sendNote} className="card" style={{ display: "grid", gap: ".75rem" }}>
              <input type="hidden" name="note" value={note.id} />
              <div className="lab">Send it to one person</div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="to">Send to</label>
                <input id="to" type="text" name="to" inputMode="email" autoComplete="email" defaultValue={note.contact?.email ?? ""} />
              </div>
              <div className="when">
                <label>
                  <input type="checkbox" name="confirm" value="yes" />
                  <span>I confirm this goes to a real person.</span>
                </label>
              </div>
              <button className="btn primary lg">Send the note</button>
              {!hasResend() && <p className="muted" style={{ fontSize: ".85rem" }}>No Resend key is set, so sending is simulated.</p>}
              {searchParams.error && <p role="alert" style={{ color: "var(--warn)", fontWeight: 700 }}>{errors[searchParams.error]}</p>}
              {searchParams.sent && (
                <p role="status" style={{ color: "var(--ok)", fontWeight: 700 }}>
                  {searchParams.sent === "simulated" ? "Marked as sent (simulated, no email key)." : "Sent."}
                </p>
              )}
            </form>
          </aside>
        )}
      </div>
    </section>
  );
}
