"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentWorkspace } from "@/lib/workspace";
import { enqueue } from "@/lib/jobs";
import { THEMES, isUseCase, type ThemeId } from "@/lib/usecases";
import { connectUrl, connectedAccounts, hasUploadPost, profileName, PLATFORMS } from "@/lib/publish/uploadpost";
import { applyEdits, type PlanScene, type SceneEdit } from "@/lib/publish/plan-edits";
import { esc, sendEmail } from "@/lib/email/resend";
import { loadActivity, level, multiplier, streaks, thisWeek, xpOf, WEEK_GOAL } from "@/lib/game";
import type { PublishState } from "./types";

const isTheme = (t: string): t is ThemeId => t in THEMES;
const bad = (error: string) => ({ error }) as const;

// Rendering polls this while the progress window is open.
export async function videoStatus(videoId: string) {
  const { db, ws } = await currentWorkspace();
  const { data } = await db.from("vl_videos").select("status,error,render_ms").eq("id", videoId).eq("workspace_id", ws.id).maybeSingle();
  return data ? { status: String(data.status), error: (data.error as string | null) ?? "", renderMs: (data.render_ms as number | null) ?? 0 } : null;
}

// Re-renders the video. With edits, the words on screen are changed; without, the editor plans the video afresh.
export async function applyEditsAction(input: { videoId: string; template: string; edits?: SceneEdit[]; fresh?: boolean }) {
  const { db, ws } = await currentWorkspace();
  if (!isTheme(input.template)) return bad("Pick one of the styles.");
  const { data: video } = await db.from("vl_videos").select("id,recording_id,scene_plan,transcript,status").eq("id", input.videoId).eq("workspace_id", ws.id).maybeSingle();
  if (!video) return bad("That video could not be found.");
  if (!video.recording_id) return bad("This video has no original recording, so it cannot be edited again.");
  if (video.status === "queued" || video.status === "processing") return bad("This video is already being edited.");

  const transcript = { ...((video.transcript as Record<string, unknown> | null) ?? {}) };
  delete transcript.plan_override;
  if (!input.fresh && Array.isArray(input.edits) && Array.isArray(video.scene_plan)) {
    transcript.plan_override = applyEdits(video.scene_plan as PlanScene[], input.edits.slice(0, 40));
  }
  const { error } = await db.from("vl_videos").update({ status: "queued", template: input.template, error: null, transcript }).eq("id", video.id);
  if (error) return bad(error.message);
  await enqueue(db, ws.id, "render_video", { videoId: video.id });
  revalidatePath("/library");
  return { ok: true as const };
}

export async function retryRender(videoId: string) {
  const { db, ws } = await currentWorkspace();
  const { data: video } = await db.from("vl_videos").select("id,recording_id").eq("id", videoId).eq("workspace_id", ws.id).maybeSingle();
  if (!video?.recording_id) return bad("This video has no original recording to edit again.");
  await db.from("vl_videos").update({ status: "queued", error: null }).eq("id", video.id);
  await enqueue(db, ws.id, "render_video", { videoId: video.id });
  revalidatePath("/library");
  return { ok: true as const };
}

export async function removeVideo(videoId: string) {
  const { db, ws } = await currentWorkspace();
  const { error } = await db.from("vl_videos").delete().eq("id", videoId).eq("workspace_id", ws.id);
  if (error) return bad("It could not be removed.");
  revalidatePath("/library");
  return { ok: true as const };
}

export async function removeRecording(recordingId: string) {
  const { db, ws } = await currentWorkspace();
  const { data: rec } = await db.from("vl_recordings").select("path").eq("id", recordingId).eq("workspace_id", ws.id).maybeSingle();
  const { error } = await db.from("vl_recordings").delete().eq("id", recordingId).eq("workspace_id", ws.id);
  if (error) return bad("It could not be removed.");
  if (rec?.path) await db.storage.from("vl-recordings").remove([rec.path]);
  revalidatePath("/library");
  return { ok: true as const };
}

