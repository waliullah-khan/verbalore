import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/access";
import { loadStudioState } from "@/lib/studio-state";
import Shell from "@/components/studio/Shell";

async function signOut() {
  "use server";
  await supabaseServer().auth.signOut();
  redirect("/");
}

async function pendingRequests() {
  const db = await serviceClient();
  const { count } = await db.from("vl_access_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

// The frame around every screen. The design's rail, header, game strip, steps and tab bar live in <Shell>;
// this only loads what the first paint needs.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { ws, user } = await currentWorkspace();
  const admin = isAdmin(user.email);
  const [state, pending] = await Promise.all([
    loadStudioState(ws.id, cookies().get("vl-project")?.value ?? null),
    admin ? pendingRequests() : Promise.resolve(0),
  ]);

  return (
    <Shell state={state} wsName={ws.name} isDemo={ws.is_demo} admin={admin} pending={pending} signOut={signOut}>
      {children}
    </Shell>
  );
}
