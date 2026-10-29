import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type Workspace = {
  id: string;
  name: string;
  niche: string;
  offer: string;
  icp: string;
  brand: { accent: string; paper: string; ink: string };
  digest_email: string | null;
  is_demo: boolean;
};

export async function currentWorkspace() {
  const db = supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: member } = await db.from("vl_members").select("workspace_id").eq("user_id", auth.user.id).limit(1).maybeSingle();
  if (!member) redirect("/login?error=no-workspace");
  const { data: ws } = await db.from("vl_workspaces").select("*").eq("id", member.workspace_id).single();
  if (!ws) redirect("/login?error=no-workspace");
  return { db, user: auth.user, ws: ws as Workspace };
}
