import { notFound } from "next/navigation";
import { currentWorkspace } from "@/lib/workspace";
import type { Idea } from "@/lib/ideas/types";
import { playbook, THEMES } from "@/lib/usecases";
import Studio from "./Studio";

export default async function StudioPage({ params, searchParams }: { params: { id: string }; searchParams: { note?: string } }) {
  const { db, ws } = await currentWorkspace();
  const { data } = await db.from("vl_ideas").select("id,angle,script,use_case").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const idea = data as Pick<Idea, "angle" | "script"> & { id: string; use_case: string };
  const themes = playbook(idea.use_case).themes.map((id) => ({ id, ...THEMES[id] }));
  return <Studio ideaId={idea.id} workspaceId={ws.id} title={idea.angle} beats={idea.script.beats} themes={themes} noteId={searchParams.note} />;
}
