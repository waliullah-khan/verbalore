import type { SupabaseClient } from "@supabase/supabase-js";

// Every ordinary account can make a few videos. Admins and the public demo are not counted against this.
export const videoLimit = () => Number(process.env.VIDEO_LIMIT) || 5;

export type Allowance = { used: number; limit: number; unlimited: boolean; remaining: number; canCreate: boolean };

export function allowanceMath(input: { used: number; limit: number; unlimited: boolean }): Allowance {
  const { used, limit, unlimited } = input;
  const remaining = unlimited ? Infinity : Math.max(0, limit - used);
  return { used, limit, unlimited, remaining, canCreate: unlimited || used < limit };
}

export const allowanceMessage = (limit: number) =>
  `You have used your ${limit} videos. Delete one in the Library to make room, or ask us for more.`;

// A video whose edit failed before it ever produced a file does not use up a slot.
export async function countVideos(db: SupabaseClient, workspaceId: string): Promise<number> {
  const { count } = await db
    .from("vl_videos")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .or("status.neq.failed,output_path.not.is.null");
  return count ?? 0;
}

export async function videoAllowance(db: SupabaseClient, ws: { id: string; is_demo: boolean }, admin: boolean): Promise<Allowance> {
  const unlimited = admin || ws.is_demo;
  return allowanceMath({ used: unlimited ? 0 : await countVideos(db, ws.id), limit: videoLimit(), unlimited });
}
