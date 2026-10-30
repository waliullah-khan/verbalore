import type { Skin } from "../types";
import { SPRITES, burst, drift, sprite, sway } from "../decor";
import { fromTo, n2, rng, stepEase } from "../kit";

// Pixel art: chunky sprites, a fixed palette, stepped motion at 12 fps, parallax scenery.
const COL = { y: "#ffcd75", o: "#ef7d57", r: "#b13e53", b: "#41a6f6", w: "#f4f4f4" };

export const pixel: Skin = {
  id: "pixel",
  label: "Pixel art",
  blurb: "Chunky sprites and stepped, game-like motion",
  pal: () => ({ bg: "#1a1c2c", bg2: "#29366f", ink: "#f4f4f4", sub: "#94b0c2", accent: "#ffcd75", accent2: "#41a6f6", card: "#333c57", edge: "#566c86", onAccent: "#1a1c2c" }),
  fonts: ["pixel"],
  head: "'Press Start 2P', 'Courier New', monospace",
  body: "'Press Start 2P', 'Courier New', monospace",
  mono: "'Press Start 2P', 'Courier New', monospace",
  fontScale: 0.5,
  stepFps: 12,
  css: () => `
    #root { --hw: 400; --ls: 0px; --tt: uppercase; --rad: 0px; --rad-s: 0px; --bw: 6px; --cap: 'Press Start 2P', monospace; }
    .head, .mid, .kwword, .stk { line-height: 1.32; }
    .row, .fact, .col, .term { box-shadow: 8px 8px 0 #0e0f1a; }
    .sub { font-size: 27px; line-height: 1.5; } .eyebrow { font-size: 19px; letter-spacing: 3px; }
    .row { font-size: 28px; } .row .n { border-radius: 0; font-size: 26px; } .pill { font-size: 28px; box-shadow: 8px 8px 0 #0e0f1a; }
    .fact span { font-size: 17px; } .cmp .col p { font-size: 26px; line-height: 1.4; } .cmp .lab { font-size: 16px; }
    .tbody { font-size: 24px; } .tbar { font-size: 16px; } .badge { border-radius: 0; } .badge span { font-size: 14px; }
    .qmark { font-size: 150px; } .vs { border-radius: 0; font-size: 22px; }
    .cap { font-size: 36px; line-height: 1.35; } .cap-bar { background: #0e0f1a; border: 5px solid #566c86; border-radius: 0; text-shadow: none; }
    .l3 b { font-size: 22px; } .l3 span { font-size: 16px; }
    .px { position: absolute; background: #f4f4f4; }
  `,
  bg(c) {
    const r = rng(c.seed);
    const stars = Array.from({ length: 46 }, (_, k) => {
      const s = r() > 0.8 ? 10 : 6;
      return `<div class="px st${k}" style="left:${Math.round(r() * 1070)}px;top:${Math.round(r() * 1250)}px;width:${s}px;height:${s}px;opacity:${0.4 + r() * 0.6}"></div>`;
    }).join("");
    const peaks = (seed: number, h: number, col: string, top: number) => {
      const rr = rng(seed);
      const pts = ["0 100%"];
      for (let k = 0; k <= 12; k++) pts.push(`${(k * 100) / 12}% ${100 - (k % 2 ? 30 + rr() * 50 : 8 + rr() * 22)}%`);
      pts.push("100% 100%");
      return `<div class="mtn" style="position:absolute;left:0;top:${top}px;width:2400px;height:${h}px;background:${col};clip-path:polygon(${pts.join(",")})"></div>`;
    };
    const steps = stepEase(8, c.dur);
    const js = [
      ...Array.from({ length: 22 }, (_, k) => sway(`#bg .st${k}`, { autoAlpha: 0.15 }, { autoAlpha: 1 }, 0.5 + (k % 5) * 0.25, c.dur, "steps(1)", (k % 4) * 0.1)),
      fromTo("#bg .m0", { x: 0 }, { x: -700, duration: c.dur, ease: steps }, 0),
      fromTo("#bg .m1", { x: 0 }, { x: -1300, duration: c.dur, ease: steps }, 0),
    ].join("\n");
    const clouds = drift(c.seed + 9, c.dur, { n: 4, dx: [-700, -400], dy: [0, 0], ease: steps, area: [1300, 600], make: (k, r2) => ({ x: Math.round(r2() * 1300), y: 160 + Math.round(r2() * 620), style: "width:200px;height:40px;background:#566c86;box-shadow:40px -30px 0 #566c86,100px -30px 0 #566c86,140px 0 0 #566c86;" }) });
    return {
      html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:linear-gradient(180deg,#1a1c2c 0%,#29366f 55%,#3b5dc9 100%)"></div>${stars}${clouds.html}<div class="m0">${peaks(c.seed, 520, "#3b5dc9", 1060)}</div><div class="m1">${peaks(c.seed + 4, 420, "#0e0f1a", 1220)}</div>`,
      js: js + "\n" + clouds.js,
    };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const which = (["coin", "heart", "star", "gem", "bolt"] as const)[b.i % 5];
    const bits = SPRITES[which] as unknown as string[];
    const sp = burst(b, {
      n: 7, dist: [180, 460], dur: 0.7, salt: 61, ease: stepEase(12, 0.5), spin: 0,
      make: (k) => ({ inner: sprite(k % 2 ? (SPRITES[which] as unknown as string[]) : bits, COL, 12) }),
    });
    const sq = burst(b, { n: 10, dist: [120, 380], dur: 0.45, salt: 62, ease: stepEase(12, 0.4), spin: 0, make: (k) => ({ style: `width:${12 + (k % 3) * 8}px;height:${12 + (k % 3) * 8}px;background:${k % 2 ? c.p.accent : c.p.accent2};` }) });
    const score = `<div class="plus" style="position:absolute;left:${b.i % 2 ? 90 : 620}px;top:${b.mode === "pip" ? 520 : 70}px;font:400 34px 'Press Start 2P',monospace;color:#ffcd75;text-shadow:4px 4px 0 #0e0f1a;opacity:0">+${(b.i + 1) * 100}</div>`;
    const at = n2(Math.max(0.1, b.kwAt));
    const js = [
      sp.js, sq.js,
      fromTo(`${s} .plus`, { y: 40, autoAlpha: 1 }, { y: -60, autoAlpha: 1, duration: 0.7, ease: stepEase(12, 0.7) }, at),
      fromTo(`${s} .plus`, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.08, ease: "steps(1)" }, n2(at + 0.7)),
    ].join("\n");
    return { html: `${sp.html}${sq.html}${score}`, js };
  },
  charW: 1.02,
  reveal: "steps",
  trans: ["slice", "steps", "flash"],
  caption: "bar",
  speaker: { radius: 0, border: { w: 8, c: "#f4f4f4" }, shadow: "10px 10px 0 #0e0f1a", pip: 0 },
  scrim: "rgba(14,15,26,0.80)",
};
