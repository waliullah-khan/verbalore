import { notFound } from "next/navigation";
import EditView from "@/components/studio/EditView";
import { currentWorkspace } from "@/lib/workspace";
import type { EditScene } from "../../types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function EditVideo({ params }: { params: { id: string } }) {
  const { db, ws } = await currentWorkspace();
  const { data: v } = await db.from("vl_videos").select("*").eq("id", params.id).eq("workspace_id", ws.id).maybeSingle();
  if (!v) notFound();

  const scenes = (Array.isArray(v.scene_plan) ? v.scene_plan : []) as EditScene[];
  const url = v.output_path ? `${db.storage.from("vl-videos").getPublicUrl(v.output_path).data.publicUrl}?v=${v.render_ms ?? 0}` : null;

  return (
    <EditView
      key={`${v.status}-${v.render_ms ?? 0}-${v.template}`}
      video={{
        id: v.id as string,
        title: String(v.title),
        status: String(v.status),
        error: (v.error as string | null) ?? "",
        template: String(v.template),
        duration: Number(v.duration_s ?? 0),
        url,
        ideaId: (v.idea_id as string | null) ?? null,
        canRerender: !!v.recording_id,
      }}
      scenes={scenes.map((s) => ({ type: s.type, start: s.start, end: s.end, text: s.text, headline: s.headline, sub: s.sub, stat: s.stat, items: s.items }))}
    />
  );
}
