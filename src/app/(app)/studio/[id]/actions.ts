"use server";

import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { captureBase } from "@/lib/capture";
import { enqueue } from "@/lib/jobs";
import { demoCapReached } from "@/lib/limits";
import { currentWorkspace } from "@/lib/workspace";
import { buildScript, type Script } from "@/lib/ideas/types";

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
  // a note goes back to its page, everything else goes to the editor for this video
  redirect(input.noteId ? `/signals/note/${input.noteId}` : `/library/${video.id}/edit`);
}

// The teleprompter's Edit script: the first line is the hook, the last is the call to action, the rest is the body.
export async function saveScript(input: { ideaId: string; lines: string[] }): Promise<{ ok: boolean }> {
  const { db } = await currentWorkspace();
  const lines = input.lines.map((l) => String(l).trim().slice(0, 600)).filter(Boolean).slice(0, 60);
  if (lines.length < 2) return { ok: false };
  const { data: idea } = await db.from("vl_ideas").select("script").eq("id", input.ideaId).maybeSingle();
  if (!idea) return { ok: false };
  const [hook, ...rest] = lines;
  const cta = rest.pop() as string;
  const script: Script = buildScript((idea.script as Script | null)?.method ?? "Direct", hook, rest, cta);
  const { error } = await db.from("vl_ideas").update({ script, hook }).eq("id", input.ideaId);
  return { ok: !error };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Starts a phone capture: a short-lived link for this idea, shown to the desktop as a QR code.
export async function createCapture(input: { ideaId: string; noteId?: string }) {
  const { db, ws } = await currentWorkspace();
  if (await demoCapReached(db, ws, "vl_capture_sessions")) throw new Error("hourly limit");
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

// "Save to my Library for later": the phone's take becomes a recording with no edit yet, which the Library lists.
export async function savePhoneTake(input: { ideaId: string; path: string; durationS: number }): Promise<{ ok: boolean }> {
  const { db, ws } = await currentWorkspace();
  if (!input.path.startsWith(`${ws.id}/`)) return { ok: false };
  const { data: have } = await db.from("vl_recordings").select("id").eq("path", input.path).maybeSingle();
  if (have) return { ok: true };
  const { error } = await db.from("vl_recordings").insert({ workspace_id: ws.id, idea_id: input.ideaId, path: input.path, duration_s: input.durationS });
  return { ok: !error };
}
