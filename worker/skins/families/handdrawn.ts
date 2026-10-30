import type { Skin } from "../types";
import { burst, center, drift, sway } from "../decor";
import { fromTo, fromToLate, n2, rng } from "../kit";

// Hand-drawn: marker lines and doodles on paper. Strokes draw themselves on and the doodles "boil"
// (jitter on twos), which is an approximation of redrawing every few frames.
const squiggle = (r: () => number, kind: number): string => {
  const j = (v: number) => Math.round(v + (r() - 0.5) * 8);
  switch (kind % 6) {
    case 0: return `M${j(20)} ${j(70)} C ${j(40)} ${j(10)}, ${j(110)} ${j(10)}, ${j(130)} ${j(60)} S ${j(60)} ${j(120)}, ${j(30)} ${j(80)}`;
    case 1: return `M${j(10)} ${j(60)} L ${j(40)} ${j(20)} L ${j(70)} ${j(60)} L ${j(100)} ${j(20)} L ${j(130)} ${j(60)}`;
    case 2: return `M${j(70)} ${j(10)} L ${j(86)} ${j(50)} L ${j(130)} ${j(54)} L ${j(96)} ${j(80)} L ${j(108)} ${j(122)} L ${j(70)} ${j(98)} L ${j(32)} ${j(122)} L ${j(44)} ${j(80)} L ${j(10)} ${j(54)} L ${j(54)} ${j(50)} Z`;
    case 3: return `M${j(20)} ${j(100)} C ${j(10)} ${j(30)}, ${j(110)} ${j(10)}, ${j(120)} ${j(70)} C ${j(125)} ${j(110)}, ${j(60)} ${j(120)}, ${j(50)} ${j(70)} C ${j(45)} ${j(45)}, ${j(80)} ${j(40)}, ${j(85)} ${j(65)}`;
    case 4: return `M${j(10)} ${j(100)} L ${j(120)} ${j(30)} M ${j(90)} ${j(20)} L ${j(124)} ${j(30)} L ${j(104)} ${j(60)}`;
    default: return `M${j(30)} ${j(60)} a 36 36 0 1 0 72 2 a 30 30 0 1 0 -60 -2`;
  }
};

export const handdrawn: Skin = {
  id: "handdrawn",
  label: "Hand-drawn",
  blurb: "Marker lines and doodles on paper",
  pal: () => ({ bg: "#f7f2e6", bg2: "#efe7d2", ink: "#1d1a16", sub: "#4b463d", accent: "#e4472b", accent2: "#2563eb", card: "#fffdf5", edge: "#1d1a16", onAccent: "#ffffff" }),
  fonts: ["hand"],
  head: "'Patrick Hand', cursive",
  body: "'Patrick Hand', cursive",
  mono: "'Courier New', 'Liberation Mono', monospace",
  fontScale: 1.12,
  capBase: "#1d1a16",
  css: () => `
    #root { --hw: 400; --ls: 0.5px; --tt: none; --rad: 22px; --rad-s: 6px; --bw: 4px; --cap: 'Patrick Hand', cursive; }
    .row, .fact, .col, .term { background: #fffdf5; border: 4px solid #1d1a16; box-shadow: 6px 6px 0 #1d1a16; }
    .term { background: #fffdf5; } .tbody .tx { color: #e4472b; } .tbar { color: #4b463d; }
    .m-full { --ink: #ffffff; --sub: #f3ecd9; }
    .m-full .row, .m-full .fact, .m-full .col { --ink: #1d1a16; --sub: #4b463d; }
    .sub { font-size: 50px; } .eyebrow { font-size: 36px; letter-spacing: 4px; }
    .row { font-size: 54px; } .pill { font-size: 56px; border-width: 4px; box-shadow: 5px 5px 0 #1d1a16; }
    .cap { color: #1d1a16; background: #fffdf5; border: 4px solid #1d1a16; border-radius: 20px; padding: 8px 26px; text-shadow: none; box-shadow: 5px 5px 0 #1d1a16; font-size: 66px; left: 110px; width: 860px; }
    .doo { position: absolute; width: 140px; height: 130px; }
  `,
  bg(c) {
    const r = rng(c.seed);
    const grain = `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;opacity:.55;background-image:url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/><feColorMatrix values='0 0 0 0 .45  0 0 0 0 .38  0 0 0 0 .28  0 0 0 .22 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>&quot;)"></div>`;
    const N = 16;
    const doodles: string[] = [];
    const js: string[] = [];
    for (let k = 0; k < N; k++) {
      const x = Math.round(r() * 940);
      const y = Math.round(r() * 1780);
      const col = k % 3 === 0 ? "#e4472b" : k % 3 === 1 ? "#2563eb" : "#1d1a16";
      doodles.push(`<svg class="doo d${k}" viewBox="0 0 140 130" style="left:${x}px;top:${y}px;opacity:.85"><path d="${squiggle(r, k)}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`);
      js.push(fromTo(`#bg .d${k} path`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: "power1.out" }, n2(0.3 + (k * (c.dur - 1)) / N)));
      js.push(sway(`#bg .d${k}`, { rotation: -2.5, x: -2 }, { rotation: 2.5, x: 2 }, 0.17, c.dur, "steps(1)", 0));
    }
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:#f7f2e6"></div>${grain}${doodles.join("")}`, js: js.join("\n") };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const ctr = center(b.mode);
    const at = n2(Math.max(0.15, b.kwAt - 0.1));
    const stars = burst(b, {
      n: 6, dist: [200, 440], dur: 0.6, salt: 41, ease: "power2.out", spin: 140,
      make: (k) => ({ inner: `<svg width="90" height="90" viewBox="0 0 140 130"><path d="M70 10 L86 50 L130 54 L96 80 L108 122 L70 98 L32 122 L44 80 L10 54 L54 50 Z" fill="${k % 2 ? c.p.accent : "none"}" stroke="${c.p.ink === "#1d1a16" ? "#1d1a16" : "#fff"}" stroke-width="7" stroke-linejoin="round"/></svg>` }),
    });
    const ovalW = 780;
    const oval = `<svg class="oval" viewBox="0 0 320 120" width="${ovalW}" height="${Math.round(ovalW * 0.375)}" style="position:absolute;left:${ctr.x - ovalW / 2}px;top:${ctr.y - 150}px"><path d="M70 62 C 60 14, 250 6, 296 40 C 330 80, 200 112, 80 96 C 22 86, 14 50, 66 26" fill="none" stroke="#e4472b" stroke-width="7" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`;
    const under = `<svg class="und" viewBox="0 0 600 30" width="700" height="35" style="position:absolute;left:${ctr.x - 350}px;top:${b.mode === "bottom" ? 760 : ctr.y + 470}px"><path d="M6 18 C 120 6, 230 28, 360 14 S 540 8, 594 16" fill="none" stroke="#2563eb" stroke-width="9" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`;
    const js = [
      stars.js,
      fromToLate(`${s} .oval path`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, at),
      fromToLate(`${s} .und path`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }, n2(b.start + 0.2)),
      sway(`${s} .oval`, { rotation: -1.2, x: -2 }, { rotation: 1.2, x: 2 }, 0.17, b.dur, "steps(1)", n2(at + 0.6)),
    ].join("\n");
    return { html: `${oval}${under}${stars.html}`, js };
  },
  charW: 0.46,
  reveal: "draw",
  trans: ["wipe", "iris", "push"],
  caption: "pop",
  speaker: { radius: 22, border: { w: 8, c: "#1d1a16" }, shadow: "9px 9px 0 #1d1a16", pip: 195 },
  scrim: "rgba(24,18,10,0.72)",
};

void drift;
