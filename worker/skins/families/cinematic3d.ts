import type { Skin } from "../types";
import { burst, center, sway } from "../decor";
import { fromTo, fromToLate, n2, reps, rng, set } from "../kit";

// Cinematic 3D: CSS 3D transforms, depth, one strong key light, slow moves, letterbox bars and grain.
// This is an approximation of a WebGL scene: a perspective floor, spinning rings, light sweeps and parallax.
export const cinematic3d: Skin = {
  id: "cinematic3d",
  label: "Cinematic 3D",
  blurb: "Depth, light sweeps and slow camera moves",
  pal: () => ({ bg: "#07080c", bg2: "#10121a", ink: "#f3f1ec", sub: "#a7a9b3", accent: "#ffb347", accent2: "#5ec8ff", card: "#12141c", edge: "#2a2d3a", onAccent: "#14100a" }),
  fonts: ["archivo"],
  head: "'Archivo Black', sans-serif",
  body: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 400; --ls: 3px; --tt: uppercase; --rad: 10px; --rad-s: 2px; --bw: 1px; --cap: 'Helvetica Neue', Arial, sans-serif; }
    .gfx { perspective: 1400px; }
    .head, .stat, .kwword { text-shadow: 0 10px 40px rgba(0,0,0,0.6); }
    .row, .fact, .col, .term { background: rgba(18,20,28,0.88); border-color: #2a2d3a; box-shadow: 0 24px 50px rgba(0,0,0,0.55); }
    .cap { font-weight: 700; letter-spacing: 2px; font-size: 62px; }
    .letter { position: absolute; left: 0; width: 1080px; height: 120px; background: #000; z-index: 1; }
    .sweep { position: absolute; top: -200px; width: 260px; height: 2400px; background: linear-gradient(90deg, rgba(255,179,71,0), rgba(255,200,120,0.28), rgba(255,179,71,0)); }
    .ring3 { position: absolute; border: 6px solid #ffb347; border-radius: 50%; }
  `,
  bg(c) {
    const r = rng(c.seed);
    const floor = `<div style="position:absolute;left:0;top:980px;width:1080px;height:940px;perspective:760px;overflow:hidden"><div class="floor" style="position:absolute;left:-720px;top:0;width:2520px;height:2200px;background-image:linear-gradient(rgba(94,200,255,0.34) 3px,transparent 3px),linear-gradient(90deg,rgba(94,200,255,0.34) 3px,transparent 3px);background-size:110px 110px"></div></div><div style="position:absolute;left:0;top:930px;width:1080px;height:140px;background:linear-gradient(180deg,rgba(255,179,71,0),rgba(255,179,71,0.18),rgba(255,179,71,0))"></div>`;
    const rings = (c.full ? [520, 760, 1010] : [300, 440, 600]).map((d, k) => `<div class="rg3 rg${k}" style="position:absolute;left:${540 - d / 2}px;top:${(c.full ? 760 : 1536) - d / 2}px;width:${d}px;height:${d}px;border-radius:50%;border:${5 - k}px solid ${k === 1 ? "#5ec8ff" : "#ffb347"};opacity:${0.5 - k * 0.1}"></div>`).join("");
    const flares = [0, 1].map((k) => `<div class="fl fl${k}" style="position:absolute;left:${k ? 680 : -200}px;top:${k ? 1180 : 120}px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,${k ? "rgba(94,200,255,0.20)" : "rgba(255,179,71,0.22)"} 0%,rgba(0,0,0,0) 62%)"></div>`).join("");
    const js = [
      set("#bg .floor", { rotationX: 72, transformOrigin: "50% 0%" }, 0),
      fromTo("#bg .floor", { backgroundPositionY: 0 }, { backgroundPositionY: 110 * Math.round(c.dur * 0.9), duration: c.dur, ease: "none" }, 0),
      fromTo("#bg .rg0", { rotationX: 62, rotationY: 0, transformPerspective: 900 }, { rotationX: 62, rotationY: 360, duration: c.dur, ease: "none" }, 0),
      fromTo("#bg .rg1", { rotationX: 0, rotationY: 70, rotationZ: 0, transformPerspective: 900 }, { rotationX: 360, rotationY: 70, duration: c.dur * 1.3, ease: "none" }, 0),
      fromTo("#bg .rg2", { rotationX: 78, rotationZ: 0, transformPerspective: 900 }, { rotationX: 78, rotationZ: -360, duration: c.dur * 1.6, ease: "none" }, 0),
      sway("#bg .fl0", { x: 0, y: 0 }, { x: 420, y: 260 }, 5, c.dur, "sine.inOut", 0),
      sway("#bg .fl1", { x: 0, y: 0 }, { x: -380, y: -300 }, 6, c.dur, "sine.inOut", 0),
    ].join("\n");
    void r;
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:radial-gradient(ellipse at 50% 38%,#1b1e2c 0%,#07080c 72%)"></div>${floor}${rings}${flares}`, js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const ctr = center(b.mode);
    const at = n2(Math.max(0, b.start - 0.05));
    const kwAt = n2(Math.max(0.1, b.kwAt));
    const motes = burst(b, { n: 9, dist: [200, 520], dur: 0.9, salt: 101, ease: "power2.out", spin: 0, make: (k, r) => ({ style: `width:${8 + Math.round(r() * 12)}px;height:${8 + Math.round(r() * 12)}px;border-radius:50%;background:${k % 2 ? c.p.accent : c.p.accent2};box-shadow:0 0 18px ${k % 2 ? c.p.accent : c.p.accent2};` }) });
    const html = `<div class="sweep" style="left:0;opacity:0"></div><div class="ring3" style="left:${ctr.x - 150}px;top:${ctr.y - 150}px;width:300px;height:300px;opacity:0"></div>${motes.html}`;
    const js = [
      motes.js,
      fromToLate(`${s} .sweep`, { x: -500, autoAlpha: 1, skewX: -16 }, { x: 1500, autoAlpha: 1, skewX: -16, duration: 0.9, ease: "power2.inOut" }, at),
      fromToLate(`${s} .ring3`, { scale: 0.2, rotationY: 0, autoAlpha: 0.9, transformPerspective: 800 }, { scale: 3.6, rotationY: 200, autoAlpha: 0, duration: 0.9, ease: "power3.out" }, kwAt),
    ].join("\n");
    void reps;
    return { html, js };
  },
  charW: 0.8,
  reveal: "tilt3d",
  trans: ["zoom", "flash", "dip"],
  caption: "pop",
  speaker: { radius: 10, shadow: "0 34px 80px rgba(0,0,0,0.75)", pip: 195 },
  scrim: "rgba(4,5,9,0.80)",
};
