// A scene as the editor plans it. The renderer reads headline for every scene, stat on number scenes,
// items on list scenes and sub on call-to-action scenes, so those are the fields a person can change.
export type PlanScene = {
  type: string;
  start: number;
  end: number;
  text: string;
  headline: string;
  sub?: string;
  stat?: string;
  items?: string[];
  [k: string]: unknown;
};

export type SceneEdit = { headline?: string; sub?: string; stat?: string; items?: string[] } | null;

const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// What each kind of scene lets a person change, so the panel and the server agree.
export const editable = (type: string) => ({
  stat: type === "stat",
  items: type === "list",
  sub: type === "cta",
});

// Timing, type and the spoken text always come from the stored plan; a request can only change the words on screen.
export function applyEdits(base: PlanScene[], edits: SceneEdit[]): PlanScene[] {
  return base.map((s, i) => {
    const e = edits[i];
    if (!e) return s;
    const out: PlanScene = { ...s };
    const can = editable(s.type);
    const head = clean(e.headline, 120);
    if (head) out.headline = head;
    if (can.sub && e.sub !== undefined) {
      const sub = clean(e.sub, 60);
      if (sub) out.sub = sub;
    }
    if (can.stat && e.stat !== undefined) {
      const stat = clean(e.stat, 14);
      if (stat) out.stat = stat;
    }
    if (can.items && Array.isArray(e.items)) {
      const items = e.items.map((x) => clean(x, 80)).filter(Boolean).slice(0, 6);
      if (items.length) out.items = items;
    }
    return out;
  });
}

// An edited plan is only used when it still fits the footage edge to edge; otherwise the renderer plans afresh.
export function usableOverride(plan: unknown, duration: number): PlanScene[] | null {
  if (!Array.isArray(plan) || plan.length === 0 || plan.length > 40) return null;
  const scenes = plan as PlanScene[];
  for (const s of scenes) {
    if (!s || typeof s.type !== "string" || typeof s.headline !== "string") return null;
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) return null;
  }
  for (let i = 1; i < scenes.length; i++) if (Math.abs(scenes[i].start - scenes[i - 1].end) > 0.25) return null;
  if (Math.abs(scenes[0].start) > 0.25 || Math.abs(scenes[scenes.length - 1].end - duration) > 1.5) return null;
  const fixed = scenes.map((s) => ({ ...s }));
  fixed[0].start = 0;
  fixed[fixed.length - 1].end = duration;
  return fixed;
}
