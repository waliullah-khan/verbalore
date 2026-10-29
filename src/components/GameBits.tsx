import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { level, loadActivity, streaks, thisWeek, WEEK_GOAL, xpOf, type Badge } from "@/lib/game";

const C = 2 * Math.PI * 19;

export function Ring({ frac, label, size = "2.6rem" }: { frac: number; label?: string; size?: string }) {
  const off = C * (1 - Math.min(1, Math.max(0, frac)));
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r="19" fill="none" stroke="var(--paper-2)" strokeWidth="6" />
        <circle cx="24" cy="24" r="19" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} className="ring-arc" style={{ ["--from" as string]: C }} />
      </svg>
    </span>
  );
}

// A medal in the shape of the reference: a ring, a face, the name set around the edge and a mark in the middle.
export function Medal({ b }: { b: Badge }) {
  const on = b.have >= b.need;
  const id = `arc-${b.id}`;
  return (
    <div className={`medal grid justify-items-center gap-1.5 text-center ${on ? "on" : "locked"}`}>
      <svg viewBox="0 0 120 120" className="h-28 w-28 overflow-visible" role="img" aria-label={`${b.name}, ${on ? "unlocked" : `${b.have} of ${b.need} ${b.unit}`}`}>
        <defs><path id={id} d="M60,60 m-39,0 a39,39 0 1,1 78,0 a39,39 0 1,1 -78,0" /></defs>
        <circle className="ring" cx="60" cy="60" r="55" />
        <circle className="face" cx="60" cy="60" r="51" />
        <text className="arc"><textPath href={`#${id}`} textLength="240" lengthAdjust="spacing">{`${b.name} - ${b.sub} - `.toUpperCase()}</textPath></text>
        <text className="glyph" x="60" y="72">{b.glyph}</text>
      </svg>
      <b className="text-sm">{b.name}</b>
      <small className="muted max-w-[11rem] text-xs">{on ? b.how : `${Math.min(b.have, b.need)} of ${b.need} ${b.unit}`}</small>
    </div>
  );
}

// The strip on Today: the streak, this week's goal and level. It reads real activity, so a new workspace starts at zero.
export async function GameStrip({ db, workspaceId }: { db: SupabaseClient; workspaceId: string }) {
  const a = await loadActivity(db, workspaceId);
  const s = streaks(a.videoTimes);
  const lv = level(xpOf(a));
  const week = thisWeek(a.videoTimes);
  return (
    <div className="g-on card mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 !py-3">
      <div className="flex items-center gap-3">
        <Ring frac={s.current / 14} label={`${s.current} day streak`} />
        <div className="leading-tight"><span className="muted block text-[0.7rem] font-bold uppercase tracking-wider">Streak</span><b className="display text-xl">{s.current} {s.current === 1 ? "day" : "days"}</b></div>
      </div>
      <div className="leading-tight"><span className="muted block text-[0.7rem] font-bold uppercase tracking-wider">This week</span><b className="display text-xl">{week} of {WEEK_GOAL} videos</b></div>
      <div className="g-full leading-tight"><span className="muted block text-[0.7rem] font-bold uppercase tracking-wider">Level {lv.n}</span><b className="display text-xl">{lv.name}</b></div>
      <div className="g-full min-w-[9rem] flex-1">
        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--paper-2)" }}><i className="block h-full rounded-full" style={{ width: `${lv.frac * 100}%`, background: "var(--accent)" }} /></div>
        <span className="muted mono text-xs">{Math.round(xpOf(a))} XP</span>
      </div>
      <Link href="/rewards" className="btn btn-ghost ml-auto !min-h-[2.25rem]">{s.postedToday ? "Today is done" : "Post to keep it going"}</Link>
    </div>
  );
}
