import AutoRefresh from "@/components/AutoRefresh";
import JobNotice from "@/components/JobNotice";
import LibraryView from "@/components/studio/LibraryView";
import { currentWorkspace } from "@/lib/workspace";
import { platformName } from "@/lib/publish/platforms";
import type { InboxItem, LibItem, LibResult } from "./types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Pub = { id: string; video_id: string; platforms: string[]; status: string; scheduled_at: string | null; results: Record<string, { success?: boolean; url?: string }> | null; created_at: string };

const PILL: Record<string, string> = { posted: "Posted", draft: "Draft", scheduled: "Scheduled" };

export default async function Library() {
  const { db, ws } = await currentWorkspace();
  const [{ data: videos }, { data: pubs }, { data: notes }, { data: recs }] = await Promise.all([
    db.from("vl_videos").select("id,idea_id,recording_id,title,status,template,output_path,duration_s,error,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    db.from("vl_publish_jobs").select("id,video_id,platforms,status,scheduled_at,results,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    db.from("vl_video_notes").select("id,video_id,status,sent_at,created_at,token,contact:vl_crm_contacts(name)").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    db.from("vl_recordings").select("id,idea_id,path,duration_s,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(40),
  ]);

  const noteIds = (notes ?? []).map((n) => n.id as string);
  const { data: views } = noteIds.length ? await db.from("vl_note_views").select("note_id").in("note_id", noteIds) : { data: [] as { note_id: string }[] };
  const opens = new Map<string, number>();
  (views ?? []).forEach((v) => opens.set(v.note_id, (opens.get(v.note_id) ?? 0) + 1));

  const videoOf = new Map((videos ?? []).map((v) => [v.id as string, v]));
  const noted = new Set((notes ?? []).map((n) => n.video_id as string | null).filter(Boolean) as string[]);
  const urlOf = (path: string | null) => (path ? db.storage.from("vl-videos").getPublicUrl(path).data.publicUrl : null);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const items: LibItem[] = [];
  for (const v of videos ?? []) {
    if (v.status !== "ready" || noted.has(v.id as string)) continue;
    const mine = ((pubs ?? []) as Pub[]).filter((p) => p.video_id === v.id);
    const live = mine.find((p) => ["published", "simulated", "partial"].includes(p.status));
    const later = mine.find((p) => p.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now() && ["scheduled", "queued", "publishing"].includes(p.status));
    const pick = live ?? later;
    const results: LibResult[] = pick
      ? pick.platforms.map((p) => {
          const r = pick.results?.[p];
          return { name: platformName(p), ok: r ? r.success !== false : pick === later ? null : true, url: r?.url };
        })
      : [];
    const st = live ? "posted" : later ? "scheduled" : "draft";
    items.push({
      id: v.id as string, videoId: v.id as string, kind: "video", t: String(v.title), st, pill: PILL[st],
      when: (live ? live.created_at : later ? later.scheduled_at! : v.created_at) as string,
      whenKind: live ? "posted" : later ? "scheduled" : "made",
      pl: pick ? pick.platforms.map(platformName) : [], results, opens: 0, len: Number(v.duration_s ?? 0), th: String(v.template),
      videoUrl: urlOf(v.output_path as string | null), ideaId: (v.idea_id as string | null) ?? null, canRerender: !!v.recording_id, shareUrl: urlOf(v.output_path as string | null),
    });
  }
  for (const n of notes ?? []) {
    const v = n.video_id ? videoOf.get(n.video_id as string) : null;
    if (!v || v.status !== "ready") continue;
    const contact = (Array.isArray(n.contact) ? n.contact[0] : n.contact) as { name: string } | null;
    items.push({
      id: n.id as string, videoId: v.id as string, kind: "note", t: contact ? `Note to ${contact.name}` : String(v.title), st: "note",
      pill: n.status === "sent" ? "Note sent" : "Note draft", when: (n.sent_at ?? n.created_at) as string, whenKind: n.status === "sent" ? "sent" : "made",
      pl: ["Private link"], results: [], opens: opens.get(n.id as string) ?? 0, len: Number(v.duration_s ?? 0), th: String(v.template),
      videoUrl: urlOf(v.output_path as string | null), ideaId: (v.idea_id as string | null) ?? null, canRerender: !!v.recording_id, shareUrl: `${base}/v/${n.token}`,
    });
  }
  items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  // recordings waiting to be edited, edits in progress, and edits that failed
  const used = new Set((videos ?? []).map((v) => v.recording_id as string | null).filter(Boolean) as string[]);
  const waiting = (recs ?? []).filter((r) => !used.has(r.id as string));
  const ideaIds = [...new Set([...waiting.map((r) => r.idea_id as string | null), ...(videos ?? []).map((v) => v.idea_id as string | null)].filter(Boolean) as string[])];
  const { data: ideas } = ideaIds.length ? await db.from("vl_ideas").select("id,hook").in("id", ideaIds) : { data: [] as { id: string; hook: string }[] };
  const hook = new Map((ideas ?? []).map((i) => [i.id as string, String(i.hook)]));
  const paths = waiting.map((r) => r.path as string);
  const { data: caps } = paths.length ? await db.from("vl_capture_sessions").select("path").in("path", paths) : { data: [] as { path: string }[] };
  const phone = new Set((caps ?? []).map((c) => c.path));

  const inbox: InboxItem[] = [
    ...(videos ?? []).filter((v) => v.status === "queued" || v.status === "processing").map((v): InboxItem => ({
      id: v.id as string, kind: "editing", t: String(v.title), sec: Number(v.duration_s ?? 0), when: v.created_at as string, videoId: v.id as string,
      note: v.status === "queued" ? "Waiting for the editor. This page updates by itself." : "Being edited now. Edits take a few minutes.",
    })),
    ...(videos ?? []).filter((v) => v.status === "failed").map((v): InboxItem => ({
      id: v.id as string, kind: "failed", t: String(v.title), sec: Number(v.duration_s ?? 0), when: v.created_at as string, videoId: v.id as string,
      note: String(v.error || "The edit did not finish."),
    })),
    ...waiting.map((r): InboxItem => ({
      id: r.id as string, kind: "recording", t: (r.idea_id && hook.get(r.idea_id as string)) || "Untitled recording", sec: Number(r.duration_s ?? 0),
      when: r.created_at as string, fromPhone: phone.has(r.path as string),
    })),
  ];

  const busy =
    (videos ?? []).some((v) => v.status === "queued" || v.status === "processing") ||
    ((pubs ?? []) as Pub[]).some((p) => p.status === "queued" || p.status === "publishing");

  return (
    <>
      <AutoRefresh active={busy} />
      <JobNotice kinds={["render_video", "publish_video"]} />
      <LibraryView items={items} inbox={inbox} demo={ws.is_demo} />
    </>
  );
}