// Same steps as the Studio takes when a recording is sent for editing.
export async function editRecording(recordingId: string) {
  const { db, ws } = await currentWorkspace();
  const { data: rec } = await db.from("vl_recordings").select("id,idea_id").eq("id", recordingId).eq("workspace_id", ws.id).maybeSingle();
  if (!rec) return bad("That recording could not be found.");
  const { data: idea } = rec.idea_id ? await db.from("vl_ideas").select("hook,use_case").eq("id", rec.idea_id).maybeSingle() : { data: null };
  const useCase = idea?.use_case && isUseCase(idea.use_case) ? idea.use_case : "general";
  const { data: video, error } = await db
    .from("vl_videos")
    .insert({ workspace_id: ws.id, idea_id: rec.idea_id, recording_id: rec.id, title: (idea?.hook ?? "Untitled").slice(0, 90), template: "editorial", use_case: useCase })
    .select("id")
    .single();
  if (error) return bad(error.message);
  await enqueue(db, ws.id, "render_video", { videoId: video.id });
  revalidatePath("/library");
  return { ok: true as const, videoId: video.id as string };
}

// A copy is a new draft that shares the finished file.
export async function duplicateVideo(videoId: string) {
  const { db, ws } = await currentWorkspace();
  const { data: v } = await db.from("vl_videos").select("*").eq("id", videoId).eq("workspace_id", ws.id).maybeSingle();
  if (!v) return bad("That video could not be found.");
  const { data: copy, error } = await db
    .from("vl_videos")
    .insert({
      workspace_id: ws.id, idea_id: v.idea_id, recording_id: v.recording_id, title: `${String(v.title).slice(0, 80)} (copy)`,
      status: v.status === "ready" ? "ready" : v.status, template: v.template, scene_plan: v.scene_plan, transcript: v.transcript,
      output_path: v.output_path, duration_s: v.duration_s, render_ms: v.render_ms, use_case: v.use_case,
    })
    .select("id")
    .single();
  if (error) return bad(error.message);
  revalidatePath("/library");
  return { ok: true as const, id: copy.id as string };
}

function scheduleFrom(when: string, iso?: string): { at: string | null } | { error: string } {
  if (when === "now") return { at: null };
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return { error: "Choose a date and time." };
  if (t < Date.now() + 60_000) return { error: "Pick a time in the future." };
  if (t > Date.now() + 60 * 86_400_000) return { error: "Scheduling is limited to 60 days ahead." };
  return { at: new Date(t).toISOString() };
}

export async function startPost(input: { videoId: string; platforms: string[]; captions: Record<string, string>; when: string; scheduledAt?: string }) {
  const { db, ws } = await currentWorkspace();
  const known = new Set<string>(PLATFORMS.map((p) => p.id));
  const platforms = [...new Set(input.platforms.filter((p) => known.has(p)))];
  if (!platforms.length) return bad("Choose at least one platform.");
  const sched = scheduleFrom(input.when, input.scheduledAt);
  if ("error" in sched) return bad(sched.error);

  const { data: video } = await db.from("vl_videos").select("id,status,output_path").eq("id", input.videoId).eq("workspace_id", ws.id).maybeSingle();
  if (!video || video.status !== "ready" || !video.output_path) return bad("This video is not ready to post yet.");

  // outside the demo, only accounts that are really connected can be posted to
  if (!ws.is_demo && hasUploadPost()) {
    const connected = await connectedAccounts(profileName(ws.id));
    const missing = platforms.filter((p) => !(p in connected));
    if (missing.length) return bad(`Connect ${missing.join(", ")} first.`);
  }

  const by: Record<string, string> = {};
  for (const p of platforms) by[p] = String(input.captions[p] ?? "").slice(0, 5000).trim();
  const { data: pub, error } = await db
    .from("vl_publish_jobs")
    .insert({ workspace_id: ws.id, video_id: video.id, platforms, captions: { all: by[platforms[0]], by }, scheduled_at: sched.at })
    .select("id")
    .single();
  if (error) return bad(error.message);
  await enqueue(db, ws.id, "publish_video", { publishId: pub.id });
  revalidatePath("/library");
  return { ok: true as const, publishId: pub.id as string };
}

export async function publishStatus(publishId: string): Promise<PublishState | null> {
  const { db, ws } = await currentWorkspace();
  const { data } = await db.from("vl_publish_jobs").select("status,scheduled_at,platforms,results").eq("id", publishId).eq("workspace_id", ws.id).maybeSingle();
  if (!data) return null;
  const state: PublishState = {
    status: String(data.status),
    scheduledAt: (data.scheduled_at as string | null) ?? null,
    platforms: (data.platforms as string[]) ?? [],
    results: ((data.results as PublishState["results"] | null) ?? {}) as PublishState["results"],
  };
  // a job the worker turned away (for example the daily allowance) never updates the row above
  if (state.status === "queued") {
    const { data: job } = await db.from("vl_jobs").select("status,error").eq("workspace_id", ws.id).eq("kind", "publish_video").filter("payload->>publishId", "eq", publishId).maybeSingle();
    if (job?.status === "failed") state.jobError = String(job.error || "The job did not run.");
  }
  return state;
}

