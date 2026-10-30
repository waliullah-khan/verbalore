import type { Beat, Mode, Out } from "./types";
import { fromTo, fromToLate, n2, rng, set } from "./kit";

// Where the graphic sits for each speaker layout, so bursts go off around what is being shown.
export const center = (m: Mode) => (m === "bottom" ? { x: 540, y: 430 } : m === "full" ? { x: 540, y: 660 } : { x: 540, y: 1040 });

type Piece = { style?: string; inner?: string; cls?: string };

// Shapes thrown out from the middle of the graphic on the beat, then gone.
export function burst(
  b: Beat,
  o: { n: number; at?: number; dist?: [number, number]; dur?: number; make: (k: number, r: () => number) => Piece; ease?: string; spin?: number; salt?: number }
): Out {
  const r = rng(b.seed + (o.salt ?? 1));
  const c = center(b.mode);
  const at = o.at ?? Math.max(0, b.start - 0.05);
  const [d0, d1] = o.dist ?? [160, 440];
  const dur = o.dur ?? 0.7;
  const html: string[] = [];
  const js: string[] = [];
  for (let k = 0; k < o.n; k++) {
    const ang = (k / o.n) * Math.PI * 2 + r() * 0.5;
    const d = d0 + r() * (d1 - d0);
    const p = o.make(k, r);
    html.push(`<div class="bs bs${k} ${p.cls ?? ""}" style="position:absolute;left:${c.x}px;top:${c.y}px;${p.style ?? ""}">${p.inner ?? ""}</div>`);
    const sel = `#s${b.i} .bs${k}`;
    js.push(
      fromTo(sel, { x: 0, y: 0, scale: 0.2, rotation: 0, autoAlpha: 1 }, { x: Math.round(Math.cos(ang) * d), y: Math.round(Math.sin(ang) * d), scale: 1, rotation: Math.round((r() - 0.5) * (o.spin ?? 360)), duration: dur, ease: o.ease ?? "power3.out" }, at),
      fromToLate(sel, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.25, ease: "power1.in" }, n2(at + dur * 0.75))
    );
  }
  return { html: html.join(""), js: js.join("\n") };
}

// Background pieces that drift for the whole video in one linear tween each.
export function drift(
  seed: number,
  dur: number,
  o: { n: number; make: (k: number, r: () => number) => Piece & { x?: number; y?: number }; dx: [number, number]; dy: [number, number]; rot?: number; ease?: string; cls?: string; area?: [number, number] }
): Out {
  const r = rng(seed);
  const [aw, ah] = o.area ?? [1080, 1920];
  const html: string[] = [];
  const js: string[] = [];
  for (let k = 0; k < o.n; k++) {
    const p = o.make(k, r);
    const x = Math.round(p.x ?? r() * aw);
    const y = Math.round(p.y ?? r() * ah);
    html.push(`<div class="dr dr${k} ${o.cls ?? ""} ${p.cls ?? ""}" style="position:absolute;left:${x}px;top:${y}px;${p.style ?? ""}">${p.inner ?? ""}</div>`);
    const mv = (lo: number, hi: number) => Math.round(lo + r() * (hi - lo));
    js.push(fromTo(`#bg .dr${k}`, { x: 0, y: 0, rotation: 0 }, { x: mv(...o.dx), y: mv(...o.dy), rotation: o.rot ? Math.round((r() - 0.5) * o.rot) : 0, duration: dur, ease: o.ease ?? "none" }, 0));
  }
  return { html: html.join(""), js: js.join("\n") };
}

// A swinging back and forth that always fits a window, for things that should never sit still.
export function sway(sel: string, from: Record<string, number>, to: Record<string, number>, cycle: number, dur: number, ease = "sine.inOut", at = 0) {
  const repeat = Math.max(1, Math.floor(dur / cycle) - 1);
  return fromTo(sel, from, { ...to, duration: cycle, repeat: repeat % 2 === 0 ? repeat + 1 : repeat, yoyo: true, ease }, at);
}

// Chunky pixel sprites drawn with box-shadows, so they stay crisp at any scale.
export function sprite(bits: string[], colors: Record<string, string>, px: number): string {
  const sh: string[] = [];
  bits.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && colors[ch] && sh.push(`${(x + 1) * px}px ${(y + 1) * px}px 0 ${colors[ch]}`)));
  return `<span style="display:block;width:${px}px;height:${px}px;background:transparent;box-shadow:${sh.join(",")}"></span>`;
}

export const SPRITES = {
  heart: ["..rr.rr..", ".rrrrrrr.", ".rrrrrrr.", "..rrrrr..", "...rrr...", "....r...."],
  coin: ["..yyyy..", ".yyyyyy.", "yyyoyyyy", "yyyoyyyy", ".yyyyyy.", "..yyyy.."],
  star: ["....y....", "...yyy...", "yyyyyyyyy", ".yyyyyyy.", "..yyyyy..", ".yyy.yyy.", ".yy...yy."],
  gem: ["..bbbb..", ".bwbbbb.", "bbbbbbbb", ".bbbbbb.", "..bbbb..", "...bb..."],
  bolt: ["...yy.", "..yy..", ".yyyy.", "..yy..", ".yy...", "yy...."],
} as const;

export { set };
