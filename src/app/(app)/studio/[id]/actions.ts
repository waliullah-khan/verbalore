"use server";

import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { captureBase } from "@/lib/capture";
import { enqueue } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";

export async function submitRecording(input: { ideaId: string; path: string; durationS: number; template: string; noteId?: string }) {
  const { db, ws } = await currentWorkspace();
  if (!input.path.startsWith(`${ws.id}/`)) throw new Error("bad path");

  const { data: idea } = await db.from("vl_ideas").select("hook,use_case").eq("id", input.ideaId).maybeSingle();
  const { data: rec, error } = await db
    .from("vl_recordings")
    .insert({ workspace_id: ws.id, idea_id: input.ideaId, path: input.path, duration_s: input.durationS })
    .select("id")
    .single();
  if (error) throw error;

  const { data: video, error: vErr } = await db
    .from("vl_videos")
    .insert({
      workspace_id: ws.id,
      idea_id: input.ideaId,
      recording_id: rec.id,
      title: (idea?.hook ?? "Untitled").slice(0, 90),
      template: input.template,
      use_case: idea?.use_case ?? "general",
    })
    .select("id")
    .single();
  if (vErr) throw vErr;

  await enqueue(db, ws.id, "render_video", { videoId: video.id });
  redirect(input.noteId ? `/signals/note/${input.noteId}` : "/library");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Starts a phone capture: a short-lived link for this idea, shown to the desktop as a QR code.
export async function createCapture(input: { ideaId: string; noteId?: string }) {
  const { db, ws } = await currentWorkspace();
  const { data: idea } = await db.from("vl_ideas").select("id").eq("id", input.ideaId).maybeSingle();
  if (!idea) throw new Error("idea not found");

  const { data: s, error } = await db
    .from("vl_capture_sessions")
    .insert({ workspace_id: ws.id, idea_id: idea.id, note_id: input.noteId && UUID.test(input.noteId) ? input.noteId : null })
    .select("token")
    .single();
  if (error) throw error;

  const url = `${captureBase()}/r/${s.token}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 240, color: { dark: "#14110f", light: "#ffffff" } });
  return { token: s.token as string, url, svg, secure: url.startsWith("https://") };
}
