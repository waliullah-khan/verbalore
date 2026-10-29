import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { currentWorkspace } from "@/lib/workspace";
import { hasResend } from "@/lib/email/resend";
import type { Script } from "@/lib/ideas/types";
import { saveNoteScript, sendNote } from "../../actions";

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
    <div className="space-y-6">
      <AutoRefresh active={!!pending && !note.video_id && pending.status !== "failed"} />
      <Link href="/signals" className="muted text-sm">← Signals</Link>
      <div>
        <p className="eyebrow">{note.signal?.account?.name} · {note.signal?.kind}</p>
        <h1 className="mt-1 text-4xl leading-tight">Video note for {note.contact?.name}</h1>
        <p className="muted mt-2">{note.contact?.title} · because: {note.signal?.headline}</p>
      </div>

      <section className="card">
        <p className="eyebrow">Script · about {script.totalSeconds}s</p>
        <form action={saveNoteScript} className="mt-3 space-y-3">
          <input type="hidden" name="note" value={note.id} />
          {script.beats.map((b, i) => (
            <label key={i} className="block">
              <span className="chip">{b.label}</span>
              <textarea name="beat" defaultValue={b.text} rows={2} className="lf mt-1" />
            </label>
          ))}
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-ghost">Save changes</button>
            {note.idea_id && !note.video_id && <Link href={`/studio/${note.idea_id}?note=${note.id}`} className="btn btn-primary">Record it</Link>}
          </div>
        </form>
      </section>

      {pending && !note.video_id && (
        <p className="card text-sm">{pending.status === "failed" ? "The edit failed. Record again from the button above." : "Your note is being edited. This page updates when it is ready."}</p>
      )}

      {url && (
        <section className="card grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-2xl bg-black">
            <video src={url} controls playsInline preload="metadata" className="h-full w-full object-cover" />
          </div>
          <div className="space-y-4">
            <div>
              <p className="eyebrow">Share page</p>
              <p className="mt-1 break-all text-sm">{base}/v/{note.token}</p>
              <p className="muted mt-1 text-sm">
                {views ?? 0} view{views === 1 ? "" : "s"}{note.sent_at && ` · sent to ${note.sent_to} on ${new Date(note.sent_at).toLocaleString()}`}
              </p>
            </div>

            <form action={sendNote} className="space-y-3">
              <input type="hidden" name="note" value={note.id} />
              <label className="block text-sm">Send to
                <input name="to" type="email" defaultValue={note.contact?.email ?? ""} className="lf mt-1" />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirm" value="yes" className="mt-1" />
                <span>I confirm this goes to a real person and I am happy to send it.</span>
              </label>
              <button className="btn btn-primary">Send the note</button>
              {!hasResend() && <p className="muted text-xs">No Resend key is set, so sending is simulated.</p>}
            </form>

            {searchParams.error && <p className="text-sm" style={{ color: "var(--warn)" }}>{errors[searchParams.error]}</p>}
            {searchParams.sent && <p className="text-sm" style={{ color: "var(--ok)" }}>{searchParams.sent === "simulated" ? "Marked as sent (simulated, no email key)." : "Sent."}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
