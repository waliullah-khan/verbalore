import type { Skin } from "../types";
import { burst, center, drift, sway } from "../decor";
import { fromTo, fromToLate, n2 } from "../kit";

// Generative: everything procedural. Neon particles, rotating rings, scanning beams, on near-black.
// The motion is built from seeded tweens (one per particle), not from an audio analysis.
export const generative: Skin = {
  id: "generative",
  label: "Generative neon",
  blurb: "Particles and glowing geometry on dark",
  pal: () => ({ bg: "#05060f", bg2: "#0b0d24", ink: "#f4f6ff", sub: "#9aa3d6", accent: "#00f5d4", accent2: "#ff3ea5", card: "#0d1030", edge: "#2f3580", onAccent: "#03121a" }),
  fonts: ["archivo"],
  head: "'Archivo Black', sans-serif",
  body: "Arial, Helvetica, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 400; --ls: -1px; --tt: uppercase; --rad: 22px; --rad-s: 4px; --bw: 3px; --cap: 'Archivo Black', sans-serif; }
    .head .kw, .stat, .badge b, .fact b { text-shadow: 0 0 30px rgba(0,245,212,0.55); }
    .row, .fact, .col, .term { background: rgba(13,16,48,0.82); border-color: #2f3580; box-shadow: 0 0 26px rgba(0,245,212,0.16); }
    .cap { font-size: 60px; text-transform: uppercase; }
    .ringb { position: absolute; width: 160px; height: 160px; margin: -80px 0 0 -80px; border-radius: 50%; border: 8px solid #ff3ea5; }
  `,
  bg(c) {
    const cols = ["#00f5d4", "#ff3ea5", "#7c5cff", "#ffe14d"];
    const parts = drift(c.seed, c.dur, {
      n: 44, dx: [-30, 30], dy: [-200, 200], ease: "none",
      make: (k, r) => {
        const s = 5 + Math.round(r() * 9);
        return { style: `width:${s}px;height:${s}px;border-radius:50%;background:${cols[k % cols.length]};box-shadow:0 0 ${s * 2}px ${cols[k % cols.length]};opacity:${0.5 + r() * 0.5};` };
      },
    });
    const ring = (r: number, w: number, dash: string, col: string) => `<svg width="${r * 2 + 20}" height="${r * 2 + 20}" viewBox="0 0 ${r * 2 + 20} ${r * 2 + 20}" style="position:absolute;left:${540 - r - 10}px;top:${(c.full ? 960 : 1536) - r - 10}px"><circle cx="${r + 10}" cy="${r + 10}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${dash}" opacity="0.5"/></svg>`;
    const rings = `<div class="rg rg0">${ring(300, 4, "30 22", "#00f5d4")}</div><div class="rg rg1">${ring(470, 3, "8 30", "#ff3ea5")}</div><div class="rg rg2">${ring(660, 3, "60 40", "#7c5cff")}</div>`;
    const beams = [0, 1, 2].map((k) => `<div class="bm bm${k}" style="position:absolute;top:0;left:${100 + k * 380}px;width:6px;height:1920px;background:linear-gradient(180deg,rgba(255,255,255,0),${cols[k]},rgba(255,255,255,0));opacity:.5"></div>`).join("");
    const js = [
      parts.js,
      // a few seeded sways give the particles a pulse on top of their drift
      ...Array.from({ length: 10 }, (_, k) => sway(`#bg .dr${k}`, { scale: 0.6 }, { scale: 1.6 }, 0.9 + (k % 4) * 0.35, c.dur, "sine.inOut", (k % 5) * 0.2)),
      fromTo("#bg .rg0", { rotation: 0, transformOrigin: c.full ? "540px 960px" : "540px 1536px" }, { rotation: 360, duration: c.dur, ease: "none", transformOrigin: c.full ? "540px 960px" : "540px 1536px" }, 0),
      fromTo("#bg .rg1", { rotation: 0 }, { rotation: -360, duration: c.dur, ease: "none", transformOrigin: c.full ? "540px 960px" : "540px 1536px" }, 0),
      fromTo("#bg .rg2", { rotation: 0 }, { rotation: 180, duration: c.dur, ease: "none", transformOrigin: c.full ? "540px 960px" : "540px 1536px" }, 0),
      fromTo("#bg .bm0", { x: 0 }, { x: 700, duration: c.dur, ease: "none" }, 0),
      fromTo("#bg .bm1", { x: 0 }, { x: -600, duration: c.dur, ease: "none" }, 0),
      fromTo("#bg .bm2", { x: 0 }, { x: 400, duration: c.dur, ease: "none" }, 0),
    ].join("\n");
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:radial-gradient(ellipse at 50% 45%,#141a4d 0%,#05060f 70%)"></div>${rings}${beams}${parts.html}`, js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const ctr = center(b.mode);
    const at = n2(Math.max(0.05, b.kwAt - 0.05));
    const sparks = burst(b, { n: 14, dist: [200, 520], dur: 0.6, ease: "power4.out", salt: 31, spin: 80, make: (k, r) => ({ style: `width:${50 + Math.round(r() * 120)}px;height:5px;background:${k % 2 ? c.p.accent : c.p.accent2};box-shadow:0 0 14px ${k % 2 ? c.p.accent : c.p.accent2};transform-origin:0 50%;` }) });
    const html = `<div class="ringb" style="left:${ctr.x}px;top:${ctr.y}px;opacity:0"></div><div class="ringb r2" style="left:${ctr.x}px;top:${ctr.y}px;opacity:0;border-color:${c.p.accent}"></div>${sparks.html}`;
    const js = [
      sparks.js,
      fromToLate(`${s} .ringb`, { scale: 0.2, autoAlpha: 0.95 }, { scale: 5.5, autoAlpha: 0, duration: 0.8, ease: "power3.out" }, at),
      fromToLate(`${s} .r2`, { scale: 0.2, autoAlpha: 0.95 }, { scale: 4, autoAlpha: 0, duration: 0.7, ease: "power3.out" }, n2(at + 0.12)),
    ].join("\n");
    return { html, js };
  },
  charW: 0.78,
  reveal: "flicker",
  trans: ["glitch", "iris", "flash"],
  caption: "pop",
  speaker: { radius: 40, border: { w: 5, c: "#00f5d4" }, shadow: "0 0 56px rgba(0,245,212,0.45)", pip: 195 },
  scrim: "rgba(3,4,14,0.78)",
};
