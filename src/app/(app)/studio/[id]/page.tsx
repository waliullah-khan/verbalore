import { notFound, redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/workspace";
import type { Idea } from "@/lib/ideas/types";
import { playbook } from "@/lib/usecases";
import RecordScreen from "@/components/studio/Record";
import type { RecentTake } from "@/components/studio/PhoneModal";

const when = (iso: string) => {
  const d = new Date(iso);
  const same = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return same ? `Today, ${time}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
};

export default async function StudioPage({ params, searchParams }: { params: { id: string }; searchParams: { note?: string } }) {
  const { db, ws } = await currentWorkspace();
  const { data } = await db.from("vl_ideas").select("id,angle,hook,script,use_case").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const idea = data as Pick<Idea, "angle" | "script"> & { id: string; hook: string | null; use_case: string };
  if (idea.script?.state || !idea.script?.beats?.length) redirect(`/ideas/${idea.id}`);

  // the takes this workspace has already received from a phone
  const { data: sessions } = await db
    .from("vl_capture_sessions")
    .select("id,created_at,duration_s,idea:vl_ideas(hook,angle)")
    .eq("workspace_id", ws.id)
    .eq("status", "uploaded")
    .order("created_at", { ascending: false })
    .limit(6);
  const recent: RecentTake[] = (sessions ?? []).map((s) => {
    const i = s.idea as unknown as { hook: string | null; angle: string } | null;
    return { id: s.id as string, title: i?.hook || i?.angle || "Untitled", seconds: Number(s.duration_s) || 0, when: when(s.created_at as string) };
  });

  return (
    <RecordScreen
      ideaId={idea.id}
      workspaceId={ws.id}
      hook={idea.hook || idea.script.beats[0]?.text || idea.angle}
      beats={idea.script.beats}
      template={playbook(idea.use_case).themes[0]}
      noteId={searchParams.note}
      recent={recent}
    />
  );
}
