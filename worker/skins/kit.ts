// Small helpers shared by the engine and every skin. Everything here runs at compose time, so the
// page itself only ever contains a fixed timeline: no clocks, no unseeded randomness.

export const W = 1080;
export const H = 1920;

export const n2 = (n: number) => Number(n.toFixed(2));
export const esc = (s: string) => s.replace(/`/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const q = (s: string) => JSON.stringify(s);

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

type Vars = Record<string, unknown>;
const obj = (v: Vars) => JSON.stringify(v);

// timeline line builders
export const fromTo = (sel: string, from: Vars, to: Vars, at: number) => `tl.fromTo(${q(sel)}, ${obj(from)}, ${obj(to)}, ${n2(at)});`;
// For elements that many beats animate (overlays, the speaker): without this GSAP applies the LAST tween's start state
// at time zero and the first beat starts under a wipe panel.
export const fromToLate = (sel: string, from: Vars, to: Vars, at: number) => `tl.fromTo(${q(sel)}, ${obj(from)}, ${obj({ ...to, immediateRender: false })}, ${n2(at)});`;
export const to = (sel: string, v: Vars, at: number) => `tl.to(${q(sel)}, ${obj(v)}, ${n2(at)});`;
export const set = (sel: string, v: Vars, at: number) => `tl.set(${q(sel)}, ${obj(v)}, ${n2(at)});`;

// a finite number of repeats that always fits inside a window
export const reps = (window: number, cycle: number) => Math.max(0, Math.floor(window / cycle) - 1);

export const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

const STOP = new Set("the a an and or but if so to of in on at for with from by is are was were be been it its this that these those you your we our they their i me my he she his her as not no do does did just very really more most than then there here what when where which who how why into out up down over under about all any some can will would should could have has had".split(" "));

// The word worth emphasising: the longest one that is not filler, preferring numbers.
export function keywordOf(text: string): string {
  const toks = text.split(/\s+/).map((t) => t.replace(/^[^\w$%]+|[^\w$%]+$/g, "")).filter(Boolean);
  const num = toks.find((t) => /\d/.test(t));
  if (num) return num;
  let best = "";
  for (const t of toks) if (!STOP.has(t.toLowerCase()) && t.length > best.length) best = t;
  return best || toks[0] || "";
}

// words split into masked spans so a tween can reveal them one at a time; the keyword is marked
export function wordSpans(text: string, keyword: string): string {
  const kw = clean(keyword);
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="w"><span class="wi${kw && clean(w) === kw ? " kw" : ""}">${esc(w)}</span></span>`)
    .join(" ");
}

// font size for a headline: shorter lines are set bigger
export function fit(text: string, big: number, small: number) {
  const len = text.length;
  if (len <= 14) return big;
  if (len >= 60) return small;
  return Math.round(big - ((big - small) * (len - 14)) / 46);
}

// Digits roll like an odometer, so a number counts up with plain transforms and nothing to recompute on seek.
export function odometer(text: string, cls = "odo") {
  const cols: string[] = [];
  const targets: number[] = [];
  for (const ch of text) {
    if (/\d/.test(ch)) {
      const d = Number(ch);
      targets.push(d);
      const seq = Array.from({ length: 20 }, (_, k) => k % 10).concat(d);
      cols.push(`<span class="${cls}-c"><span class="${cls}-r">${seq.map((x) => `<i>${x}</i>`).join("")}</span></span>`);
    } else {
      cols.push(`<span class="${cls}-s">${esc(ch)}</span>`);
    }
  }
  return { html: `<span class="${cls}">${cols.join("")}</span>`, targets };
}

// the numeric part of a stat, for rings and bars
export function numberOf(stat: string): number | null {
  const m = stat.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// stepped easing for skins that move on twos or in chunky pixel jumps
export const stepEase = (fps: number, secs: number) => `steps(${Math.max(1, Math.round(secs * fps))})`;
