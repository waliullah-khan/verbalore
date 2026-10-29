import { currentWorkspace } from "@/lib/workspace";
import { badges, boss, loadActivity, streaks, xpOf } from "@/lib/game";
import { ticketsEarned } from "@/lib/studio-state";
import { serviceClient } from "@/lib/supabase/service";
import TeamScreen, { type TeamData } from "@/components/studio/TeamScreen";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// The art in the design that stands for each badge.
const ICON: Record<string, string> = {
  spark: "streak", kindling: "streak", torch: "streak", beacon: "streak",
  "first-take": "camera", "clean-cut": "pen", collector: "folder", "hot-week": "battery",
  "on-air": "plane", "idea-hunter": "bulb", watcher: "pin", sniper: "search", opened: "mailbox", "page-turner": "notes",
};

const nameOf = (email?: string | null) => {
  const n = (email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim();
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "Member";
};

const platformsOf = (p: unknown) =>
  (Array.isArray(p) ? p : [])
    .map((x) => (typeof x === "string" ? x : (x as { platform?: string; name?: string })?.platform ?? (x as { name?: string })?.name))
    .filter(Boolean)
    .join(", ");

export default async function Team() {
  const { db, ws, user } = await currentWorkspace();
  const a = await loadActivity(db, ws.id);
  const b = boss(a);

  // the squad is the workspace's real members, you first
  const { data: members } = await db.from("vl_members").select("user_id").eq("workspace_id", ws.id);
  const others = (members ?? []).filter((m) => m.user_id !== user.id).slice(0, 3);
  const sdb = await serviceClient();
  const crew: TeamData["crew"] = [
    { name: "You", you: true },
    ...(await Promise.all(others.map(async (m) => ({ name: nameOf((await sdb.auth.admin.getUserById(m.user_id as string)).data.user?.email), you: false })))),
  ];
  const who = crew.length > 1 ? "Your team" : "You";

  // recent activity, newest first
  const [{ data: vids }, { data: pubs }, { data: notes }] = await Promise.all([
    db.from("vl_videos").select("id,title,created_at").eq("workspace_id", ws.id).eq("status", "ready").order("created_at", { ascending: false }).limit(6),
    db.from("vl_publish_jobs").select("video_id,platforms,created_at").eq("workspace_id", ws.id).eq("status", "done").order("created_at", { ascending: false }).limit(6),
    db.from("vl_video_notes").select("sent_to,sent_at").eq("workspace_id", ws.id).eq("status", "sent").order("sent_at", { ascending: false }).limit(6),
  ]);
  const titles = new Map((vids ?? []).map((v) => [v.id as string, v.title as string]));
  const missing = (pubs ?? []).map((p) => p.video_id as string).filter((id) => id && !titles.has(id));
  if (missing.length) {
    const { data } = await db.from("vl_videos").select("id,title").in("id", missing);
    (data ?? []).forEach((v) => titles.set(v.id as string, v.title as string));
  }
  const activity = [
    ...(vids ?? []).map((v) => ({ text: `${who} made “${v.title}”`, at: v.created_at as string })),
    ...(pubs ?? []).map((p) => ({ text: `${who} posted “${titles.get(p.video_id as string) ?? "a video"}”${platformsOf(p.platforms) ? ` to ${platformsOf(p.platforms)}` : ""}`, at: p.created_at as string })),
    ...(notes ?? []).filter((n) => n.sent_at).map((n) => ({ text: `${who} sent a video note${n.sent_to ? ` to ${n.sent_to}` : ""}`, at: n.sent_at as string })),
  ]
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
    .slice(0, 4);

  const data: TeamData = {
    wsId: ws.id,
    wsName: ws.name,
    crew,
    postedToday: streaks(a.videoTimes).postedToday,
    hits: b.hits.map((h) => ({ t: h.t, dmg: h.dmg })),
    hpMax: b.hpMax,
    left: b.left,
    slain: b.slain,
    killedAt: b.killedAt,
    tickets: ticketsEarned(a),
    xp: xpOf(a),
    badges: badges(a).map((x) => ({ id: x.id, name: x.name, how: x.how, unit: x.unit, have: x.have, need: x.need, icon: ICON[x.id] ?? "trophy" })),
    activity,
  };

  return <TeamScreen data={data} />;
}
