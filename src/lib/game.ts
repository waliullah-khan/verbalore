import type { SupabaseClient } from "@supabase/supabase-js";

// Everything here is counted from what a workspace has actually done. Nothing is made up and nothing is awarded for opening the app.
export type Activity = {
  videoTimes: number[]; // ready videos, as epoch milliseconds
  templates: string[];
  renderMs: number[];
  published: number;
  notesSent: number;
  noteViews: number;
  ideas: number;
  accounts: number;
};

const DAY = 86_400_000;
export const WEEK_GOAL = 5;
const LEVELS = [0, 250, 600, 1000, 1500, 2100, 2800, 3600];
const LEVEL_NAMES = ["Newcomer", "Scriptwriter", "On Camera", "Storyteller", "Director", "Showrunner", "Headliner", "Legend"];

const dayOf = (ms: number) => Math.floor(ms / DAY);

export const multiplier = (day: number) => 1 + Math.min(Math.max(day, 1) - 1, 13) / 13;

export function streaks(times: number[], now = Date.now()) {
  const days = [...new Set(times.map(dayOf))].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  // today may not be posted yet, so the streak stays alive until the day ends
  const last = days[days.length - 1];
  const today = dayOf(now);
  const current = last === undefined || last < today - 1 ? 0 : run;
  return { current, longest, postedToday: last === today };
}

export function xpOf(a: Activity) {
  const byDay = new Map<number, number>();
  a.videoTimes.forEach((t) => byDay.set(dayOf(t), (byDay.get(dayOf(t)) ?? 0) + 1));
  const days = [...byDay.keys()].sort((x, y) => x - y);
  let run = 0;
  let xp = 0;
  days.forEach((d, i) => {
    run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
    xp += Math.round(100 * multiplier(run)) + Math.min((byDay.get(d) ?? 1) - 1, 2) * 30;
  });
  return xp + a.published * 20 + a.notesSent * 40 + a.noteViews * 25;
}

export function level(xp: number) {
  let i = 0;
  LEVELS.forEach((at, n) => { if (xp >= at) i = n; });
  const floor = LEVELS[i];
  const ceil = LEVELS[i + 1] ?? floor + 1000;
  return { n: i + 1, name: LEVEL_NAMES[i], floor, ceil, frac: Math.min(1, (xp - floor) / (ceil - floor)) };
}

export function thisWeek(times: number[], now = Date.now()) {
  return times.filter((t) => t > now - 7 * DAY).length;
}

function busiestWeek(times: number[]) {
  const t = [...times].sort((a, b) => a - b);
  let best = 0;
  let from = 0;
  t.forEach((x, i) => {
    while (x - t[from] >= 7 * DAY) from++;
    best = Math.max(best, i - from + 1);
  });
  return best;
}

export type Badge = { id: string; family: string; name: string; sub: string; glyph: string; how: string; need: number; have: number; unit: string };

export function badges(a: Activity, now = Date.now()): Badge[] {
  const s = streaks(a.videoTimes, now);
  const mk = (id: string, family: string, name: string, sub: string, glyph: string, how: string, have: number, need: number, unit: string): Badge => ({ id, family, name, sub, glyph, how, have, need, unit });
  return [
    mk("spark", "Streak", "Spark", "3 day streak", "3", "Post on three days in a row", s.longest, 3, "days"),
    mk("kindling", "Streak", "Kindling", "7 day streak", "7", "Post on seven days in a row", s.longest, 7, "days"),
    mk("torch", "Streak", "Torch", "30 day streak", "30", "Post on thirty days in a row", s.longest, 30, "days"),
    mk("beacon", "Streak", "Beacon", "100 day streak", "100", "Post on a hundred days in a row", s.longest, 100, "days"),
    mk("first-take", "Craft", "First Take", "first video", "1", "Finish your first edited video", a.videoTimes.length, 1, "videos"),
    mk("clean-cut", "Craft", "Clean Cut", "edited under 3 min", "3m", "Have a video edited in under three minutes", a.renderMs.filter((m) => m > 0 && m <= 180_000).length, 1, "videos"),
    mk("collector", "Craft", "Style Collector", "five edit styles", "5", "Make videos in five different edit styles", new Set(a.templates).size, 5, "styles"),
    mk("hot-week", "Craft", "Hot Week", "5 videos in a week", "5x", "Finish five videos inside seven days", busiestWeek(a.videoTimes), 5, "videos"),
    mk("on-air", "Reach", "On Air", "first post", "ON", "Publish a video to a connected account", a.published, 1, "posts"),
    mk("idea-hunter", "Reach", "Idea Hunter", "20 ideas found", "20", "Have twenty ideas generated for you", a.ideas, 20, "ideas"),
    mk("watcher", "Signals", "Account Watcher", "5 accounts", "5", "Watch five organizations for signals", a.accounts, 5, "accounts"),
    mk("sniper", "Signals", "Signal Sniper", "first video note", "!", "Send your first video note", a.notesSent, 1, "notes"),
    mk("opened", "Signals", "Opened", "a note was watched", "OP", "Get a video note opened by the person it was for", a.noteViews, 1, "opens"),
  ];
}

export async function loadActivity(db: SupabaseClient, workspaceId: string): Promise<Activity> {
  const count = async (table: string, f: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { count: n } = await f(db.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId));
    return (n as number | null) ?? 0;
  };
  const [{ data: videos }, published, ideas, accounts, { data: notes }] = await Promise.all([
    db.from("vl_videos").select("created_at,template,render_ms").eq("workspace_id", workspaceId).eq("status", "ready"),
    count("vl_publish_jobs", (q) => q.eq("status", "done")),
    count("vl_ideas", (q) => q.not("status", "in", "(note,signal)")),
    count("vl_crm_accounts", (q) => q),
    db.from("vl_video_notes").select("id,status").eq("workspace_id", workspaceId),
  ]);
  const noteIds = (notes ?? []).map((n) => n.id as string);
  let noteViews = 0;
  if (noteIds.length) {
    const { count: n } = await db.from("vl_note_views").select("id", { count: "exact", head: true }).in("note_id", noteIds);
    noteViews = n ?? 0;
  }
  return {
    videoTimes: (videos ?? []).map((v) => new Date(v.created_at as string).getTime()),
    templates: (videos ?? []).map((v) => String(v.template)),
    renderMs: (videos ?? []).map((v) => Number(v.render_ms ?? 0)),
    published,
    notesSent: (notes ?? []).filter((n) => n.status === "sent").length,
    noteViews,
    ideas,
    accounts,
  };
}
