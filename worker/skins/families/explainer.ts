import type { Skin } from "../types";
import { burst, center } from "../decor";
import { esc, fromTo, n2, rng } from "../kit";

// Explainer: one idea per beat, built step by step. A blueprint grid, a chart that draws across the whole video,
// callouts that point at the thing that matters, bars that grow.
export const explainer: Skin = {
  id: "explainer",
  label: "Explainer",
  blurb: "Axes draw on, numbers count up, labels follow",
  pal: () => ({ bg: "#0c1a2e", bg2: "#12263f", ink: "#eaf1ff", sub: "#9db4d6", accent: "#ffd23f", accent2: "#5ee6ff", card: "#12263f", edge: "#2a4a74", onAccent: "#0c1a2e" }),
  fonts: [],
  head: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  body: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 800; --ls: -1.5px; --tt: none; --rad: 20px; --rad-s: 6px; --bw: 3px; }
    .row, .fact, .col { border-color: var(--edge); }
    .co { position: absolute; display: flex; align-items: center; gap: 14px; padding: 16px 26px; border-radius: 14px; background: #ffd23f; color: #0c1a2e; font: 800 38px var(--body); white-space: nowrap; }
    .co::before { content: ""; width: 16px; height: 16px; border-radius: 50%; background: #0c1a2e; }
    .bars { position: absolute; display: flex; align-items: flex-end; gap: 16px; height: 260px; }
    .bars i { display: block; width: 44px; border-radius: 8px 8px 0 0; background: var(--acc2); opacity: .30; transform-origin: bottom center; }
    .bars i:nth-child(3) { background: var(--acc); opacity: .55; }
    .cap-bar { background: rgba(12,26,46,0.88); border: 2px solid #2a4a74; border-radius: 16px; }
  `,
  bg(c) {
    const r = rng(c.seed);
    // a rising line chart with noise, drawn across the whole video
    const pts: [number, number][] = [];
    const N = 9;
    for (let k = 0; k < N; k++) pts.push([130 + (k * 800) / (N - 1), c.full ? 1250 - (k / (N - 1)) * 640 - r() * 130 : 1850 - (k / (N - 1)) * 560 - r() * 120]);
    const d = pts.map((p, k) => `${k ? "L" : "M"}${Math.round(p[0])} ${Math.round(p[1])}`).join(" ");
    const grid = `<div class="gridbg" style="position:absolute;left:0;top:0;width:1080px;height:2400px;background-image:linear-gradient(rgba(94,230,255,0.07) 2px,transparent 2px),linear-gradient(90deg,rgba(94,230,255,0.07) 2px,transparent 2px);background-size:90px 90px"></div>`;
    const svg = `<svg class="chart" viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;left:0;top:0"><path class="ax" d="M110 ${c.full ? 1300 : 1880} V${c.full ? 500 : 1190}" pathLength="1" stroke="#9db4d6" stroke-width="5" fill="none" stroke-dasharray="1" stroke-dashoffset="1"/><path class="ax" d="M110 ${c.full ? 1300 : 1880} H980" pathLength="1" stroke="#9db4d6" stroke-width="5" fill="none" stroke-dasharray="1" stroke-dashoffset="1"/><path class="ln" d="${d}" pathLength="1" stroke="#ffd23f" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1" opacity="0.55"/>${pts.map((p, k) => `<circle class="nd nd${k}" cx="${Math.round(p[0])}" cy="${Math.round(p[1])}" r="14" fill="#5ee6ff"/>`).join("")}</svg>`;
    const js = [
      fromTo("#bg .gridbg", { y: 0 }, { y: -360, duration: c.dur, ease: "none" }, 0),
      fromTo("#bg .ax", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: "power2.out", stagger: 0.4 }, 0.2),
      fromTo("#bg .ln", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: Math.max(2, c.dur - 1.5), ease: "none" }, 1),
      ...pts.map((_, k) => fromTo(`#bg .nd${k}`, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.4, ease: "back.out(3)" }, n2(1 + ((c.dur - 1.5) * k) / (N - 1)))),
    ].join("\n");
    return { html: grid + svg, js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const ctr = center(b.mode);
    const right = b.i % 2 === 0;
    const bx = right ? 640 : 90;
    const by = 640;
    const hs = [0.5, 0.8, 1, 0.6, 0.9].map((h, k) => Math.round(60 + ((h * 190 + b.i * 37 * (k + 1)) % 190)));
    const bars = `<div class="bars" style="left:${bx}px;top:${by - 260}px">${hs.map((h) => `<i style="height:${h}px"></i>`).join("")}</div>`;
    const cx = right ? 560 : 150;
    const cy = ctr.y - (b.mode === "bottom" ? 250 : 360);
    const callout = `<div class="co" style="left:${cx}px;top:${cy}px">${esc(b.keyword)}</div><svg style="position:absolute;left:${cx + 130}px;top:${cy + 70}px" width="120" height="140" viewBox="0 0 120 140"><path class="cl" d="M60 4 C 60 60, 40 90, 20 130" fill="none" stroke="#ffd23f" stroke-width="7" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path class="cl" d="M6 106 L20 132 L44 114" fill="none" stroke="#ffd23f" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`;
    const ring = burst(b, { n: 8, dist: [120, 300], dur: 0.6, salt: 21, spin: 0, make: (k) => ({ style: `width:18px;height:18px;border-radius:50%;background:${k % 2 ? c.p.accent : c.p.accent2};` }) });
    const at = n2(Math.max(0.1, b.kwAt - 0.1));
    const js = [
      fromTo(`${s} .bars i`, { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: "back.out(1.4)", stagger: 0.07 }, n2(Math.max(0, b.start))),
      ring.js,
    ].join("\n");
    void callout;
    return { html: bars + ring.html, js };
  },
  charW: 0.58,
  reveal: "mask",
  trans: ["wipe", "push", "iris"],
  caption: "bar",
  speaker: { radius: 30, border: { w: 4, c: "#5ee6ff" }, pip: 195 },
  scrim: "rgba(8,18,34,0.82)",
};

void esc;
