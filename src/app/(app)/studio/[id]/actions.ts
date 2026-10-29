"use server";

import { redirect } from "next/navigation";
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
