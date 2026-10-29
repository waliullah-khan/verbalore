import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdmin } from "../src/lib/access";

const known = new Map<string, boolean>();

// Admins are never limited. Everyone else, the public demo included, gets a daily allowance.
export async function isAdminWorkspace(db: SupabaseClient, workspaceId: string) {
  const cached = known.get(workspaceId);
  if (cached !== undefined) return cached;
  const { data: ws } = await db.from("vl_workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
  let admin = false;
  if (ws?.owner_id) {
    const { data } = await db.auth.admin.getUserById(ws.owner_id);
    admin = isAdmin(data.user?.email);
  }
  known.set(workspaceId, admin);
  return admin;
}
