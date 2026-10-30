import type { Skin } from "../types";
import { burst } from "../decor";
import { esc, fromTo, fromToLate, n2, reps, rng } from "../kit";
import { sway } from "../decor";

// Retro: a CRT terminal. Green phosphor, scanlines, a rolling band, ASCII rain, typed text with a cursor.
export const retro: Skin = {
  id: "retro",
  label: "Retro terminal",
  blurb: "Green phosphor, scanlines and typed text",
  pal: () => ({ bg: "#020a04", bg2: "#04140a", ink: "#b6ffc8", sub: "#5fae77", accent: "#39ff6a", accent2: "#ffd34a", card: "#04140a", edge: "#17482a", onAccent: "#00140a" }),
  fonts: [],
  head: "'Courier New', 'Liberation Mono', monospace",
  body: "'Courier New', 'Liberation Mono', monospace",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 700; --ls: 0px; --tt: uppercase; --rad: 4px; --rad-s: 0px; --bw: 2px; --cap: 'Courier New', monospace; }
    .head, .stat, .kwword, .mid { text-shadow: 0 0 20px rgba(57,255,106,0.55); }
    .row, .fact, .col, .term { background: rgba(4,20,10,0.9); border-color: #17482a; box-shadow: 0 0 22px rgba(57,255,106,0.12); }
    .sub { font-weight: 700; } .row { font-size: 44px; }
    .spk::after { content: ""; position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(40,255,110,0.10); }
    .cap-type { font-size: 60px; font-weight: 700; text-transform: none; }
    .scan { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; background: repeating-linear-gradient(180deg, rgba(0,0,0,0.30) 0px, rgba(0,0,0,0.30) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 6px); }
    .vig { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%); }
    .term-line { position: absolute; left: 70px; font: 700 46px 'Courier New', monospace; color: #ffd34a; text-shadow: 0 0 14px rgba(255,211,74,0.6); white-space: nowrap; }
    .term-line .tl-t { display: inline-block; }
    .blk { display: inline-block; width: 26px; height: 46px; background: #ffd34a; margin-left: 6px; vertical-align: -6px; }
  `,
  bg(c) {
    const r = rng(c.seed);
    const cols = Array.from({ length: 11 }, (_, k) => {
      const text = Array.from({ length: 48 }, () => (r() > 0.5 ? "1" : "0")).join("\n");
      return `<pre class="rain rn${k}" style="position:absolute;left:${20 + k * 96}px;top:-1500px;margin:0;font:700 38px/46px 'Courier New',monospace;color:rgba(57,255,106,${0.16 + r() * 0.2})">${text}</pre>`;
    }).join("");
    const band = `<div class="band" style="position:absolute;left:0;top:-200px;width:1080px;height:200px;background:linear-gradient(180deg,rgba(57,255,106,0),rgba(57,255,106,0.10),rgba(57,255,106,0))"></div>`;
    const js = [
      ...Array.from({ length: 11 }, (_, k) => fromTo(`#bg .rn${k}`, { y: 0 }, { y: 1500 + 1100, duration: c.dur * (0.9 + (k % 4) * 0.12), ease: "none" }, 0)),
      fromTo("#bg .band", { y: 0 }, { y: 2200, duration: 3.2, ease: "none", repeat: reps(c.dur, 3.2) }, 0),
    ].join("\n");
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:radial-gradient(ellipse at 50% 40%,#06200f 0%,#020a04 70%)"></div>${cols}${band}`, js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const at = n2(Math.max(0.1, b.kwAt - 0.25));
    const y = b.mode === "bottom" ? 790 : b.mode === "full" ? 1230 : 1590;
    const msg = `&gt; ${esc(b.keyword.toLowerCase())}`;
    const glitch = burst(b, { n: 6, dist: [200, 480], dur: 0.35, salt: 71, ease: "steps(4)", spin: 0, make: (k, r) => ({ style: `width:${80 + Math.round(r() * 200)}px;height:8px;background:${k % 2 ? c.p.accent : c.p.accent2};` }) });
    const html = `<div class="scan"></div><div class="vig"></div><div class="term-line" style="top:${y}px;opacity:0"><span class="tl-t">${msg}</span><i class="blk"></i></div>${glitch.html}`;
    const js = [
      glitch.js,
      fromToLate(`${s} .term-line`, { autoAlpha: 1 }, { autoAlpha: 1, duration: 0.01 }, at),
      fromToLate(`${s} .tl-t`, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.5, ease: "steps(12)" }, at),
      sway(`${s} .blk`, { autoAlpha: 1 }, { autoAlpha: 0 }, 0.25, Math.max(0.6, b.end - at), "steps(1)", at),
    ].join("\n");
    return { html, js };
  },
  charW: 0.66,
  reveal: "type",
  trans: ["glitch", "flash", "steps"],
  caption: "type",
  speaker: { radius: 10, border: { w: 3, c: "#39ff6a" }, shadow: "0 0 44px rgba(57,255,106,0.35)", pip: 24 },
  scrim: "rgba(0,12,4,0.80)",
};
