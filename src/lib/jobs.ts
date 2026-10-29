import type { SupabaseClient } from "@supabase/supabase-js";

export type JobKind = "generate_ideas" | "render_video" | "scan_signals" | "publish_video" | "render_note" | "send_digest";

export async function enqueue(db: SupabaseClient, workspaceId: string, kind: JobKind, payload: Record<string, unknown> = {}) {
  const { data, error } = await db.from("vl_jobs").insert({ workspace_id: workspaceId, kind, payload }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function activeJobs(db: SupabaseClient, workspaceId: string, kinds: JobKind[]) {
  const { data } = await db
    .from("vl_jobs")
    .select("id,kind,status,payload,error,created_at")
    .eq("workspace_id", workspaceId)
    .in("kind", kinds)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false });
  return data ?? [];
}
