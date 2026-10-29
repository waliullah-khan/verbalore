"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { activeJobs, enqueue } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { writeNoteScript } from "@/lib/signals/note";
import { sendEmail, esc } from "@/lib/email/resend";

export async function scan() {
  const { db, ws } = await currentWorkspace();
  if (!(await activeJobs(db, ws.id, ["scan_signals"])).length) await enqueue(db, ws.id, "scan_signals", {});
  revalidatePath("/signals");
}

export async function addWatch(formData: FormData) {
  const { db, ws } = await currentWorkspace();
  const phrase = String(formData.get("phrase") ?? "").trim().slice(0, 80);
  if (phrase) await db.from("vl_signal_watches").insert({ workspace_id: ws.id, phrase });
  revalidatePath("/signals");
}

export async function removeWatch(formData: FormData) {
  const { db } = await currentWorkspace();
  await db.from("vl_signal_watches").delete().eq("id", String(formData.get("id")));
  revalidatePath("/signals");
}

export async function dismiss(formData: FormData) {
  const { db } = await currentWorkspace();
  await db.from("vl_signals").update({ status: "dismissed" }).eq("id", String(formData.get("id")));
  revalidatePath("/signals");
}

// A note is a script, a contact and a signal. The script lives on an idea so the same
// Studio and render pipeline record and edit it.
export async function createNote(formData: FormData) {
  const { db, ws } = await currentWorkspace();
  const signalId = String(formData.get("signal"));
  const contactId = String(formData.get("contact"));

  const { data: signal } = await db.from("vl_signals").select("*, account:vl_crm_accounts(id,name)").eq("id", signalId).single();
  const { data: contact } = await db.from("vl_crm_contacts").select("*").eq("id", contactId).single();
  if (!signal || !contact) throw new Error("signal or contact missing");

  const script = await writeNoteScript(db, {
    workspace: { id: ws.id, name: ws.name, offer: ws.offer },
    account: { name: signal.account.name },
    contact: { name: contact.name, title: contact.title },
    signal: { kind: signal.kind, headline: signal.headline, summary: signal.summary },
  });

  const { data: idea, error } = await db
    .from("vl_ideas")
    .insert({
      workspace_id: ws.id,
      angle: `Video note for ${contact.name} at ${signal.account.name}`,
      hook: script.beats[0].text,
      why_now: signal.headline,
      score: Math.round(signal.relevance * signal.urgency * 100),
      status: "note",
      use_case: "gtm",
      evidence: [{ url: signal.evidence_url, title: signal.headline, platform: "web", author: signal.account.name, engagement: 0 }],
      script,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: note, error: nErr } = await db
    .from("vl_video_notes")
    .insert({ workspace_id: ws.id, signal_id: signalId, contact_id: contactId, script, idea_id: idea.id })
    .select("id")
    .single();
  if (nErr) throw nErr;
  redirect(`/signals/note/${note.id}`);
}

export async function sendNote(formData: FormData) {
  const { db, ws, user } = await currentWorkspace();
  const id = String(formData.get("note"));
  const to = String(formData.get("to") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) redirect(`/signals/note/${id}?error=email`);
  // seeded contacts use example.com, so a real send needs an address the user typed
  if (/@example\.(com|org|net)$/i.test(to)) redirect(`/signals/note/${id}?error=demo-address`);
  if (formData.get("confirm") !== "yes") redirect(`/signals/note/${id}?error=confirm`);

  const { data: note } = await db.from("vl_video_notes").select("*, contact:vl_crm_contacts(name)").eq("id", id).single();
  if (!note || !note.video_id) throw new Error("the video is not ready yet");

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${base}/v/${note.token}`;
  const hook = (note.script as { beats: { text: string }[] }).beats[0].text;
  const result = await sendEmail({
    to,
    replyTo: user.email ?? undefined,
    subject: hook.length > 70 ? hook.slice(0, 67) + "…" : hook,
    html: `<p>${esc(hook)}</p><p>I recorded a 30 second note for you:</p><p><a href="${link}">Watch it here</a></p><p>${esc(ws.name)}</p>`,
  });
  await db.from("vl_video_notes").update({ status: "sent", sent_to: to, sent_at: new Date().toISOString() }).eq("id", id);
  redirect(`/signals/note/${id}?sent=${result.simulated ? "simulated" : "1"}`);
}

export async function saveNoteScript(formData: FormData) {
  const { db } = await currentWorkspace();
  const { buildScript } = await import("@/lib/ideas/types");
  const id = String(formData.get("note"));
  const texts = formData.getAll("beat").map(String).map((t) => t.trim()).filter(Boolean);
  if (texts.length < 2) return;
  const [hook, ...rest] = texts;
  const cta = rest.pop() as string;
  const script = buildScript("Video note", hook, rest, cta);
  const { data: note } = await db.from("vl_video_notes").update({ script }).eq("id", id).select("idea_id").single();
  if (note?.idea_id) await db.from("vl_ideas").update({ script, hook }).eq("id", note.idea_id);
  revalidatePath(`/signals/note/${id}`);
}
