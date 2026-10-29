import { currentWorkspace } from "@/lib/workspace";
import { badges, level, loadActivity, multiplier, streaks, thisWeek, WEEK_GOAL, xpOf } from "@/lib/game";
import { Medal, Ring } from "@/components/GameBits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Rewards() {
  const { db, ws } = await currentWorkspace();
  const a = await loadActivity(db, ws.id);
  const s = streaks(a.videoTimes);
  const xp = xpOf(a);
  const lv = level(xp);
  const week = thisWeek(a.videoTimes);
  const all = badges(a);
  const got = all.filter((b) => b.have >= b.need).length;
  const next = all.filter((b) => b.have < b.need).sort((x, y) => y.have / y.need - x.have / x.need)[0];
  const families = [...new Set(all.map((b) => b.family))];

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Rewards</p>
        <h1 className="mt-1 text-[2rem]">Showing up is the game.</h1>
        <p className="muted mt-1 max-w-xl">Every point is counted from a real video, post or note in this workspace. Nothing is awarded for opening the app.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card flex items-center gap-4">
          <Ring frac={s.current / 14} size="5.5rem" label={`${s.current} day streak`} />
          <div>
            <p className="muted text-xs font-bold uppercase tracking-wider">Streak</p>
            <p className="display text-3xl">{s.current} <span className="text-lg">{s.current === 1 ? "day" : "days"}</span></p>
            <p className="muted text-sm">Longest {s.longest}. {s.postedToday ? "Today is done." : "One video today keeps it alive."}</p>
          </div>
        </div>
        <div className="card">
          <p className="muted text-xs font-bold uppercase tracking-wider">Level {lv.n}</p>
          <p className="display text-3xl">{lv.name}</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--paper-2)" }}><i className="block h-full rounded-full" style={{ width: `${lv.frac * 100}%`, background: "var(--accent)" }} /></div>
          <p className="muted mono mt-1 text-sm">{xp} / {lv.ceil} XP</p>
        </div>
        <div className="card">
          <p className="muted text-xs font-bold uppercase tracking-wider">This week</p>
          <p className="display text-3xl">{week} <span className="text-lg">of {WEEK_GOAL} videos</span></p>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            {Array.from({ length: WEEK_GOAL }, (_, i) => (
              <i key={i} className="h-2.5 flex-1 rounded-full" style={{ background: i < week ? "var(--accent)" : "var(--paper-2)" }} />
            ))}
          </div>
          <p className="muted mt-2 text-sm">{week >= WEEK_GOAL ? "Weekly goal reached." : `${WEEK_GOAL - week} more to hit the goal.`}</p>
        </div>
      </section>

      {next && (
        <section className="card flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "var(--accent)" }}>
          <div>
            <p className="eyebrow">Next badge</p>
            <p className="display text-xl">{next.name}</p>
            <p className="muted text-sm">{next.how}. {Math.min(next.have, next.need)} of {next.need} {next.unit} so far.</p>
          </div>
          <span className="chip">{got} of {all.length} unlocked</span>
        </section>
      )}

      {families.map((f) => (
        <section key={f} className="space-y-3">
          <h2 className="text-xl">{f}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {all.filter((b) => b.family === f).map((b) => <Medal key={b.id} b={b} />)}
          </div>
        </section>
      ))}

      <section className="card space-y-2">
        <h2 className="text-xl">How points work</h2>
        <ul className="muted grid gap-1.5 text-sm">
          <li><b className="text-[var(--ink)]">A day you post</b> is worth 100 XP, times a streak multiplier that climbs from 1.0 on day one to {multiplier(14).toFixed(1)} on day 14 and holds.</li>
          <li><b className="text-[var(--ink)]">A second or third video</b> in a day adds 30 XP each. More than that adds nothing, so volume cannot be farmed.</li>
          <li><b className="text-[var(--ink)]">A published post</b> adds 20, <b className="text-[var(--ink)]">a video note sent</b> adds 40, and <b className="text-[var(--ink)]">a note someone opens</b> adds 25.</li>
          <li>A streak stays alive until the day ends, so today never counts against you until it is over.</li>
        </ul>
      </section>
    </div>
  );
}
