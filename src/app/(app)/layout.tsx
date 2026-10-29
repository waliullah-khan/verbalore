import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/access";
import { loadStudioState } from "@/lib/studio-state";
import Shell from "@/components/studio/Shell";

async function signOut() {
  "use server";
  await supabaseServer().auth.signOut();
  redirect("/");
}

// The frame around every screen. The design's rail, header, game strip, steps and tab bar live in <Shell>;
// this only loads what the first paint needs.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { ws, user } = await currentWorkspace();
  const admin = isAdmin(user.email);
  const state = await loadStudioState(ws.id, cookies().get("vl-project")?.value ?? null);

  return (
    <Shell state={state} wsName={ws.name} isDemo={ws.is_demo} admin={admin} signOut={signOut}>
      {children}
    </Shell>
  );
}
