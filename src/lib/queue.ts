import type { SupabaseClient } from "@supabase/supabase-js";

export type QueuePosition = { stage: "waiting" | "working"; ahead: number };

// Where a video's edit is in the line, from the database function vl_queue_position. It only returns counts,
// and only to members of the video's workspace.
export async function queuePosition(db: SupabaseClient, videoId: string): Promise<QueuePosition | null> {
  const { data, error } = await db.rpc("vl_queue_position", { p_video: videoId });
  const row = (data as { stage: string; ahead: number }[] | null)?.[0];
  if (error || !row) return null;
  return { stage: row.stage === "working" ? "working" : "waiting", ahead: Number(row.ahead) || 0 };
}

export function queueText(p: QueuePosition | null): string | null {
  if (!p) return null;
  if (p.stage === "working") return "Editing now.";
  if (p.ahead > 0) return `Waiting for a free editor, ${p.ahead} ${p.ahead === 1 ? "edit" : "edits"} ahead of you.`;
  return "Waiting for a free editor. You are next.";
}
