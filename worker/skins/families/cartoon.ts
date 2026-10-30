import type { Skin } from "../types";
import { burst, center, drift, sway } from "../decor";
import { esc, fromTo, fromToLate, n2 } from "../kit";

// Flat 2D cartoon: bold rounded shapes, thick dark outlines, bright colour, squash and stretch on every move.
const INK = "#1b1b3a";

export const cartoon: Skin = {
  id: "cartoon",
  label: "Flat cartoon",
  blurb: "Bold outlines, bright colour, squash and stretch",
  pal: () => ({ bg: "#74cfff", bg2: "#b8ecff", ink: INK, sub: "#2a2a5c", accent: "#ff4f79", accent2: "#ffd23f", card: "#ffffff", edge: INK, onAccent: "#ffffff" }),
  fonts: ["bangers"],
  head: "'Bangers', sans-serif",
  body: "Arial, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  capBase: "#ffffff",
  css: () => `
    #root { --hw: 400; --ls: 2px; --tt: uppercase; --rad: 34px; --rad-s: 12px; --bw: 6px; --cap: 'Bangers', sans-serif; }
    .head, .mid, .kwword, .stk, .kc { color: #fff; -webkit-text-stroke: 8px ${INK}; paint-order: stroke fill; text-shadow: 6px 6px 0 ${INK}; word-spacing: 0.22em; }
    .head .kw, .stat { color: #ffd23f; }
    .stat { -webkit-text-stroke: 12px ${INK}; paint-order: stroke fill; text-shadow: 8px 8px 0 ${INK}; }
    .row, .fact, .col, .term { border: 6px solid ${INK}; box-shadow: 0 9px 0 ${INK}; background: #fff; }
    .row, .fact b, .cmp .col p { color: ${INK}; -webkit-text-stroke: 0; text-shadow: none; }
    .sub { color: ${INK}; font-weight: 800; } .m-full .sub { color: #fff; text-shadow: 3px 3px 0 ${INK}; }
    .eyebrow { background: #ffd23f; color: ${INK}; border: 5px solid ${INK}; border-radius: 99px; padding: 4px 26px; align-self: flex-start; box-shadow: 0 5px 0 ${INK}; }
    .cap { font-size: 74px; -webkit-text-stroke: 8px ${INK}; paint-order: stroke fill; text-shadow: 5px 5px 0 ${INK}; word-spacing: 0.18em; }
    .pow { position: absolute; width: 330px; height: 330px; }
    .pow i { position: absolute; left: 0; top: 0; width: 330px; height: 330px; clip-path: polygon(50% 0,60% 18%,80% 6%,78% 28%,100% 28%,86% 46%,100% 62%,78% 66%,84% 88%,62% 80%,50% 100%,40% 80%,18% 90%,22% 68%,0 62%,14% 46%,0 28%,22% 26%,20% 6%,40% 18%); }
    .pow b { position: absolute; left: 0; top: 118px; width: 330px; text-align: center; font: 400 66px/1 'Bangers', sans-serif; color: ${INK}; letter-spacing: 2px; text-transform: uppercase; }
  `,
  bg(c) {
    const clouds = drift(c.seed, c.dur, {
      n: 5, dx: [500, 900], dy: [-10, 10], area: [900, 700],
      make: (k, r) => ({ x: -300 + Math.round(r() * 1100), y: 100 + Math.round(r() * 560), style: `width:${240 + Math.round(r() * 120)}px;height:96px;border-radius:48px;background:#fff;border:6px solid ${INK};`, inner: `<div style="position:absolute;left:36px;top:-52px;width:110px;height:110px;border-radius:50%;background:#fff;border:6px solid ${INK};border-bottom-color:#fff"></div>` }),
    });
    const sun = `<div class="sun" style="position:absolute;left:-120px;top:130px;width:360px;height:360px"><div style="position:absolute;left:60px;top:60px;width:240px;height:240px;border-radius:50%;background:#ffd23f;border:8px solid ${INK}"></div>${Array.from({ length: 12 }, (_, k) => `<i style="position:absolute;left:170px;top:0;width:20px;height:70px;border-radius:10px;background:#ffd23f;border:5px solid ${INK};transform-origin:10px 180px;transform:rotate(${k * 30}deg)"></i>`).join("")}</div>`;
    const hills = [0, 1, 2].map((k) => `<div class="hill h${k}" style="position:absolute;left:${[-300, 380, 80][k]}px;top:${[1620, 1700, 1780][k]}px;width:${[900, 900, 1000][k]}px;height:560px;border-radius:50%;background:${["#43c46b", "#2fae5c", "#67d782"][k]};border:8px solid ${INK}"></div>`).join("");
    const js = [
      clouds.js,
      fromTo("#bg .sun", { rotation: 0, transformOrigin: "50% 50%" }, { rotation: 360, duration: c.dur, ease: "none" }, 0),
      ...[0, 1, 2].map((k) => sway(`#bg .h${k}`, { y: 0 }, { y: -26 - k * 8 }, 1.1 + k * 0.3, c.dur, "sine.inOut", k * 0.2)),
    ].join("\n");
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:linear-gradient(180deg,#74cfff 0%,#c2efff 70%,#e9fbff 100%)"></div>${sun}${clouds.html}${hills}`, js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const ctr = center(b.mode);
    const left = b.i % 2 === 0;
    const px = left ? 40 : 710;
    const py = b.mode === "pip" ? 130 : b.mode === "bottom" ? 380 : 120;
    const at = n2(Math.max(0.1, b.kwAt - 0.12));
    const conf = burst(b, {
      n: 12, dist: [220, 520], dur: 0.8, salt: 51, ease: "back.out(1.3)", spin: 600,
      make: (k, r) => ({ style: `width:${22 + Math.round(r() * 22)}px;height:${22 + Math.round(r() * 22)}px;background:${[c.p.accent, c.p.accent2, "#fff", "#43c46b"][k % 4]};border:5px solid ${INK};border-radius:${k % 3 === 0 ? "50%" : k % 3 === 1 ? "6px" : "2px"};` }),
    });
    const html = `<div class="pow" style="left:${px}px;top:${py}px;opacity:0"><i style="background:${INK};transform:scale(1.06)"></i><i style="background:${c.p.accent2}"></i><b>${esc(b.keyword.slice(0, 9))}!</b></div>${conf.html}`;
    const js = [
      conf.js,
      fromToLate(`${s} .pow`, { scale: 0, rotation: -25, autoAlpha: 1 }, { scale: 1, rotation: -8, autoAlpha: 1, duration: 0.5, ease: "elastic.out(1, 0.45)" }, at),
      fromToLate(`${s} .pow`, { scaleY: 1 }, { scaleY: 1, duration: 0.01 }, at),
      sway(`${s} .pow`, { rotation: -10 }, { rotation: -4 }, 0.35, Math.max(0.8, b.end - at), "sine.inOut", n2(at + 0.5)),
    ].join("\n");
    void ctr;
    return { html, js };
  },
  charW: 0.54,
  reveal: "pop",
  trans: ["iris", "zoom", "wipe"],
  caption: "pop",
  speaker: { radius: 70, border: { w: 10, c: INK }, shadow: `0 14px 0 ${INK}`, pip: 195 },
  scrim: "rgba(20,20,60,0.55)",
};
