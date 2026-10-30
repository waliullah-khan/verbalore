import { cache } from "react";
import { supabaseServer } from "./supabase/server";
import { level, loadActivity, streaks, thisWeek, WEEK_GOAL, xpOf, type Activity } from "./game";

// What the shell and the Home screen need to know about where this person is in making today's video.
// Every value is read from the workspace. Nothing here is a sample.
export type Next = "today" | "record" | "edit" | "post" | "done";
export type Screen = "home" | "today" | "record" | "edit" | "post" | "library" | "signals" | "team";

export type StudioState = {
  next: Next;
  ideaId: string | null;
  videoId: string | null;
  hrefs: Record<Screen, string>;
  status: Record<Screen, string>;
  signalsOpen: number;
  ideasReady: number;
  game: {
    streak: number;
    week: number;
    weekGoal: number;
    teamPct: number;
    xp: number;
    levelN: number;
    levelHi: number;
    tickets: number;
    repDone: boolean;
  };
};

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (s: string | null | undefined): s is string => !!s && UUID.test(s);

export const fmt = (s: number) => {
  const n = Math.max(0, Math.round(s));
  return `${Math.floor(n / 60)}:${`0${n % 60}`.slice(-2)}`;
};

// One ticket for every day with a finished video, plus the streak milestones from the reference (day 7, 30, 100).
export function ticketsEarned(a: Activity) {
  const days = new Set(a.videoTimes.map((t) => Math.floor(t / DAY)));
  const longest = streaks(a.videoTimes).longest;
  return days.size + (longest >= 7 ? 2 : 0) + (longest >= 30 ? 5 : 0) + (longest >= 100 ? 10 : 0);
}

export const loadStudioState = cache(async (workspaceId: string, projectCookie: string | null): Promise<StudioState> => {
  const db = supabaseServer();
  const startOfToday = new Date(Math.floor(Date.now() / DAY) * DAY).toISOString();

  const [a, ideasReady, signalsOpen, publishedToday, idea] = await Promise.all([
    loadActivity(db, workspaceId),
    db.from("vl_ideas").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "new").then((r) => r.count ?? 0),
    db.from("vl_signals").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "new").then((r) => r.count ?? 0),
    db.from("vl_publish_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "done").gte("created_at", startOfToday).then((r) => r.count ?? 0),
    isId(projectCookie)
      ? db.from("vl_ideas").select("id").eq("workspace_id", workspaceId).eq("id", projectCookie).maybeSingle().then((r) => r.data?.id as string | undefined)
      : Promise.resolve(undefined),
  ]);

  // the project in progress: the idea they opened last, its take and its edit
  let ideaId = idea ?? null;
  let take: { duration_s: number | null } | null = null;
  let video: { id: string; status: string; duration_s: number | null; scene_plan: unknown } | null = null;
  let published = false;
  if (ideaId) {
    const [{ data: rec }, { data: vid }] = await Promise.all([
      db.from("vl_recordings").select("duration_s").eq("workspace_id", workspaceId).eq("idea_id", ideaId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("vl_videos").select("id,status,duration_s,scene_plan").eq("workspace_id", workspaceId).eq("idea_id", ideaId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    take = rec ?? null;
    video = vid ?? null;
    if (video) {
      const { count } = await db.from("vl_publish_jobs").select("id", { count: "exact", head: true }).eq("video_id", video.id).eq("status", "done");
      published = (count ?? 0) > 0;
    }
    // a finished and posted video starts a fresh project
    if (published) { ideaId = null; take = null; video = null; }
  }

  const repDone = publishedToday > 0;
  let next: Next = "today";
  if (repDone) next = "done";
  else if (ideaId) next = video ? (video.status === "ready" ? "post" : "edit") : take ? "edit" : "record";

  const s = streaks(a.videoTimes);
  const xp = xpOf(a);
  const lv = level(xp);
  const week = thisWeek(a.videoTimes);
  const scenes = Array.isArray(video?.scene_plan) ? (video!.scene_plan as unknown[]).length : 0;

  const hrefs: Record<Screen, string> = {
    home: "/home",
    today: "/ideas",
    record: ideaId ? `/studio/${ideaId}` : "/ideas",
    edit: video ? `/library/${video.id}/edit` : "/library",
    post: video ? `/library/${video.id}/post` : "/library",
    library: "/library",
    signals: "/signals",
    team: "/team",
  };

  const status: Record<Screen, string> = {
    home: "",
    today: repDone ? "Posted today" : `${ideasReady} idea${ideasReady === 1 ? "" : "s"} ready`,
    record: take ? `Take ready, ${fmt(Number(take.duration_s ?? 0))}` : "Ready to record",
    edit: video ? `${scenes} scene${scenes === 1 ? "" : "s"}, ${fmt(Number(video.duration_s ?? 0))}` : "Waiting for a take",
    post: repDone ? "Posted today" : "Not posted yet",
    library: `${a.videoTimes.length} video${a.videoTimes.length === 1 ? "" : "s"}`,
    signals: `${signalsOpen} ${signalsOpen === 1 ? "person" : "people"} to contact`,
    team: `Challenge ${Math.min(100, Math.round((week / WEEK_GOAL) * 100))}% done`,
  };

  return {
    next,
    ideaId,
    videoId: video?.id ?? null,
    hrefs,
    status,
    signalsOpen,
    ideasReady,
    game: {
      streak: s.current,
      week,
      weekGoal: WEEK_GOAL,
      teamPct: Math.min(100, Math.round((week / WEEK_GOAL) * 100)),
      xp,
      levelN: lv.n,
      levelHi: lv.ceil,
      tickets: ticketsEarned(a),
      repDone,
    },
  };
});
