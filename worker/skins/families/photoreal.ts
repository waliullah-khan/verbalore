import type { Skin } from "../types";
import { drift, sway } from "../decor";
import { esc, fromTo, fromToLate, n2 } from "../kit";

// Photoreal edit: the footage leads. One warm grade, light leaks, grain, crop marks, restrained serif type,
// slow camera moves and dips between shots. Motion graphics stay minimal on purpose.
const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0'/></filter><rect width='260' height='260' filter='url(%23n)'/></svg>")`;

export const photoreal: Skin = {
  id: "photoreal",
  label: "Film look",
  blurb: "Footage first, grain, warm light, restrained type",
  pal: () => ({ bg: "#0c0b0a", bg2: "#17140f", ink: "#f6f1e9", sub: "#bdb3a3", accent: "#e8c07d", accent2: "#ffffff", card: "#14110d", edge: "#3a3329", onAccent: "#14100a" }),
  fonts: [],
  head: "Georgia, 'Times New Roman', 'Liberation Serif', serif",
  body: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 700; --ls: -1px; --tt: none; --rad: 6px; --rad-s: 1px; --bw: 1px; --cap: 'Helvetica Neue', Arial, sans-serif; }
    .eyebrow { letter-spacing: 11px; font-size: 24px; font-weight: 400; }
    .rule { height: 3px; width: 170px; }
    .row, .fact, .col, .term { background: rgba(20,17,13,0.82); border-color: #3a3329; }
    .cap { font-weight: 400; font-size: 58px; letter-spacing: 0.5px; text-shadow: 0 2px 18px rgba(0,0,0,0.9); }
    .cap-bar { background: rgba(8,7,6,0.5); border-radius: 4px; padding: 12px 24px; }
    .grain { position: absolute; left: -40px; top: -40px; width: 1160px; height: 2000px; background-image: ${NOISE}; opacity: 0.16; }
    .vgn { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; background: radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.58) 100%); }
    .crop { position: absolute; width: 70px; height: 70px; border-color: #f6f1e9; border-style: solid; border-width: 0; opacity: 0.85; }
    .tc { position: absolute; left: 100px; top: 78px; font: 400 26px 'Courier New', monospace; letter-spacing: 4px; color: #f6f1e9; opacity: 0.85; }
  `,
  bg(c) {
    const leaks = drift(c.seed, c.dur, {
      n: 3, dx: [-220, 220], dy: [-200, 200], ease: "sine.inOut",
      make: (k) => ({ x: [-300, 480, 100][k], y: [200, 900, 1500][k], style: `width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,${["rgba(232,160,90,0.30)", "rgba(80,150,170,0.22)", "rgba(200,110,110,0.20)"][k]} 0%,rgba(0,0,0,0) 64%)` }),
    });
    const js = [leaks.js, sway("#bg .grain", { x: 0, y: 0 }, { x: -34, y: 26 }, 1 / 12, c.dur, "steps(1)", 0)].join("\n");
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:#0c0b0a"></div>${leaks.html}<div class="grain"></div>`, js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const at = n2(Math.max(0, b.start));
    const tc = `00:${String(Math.floor(b.start / 60)).padStart(2, "0")}:${String(Math.floor(b.start % 60)).padStart(2, "0")}`;
    const crops = [
      `left:56px;top:56px;border-left-width:3px;border-top-width:3px`,
      `right:56px;top:56px;border-right-width:3px;border-top-width:3px`,
      `left:56px;bottom:56px;border-left-width:3px;border-bottom-width:3px`,
      `right:56px;bottom:56px;border-right-width:3px;border-bottom-width:3px`,
    ];
    const html = `<div class="vgn"></div>${crops.map((st) => `<div class="crop" style="${st}"></div>`).join("")}<div class="tc">${esc(tc)}:${String(b.i * 3 + 11).padStart(2, "0")}</div><div class="grain" style="opacity:.1"></div><div class="streak" style="position:absolute;top:-100px;left:0;width:90px;height:2200px;background:linear-gradient(90deg,rgba(255,235,200,0),rgba(255,235,200,0.14),rgba(255,235,200,0));opacity:0"></div>`;
    const js = [
      fromToLate(`${s} .crop`, { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 0.85, duration: 0.6, ease: "power2.out", stagger: 0.06 }, at),
      fromToLate(`${s} .tc`, { autoAlpha: 0, x: -20 }, { autoAlpha: 0.85, x: 0, duration: 0.5 }, n2(at + 0.1)),
      fromToLate(`${s} .streak`, { x: -200, autoAlpha: 1 }, { x: 1300, autoAlpha: 1, duration: Math.max(1.1, b.dur), ease: "none" }, at),
      sway(`${s} .grain`, { x: 0, y: 0 }, { x: -30, y: 24 }, 1 / 12, b.dur, "steps(1)", at),
    ].join("\n");
    void c;
    void fromTo;
    return { html, js };
  },
  charW: 0.54,
  reveal: "fade",
  trans: ["dip", "zoom", "flash"],
  caption: "bar",
  speaker: { radius: 6, shadow: "0 30px 70px rgba(0,0,0,0.7)", pip: 195 },
  scrim: "rgba(8,6,4,0.78)",
  modes: { hook: "full", quote: "full", tip: "full", cta: "full", keyword: "full", stack: "full", stat: "pip", list: "bottom", compare: "bottom", facts: "pip", code: "pip" },
};