// The numbers behind the streak card shown once a video has gone out. They are counted from what this workspace has really made.
export async function afterPost() {
  const { db, ws } = await currentWorkspace();
  const a = await loadActivity(db, ws.id);
  const s = streaks(a.videoTimes);
  const lv = level(xpOf(a));
  return {
    day: s.current,
    postedToday: s.postedToday,
    week: Math.min(WEEK_GOAL, thisWeek(a.videoTimes)),
    goal: WEEK_GOAL,
    xp: xpOf(a),
    level: lv.n,
    levelName: lv.name,
    todayXp: Math.round(100 * multiplier(s.current)),
    frac: Math.min(1, s.current / 14),
  };
}

export async function connectAccounts(formData: FormData) {
  const { ws } = await currentWorkspace();
  const back = String(formData.get("back") ?? "/library");
  if (ws.is_demo || !hasUploadPost() || !back.startsWith("/library")) redirect(back.startsWith("/library") ? back : "/library");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  redirect(await connectUrl(profileName(ws.id), `${base}${back}`));
}

// A private note for one contact: a row with its own share link. The video is the one being posted.
export async function prepareNote(input: { videoId: string; contactId: string }) {
  const { db, ws } = await currentWorkspace();
  const { data: video } = await db.from("vl_videos").select("id,idea_id").eq("id", input.videoId).eq("workspace_id", ws.id).maybeSingle();
  const { data: contact } = await db.from("vl_crm_contacts").select("id").eq("id", input.contactId).eq("workspace_id", ws.id).maybeSingle();
  if (!video || !contact) return bad("That video or contact could not be found.");
  const { data: have } = await db.from("vl_video_notes").select("id,token").eq("video_id", video.id).eq("contact_id", contact.id).maybeSingle();
  let note = have as { id: string; token: string } | null;
  if (!note) {
    const { data: idea } = video.idea_id ? await db.from("vl_ideas").select("script").eq("id", video.idea_id).maybeSingle() : { data: null };
    const { data: made, error } = await db
      .from("vl_video_notes")
      .insert({ workspace_id: ws.id, contact_id: contact.id, video_id: video.id, idea_id: video.idea_id, script: idea?.script ?? null, status: "ready" })
      .select("id,token")
      .single();
    if (error) return bad(error.message);
    note = made as { id: string; token: string };
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { ok: true as const, noteId: note.id, link: `${base}/v/${note.token}` };
}

export async function sendNote(input: { noteId: string; message: string }) {
  const { db, ws, user } = await currentWorkspace();
  // the demo is open to anyone, so it must not become a way to email strangers from this account
  if (ws.is_demo && process.env.ALLOW_DEMO_EMAIL !== "true") return bad("Sending real email is turned off in the public demo. The private link still works.");
  const { data: note } = await db.from("vl_video_notes").select("id,token,video_id,contact:vl_crm_contacts(name,email)").eq("id", input.noteId).eq("workspace_id", ws.id).maybeSingle();
  const contact = (Array.isArray(note?.contact) ? note?.contact[0] : note?.contact) as { name: string; email: string | null } | undefined;
  if (!note || !note.video_id) return bad("That note could not be found.");
  if (!contact?.email) return bad("This contact has no email address. Copy the private link and send it yourself.");
  if (/@example\.(com|org|net)$/i.test(contact.email)) return bad("This is a sample contact, so nothing was sent.");

  const message = input.message.trim().slice(0, 1200);
  if (!message) return bad("Write a short message to go with the video.");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${base}/v/${note.token}`;
  try {
    await sendEmail({
      to: contact.email,
      replyTo: user.email ?? undefined,
      subject: message.length > 70 ? `${message.slice(0, 67)}…` : message,
      html: `<p>${esc(message).replace(/\n/g, "<br>")}</p><p><a href="${link}">Watch it here</a></p><p>${esc(ws.name)}</p>`,
    });
  } catch (e) {
    return bad((e as Error).message);
  }
  await db.from("vl_video_notes").update({ status: "sent", sent_to: contact.email, sent_at: new Date().toISOString() }).eq("id", note.id);
  revalidatePath("/library");
  return { ok: true as const, to: contact.name };
}
