"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { activeJobs, enqueue } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { writeNoteScript } from "@/lib/signals/note";
import { sendEmail, esc } from "@/lib/email/resend";
import { parseOrgList } from "@/lib/signals/orgs";
import { writeSignalScript } from "@/lib/signals/place-script";

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

// Watch any organisation: one name or a pasted list. A missing website is looked up so the
// primary sources (job board, SEC, the company's own site) can be read, then it is scanned straight away.
export async function addOrganizations(formData: FormData) {
  const { db, ws } = await currentWorkspace();
  const entries = parseOrgList(String(formData.get("orgs") ?? ""));
  if (!entries.length) redirect("/signals?org=empty");

  const { data: existing } = await db.from("vl_crm_accounts").select("name").eq("workspace_id", ws.id);
  const have = new Set((existing ?? []).map((a) => String(a.name).toLowerCase()));
  const fresh = entries.filter((e) => !have.has(e.name.toLowerCase()));

  // a missing website is found by the worker during the scan, so saving never waits on a search
  const rows = fresh.map((e) => ({ workspace_id: ws.id, name: e.name, domain: e.domain, source: "manual" }));
  let created: { id: string }[] = [];
  if (rows.length) {
    const res = await db.from("vl_crm_accounts").insert(rows).select("id");
    if (res.error) throw res.error;
    created = res.data;
  }

  // an optional contact only makes sense when exactly one organisation was added
  const contactName = String(formData.get("contact_name") ?? "").trim();
  if (created.length === 1 && contactName) {
    await db.from("vl_crm_contacts").insert({
      workspace_id: ws.id,
      account_id: created[0].id,
      name: contactName.slice(0, 80),
      title: String(formData.get("contact_title") ?? "").trim().slice(0, 80) || null,
      email: String(formData.get("contact_email") ?? "").trim().slice(0, 120) || null,
    });
  }

  if (created.length) await enqueue(db, ws.id, "scan_signals", { accountIds: created.map((a) => a.id) });
  revalidatePath("/signals");
  redirect(`/signals?added=${created.length}&skipped=${entries.length - fresh.length}`);
}

export async function removeOrganization(formData: FormData) {
  const { db } = await currentWorkspace();
  await db.from("vl_crm_accounts").delete().eq("id", String(formData.get("id")));
  revalidatePath("/signals");
}

export async function scanOne(formData: FormData) {
  const { db, ws } = await currentWorkspace();
  await enqueue(db, ws.id, "scan_signals", { accountIds: [String(formData.get("id"))] });
  revalidatePath("/signals");
}

// A video note needs someone to send it to, so a contact can be added to any watched organization.
export async function addContact(formData: FormData) {
  const { db, ws } = await currentWorkspace();
  const name = String(formData.get("name") ?? "").trim();
  const accountId = String(formData.get("account"));
  if (!name) return;
  await db.from("vl_crm_contacts").insert({
    workspace_id: ws.id,
    account_id: accountId,
    name: name.slice(0, 80),
    title: String(formData.get("title") ?? "").trim().slice(0, 80) || null,
    email: String(formData.get("email") ?? "").trim().slice(0, 120) || null,
  });
  revalidatePath("/signals");
}

// A place is read from that city's own records instead of the news. Austin is the first one wired.
const PLACES: Record<string, { name: string }> = { austin: { name: "Austin, TX" } };

export async function addPlace(formData: FormData) {
  const { db, ws } = await currentWorkspace();
  const city = String(formData.get("city") ?? "austin");
  const place = PLACES[city];
  if (!place) redirect("/signals?org=empty");

  const { data: have } = await db.from("vl_crm_accounts").select("id").eq("workspace_id", ws.id).eq("source", "place").eq("name", place.name).maybeSingle();
  let id = have?.id as string | undefined;
  if (!id) {
    const res = await db.from("vl_crm_accounts").insert({ workspace_id: ws.id, name: place.name, source: "place", meta: { place: { city } } }).select("id").single();
    if (res.error) throw res.error;
    id = res.data.id;
  }
  await enqueue(db, ws.id, "scan_signals", { accountIds: [id] });
  revalidatePath("/signals");
  redirect(`/signals?added=1&skipped=${have ? 1 : 0}`);
}

// A market or permit signal becomes a script and an idea, ready to record.
export async function ideaFromSignal(formData: FormData) {
  const { db, ws } = await currentWorkspace();
  const { data: s } = await db.from("vl_signals").select("*, account:vl_crm_accounts(name)").eq("id", String(formData.get("signal"))).single();
  if (!s) throw new Error("signal not found");

  const script = await writeSignalScript(db, { workspaceId: ws.id, signal: { headline: s.headline, summary: s.summary, kind: s.kind }, place: s.account.name });
  const { data: idea, error } = await db
    .from("vl_ideas")
    .insert({
      workspace_id: ws.id,
      angle: s.headline,
      hook: script.beats[0].text,
      why_now: s.summary,
      score: Math.round(s.relevance * s.urgency * 100),
      status: "signal",
      use_case: "real_estate",
      evidence: [{ url: s.evidence_url, title: s.headline, platform: "permits", author: s.account.name, engagement: 0 }],
      script,
    })
    .select("id")
    .single();
  if (error) throw error;
  redirect(`/ideas/${idea.id}`);
}
