import type { SupabaseClient } from "@supabase/supabase-js";

// The demo workspace is open to anyone and some actions spend provider credits or storage straight from the
// web server, outside the worker's own hourly cap. This caps those per hour. Real workspaces are never limited.
export const DEMO_HOURLY_CAP = Number(process.env.DEMO_HOURLY_CAP ?? 15);

export async function demoCapReached(
  db: SupabaseClient,
  ws: { id: string; is_demo: boolean },
  table: "vl_ideas" | "vl_video_notes" | "vl_capture_sessions",
  filter?: { column: string; value: string }
): Promise<boolean> {
  if (!ws.is_demo) return false;
  let q = db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if (filter) q = q.eq(filter.column, filter.value);
  const { count } = await q;
  return (count ?? 0) >= DEMO_HOURLY_CAP;
}
