import type { Skin } from "../types";
import { burst, drift, sway } from "../decor";
import { fromToLate, n2, rng, stepEase } from "../kit";

// Paper collage: flat cut-out pieces with torn edges, a visible paper grain, moving in stop-motion on twos (12 fps).
const jag = (r: () => number, n: number) => {
  const pts: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rad = 38 + r() * 12;
    pts.push(`${Math.round(50 + Math.cos(a) * rad)}% ${Math.round(50 + Math.sin(a) * rad)}%`);
  }
  return `polygon(${pts.join(",")})`;
};

export const collage: Skin = {
  id: "collage",
  label: "Paper collage",
  blurb: "Cut-out paper moving in stop-motion",
  pal: (b) => ({ bg: "#e9dcc2", bg2: "#d8c6a1", ink: "#2a1f14", sub: "#5a4630", accent: b.accent && b.accent !== "#c2410c" ? b.accent : "#d6452c", accent2: "#2f6f8f", card: "#fff8e7", edge: "#2a1f14", onAccent: "#fff8e7" }),
  fonts: ["archivo"],
  head: "'Archivo Black', sans-serif",
  body: "Georgia, 'Times New Roman', 'Liberation Serif', serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  stepFps: 12,
  capBase: "#2a1f14",
  css: () => `
    #root { --hw: 400; --ls: -1px; --tt: uppercase; --rad: 4px; --rad-s: 2px; --bw: 4px; --cap: Georgia, serif; }
    .row, .fact, .col, .term { background: #fff8e7; border: 3px solid #2a1f14; box-shadow: 7px 9px 0 rgba(42,31,20,0.35); }
    .head .w:nth-child(3n+1) .wi { background: #fff8e7; color: #2a1f14; padding: 0 0.12em; rotate: -1.5deg; box-shadow: 4px 5px 0 rgba(42,31,20,0.3); }
    .head .w:nth-child(3n+2) .wi { background: #2a1f14; color: #fff8e7; padding: 0 0.12em; rotate: 1.2deg; }
    .head .w:nth-child(3n) .wi { background: #d6452c; color: #fff8e7; padding: 0 0.12em; rotate: -0.8deg; }
    .head .wi.kw { background: #2f6f8f !important; color: #fff8e7 !important; }
    .m-full { --ink: #fff8e7; --sub: #f1e4c7; }
    .m-full .row, .m-full .fact, .m-full .col { --ink: #2a1f14; --sub: #5a4630; }
    .cap { color: #2a1f14; text-shadow: none; background: #fff8e7; border: 3px solid #2a1f14; border-radius: 3px; padding: 10px 26px; font-weight: 700; font-size: 62px; box-shadow: 6px 7px 0 rgba(42,31,20,0.35); left: 110px; width: 860px; }
    .tape { position: absolute; width: 190px; height: 56px; background: rgba(246,230,170,0.78); border: 1px solid rgba(120,100,50,0.25); }
  `,
  bg(c) {
    const r = rng(c.seed);
    const cols = ["#d6452c", "#2f6f8f", "#e9b44c", "#8a9a5b", "#2a1f14", "#c98a6b"];
    const pieces = drift(c.seed, c.dur, {
      n: 11, dx: [-120, 120], dy: [-160, 160], rot: 50, ease: stepEase(6, c.dur),
      make: (k) => {
        const size = 260 + Math.round(r() * 300);
        return { style: `width:${size}px;height:${size}px;background:${cols[k % cols.length]};clip-path:${jag(r, 11)};opacity:.9;` };
      },
    });
    const grain = `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;opacity:.5;background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 .35  0 0 0 0 .27  0 0 0 0 .17  0 0 0 .3 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>&quot;)"></div>`;
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:#e9dcc2"></div>${pieces.html}${grain}`, js: pieces.js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const r = rng(b.seed);
    const sc = burst(b, {
      n: 8, dist: [180, 460], dur: 0.7, salt: 81, ease: stepEase(12, 0.6), spin: 200,
      make: (k, rr) => ({ style: `width:${80 + Math.round(rr() * 110)}px;height:${80 + Math.round(rr() * 110)}px;background:${["#d6452c", "#2f6f8f", "#e9b44c", "#fff8e7"][k % 4]};clip-path:${jag(rr, 9)};border:0;` }),
    });
    const tapes = [0, 1].map((k) => `<div class="tape" style="left:${k ? 760 : 60}px;top:6px;rotate:${k ? 18 : -14}deg"></div>`).join("");
    void r;
    const js = [
      sc.js,
      fromToLate(`${s} .tape`, { autoAlpha: 0, scale: 1.4 }, { autoAlpha: 1, scale: 1, duration: 0.24, ease: "steps(3)", stagger: 0.1 }, n2(Math.max(0, b.start))),
      // the whole graphic shivers on twos, like a frame being nudged between shots
      sway(`${s} .gfx`, { rotation: -0.5 }, { rotation: 0.5 }, 1 / 6, b.dur, "steps(1)", n2(b.start)),
    ].join("\n");
    return { html: tapes + sc.html, js };
  },
  charW: 0.78,
  reveal: "steps",
  trans: ["push", "wipe", "steps"],
  caption: "bar",
  speaker: { radius: 4, border: { w: 14, c: "#fff8e7" }, shadow: "10px 14px 0 rgba(42,31,20,0.4)", pip: 6 },
  scrim: "rgba(30,20,10,0.72)",
};
