import type { Skin } from "../types";
import { burst, center, drift, sway } from "../decor";
import { fromToLate, n2, rng } from "../kit";

// Low-poly: faceted flat-shaded shapes, pastel palette with one saturated accent, objects that pop in with overshoot.
const cube = (x: number, y: number, size: number, top: string, left: string, right: string, cls = "") => {
  const h = Math.round(size * 1.14);
  return `<div class="cube ${cls}" style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${h}px"><i style="position:absolute;left:0;top:0;width:${size}px;height:${size * 0.57}px;background:${top};clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"></i><i style="position:absolute;left:0;top:${size * 0.285}px;width:${size / 2}px;height:${size * 0.86}px;background:${left};clip-path:polygon(0 0,100% 40%,100% 100%,0 60%)"></i><i style="position:absolute;left:${size / 2}px;top:${size * 0.285}px;width:${size / 2}px;height:${size * 0.86}px;background:${right};clip-path:polygon(0 40%,100% 0,100% 60%,0 100%)"></i></div>`;
};

export const lowpoly: Skin = {
  id: "lowpoly",
  label: "Low-poly",
  blurb: "Faceted pastel shapes that pop in",
  pal: () => ({ bg: "#cfe0ff", bg2: "#e6efff", ink: "#1c2444", sub: "#4b5880", accent: "#ff6b8b", accent2: "#6c5ce7", card: "#ffffff", edge: "#b8c7ea", onAccent: "#ffffff" }),
  fonts: [],
  head: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  body: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 800; --ls: -1.5px; --tt: none; --rad: 22px; --rad-s: 8px; --bw: 0px; }
    .row, .fact, .col, .term, .pill, .badge { box-shadow: 0 14px 0 rgba(108,92,231,0.22); }
    .m-full { --ink: #ffffff; --sub: #e4eaff; --card: rgba(255,255,255,0.2); --edge: rgba(255,255,255,0.35); }
    .m-full .row, .m-full .fact, .m-full .col, .m-full .term { box-shadow: none; }
    .cap-bar { background: rgba(28,36,68,0.88); border-radius: 22px; }
  `,
  bg(c) {
    const r = rng(c.seed);
    const shades = ["#b9d0ff", "#a6c0f7", "#d4e1ff", "#c3b8ff", "#ffd1dc", "#e1d9ff"];
    const tris = drift(c.seed, c.dur, {
      n: 18, dx: [-140, 140], dy: [-180, 180], rot: 70, ease: "sine.inOut",
      make: (k) => {
        const w = 280 + Math.round(r() * 380);
        return { style: `width:${w}px;height:${Math.round(w * 0.9)}px;background:${shades[k % shades.length]};clip-path:polygon(${Math.round(r() * 30)}% 100%,${40 + Math.round(r() * 20)}% 0,100% ${60 + Math.round(r() * 40)}%);opacity:.85;` };
      },
    });
    return { html: `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:linear-gradient(160deg,#dbe8ff 0%,#cfe0ff 50%,#e3dbff 100%)"></div>${tris.html}`, js: tris.js };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const ctr = center(b.mode);
    const left = b.i % 2 === 0;
    const top = 330;
    const cubes = [
      cube(left ? 30 : 880, top, 140, "#ff9fb5", "#ff6b8b", "#e9496d", "cb0"),
      cube(left ? 170 : 780, top + 110, 90, "#a99cff", "#6c5ce7", "#5645c9", "cb1"),
    ].join("");
    const bits = burst(b, {
      n: 8, dist: [200, 480], dur: 0.7, salt: 91, ease: "back.out(1.5)", spin: 300,
      make: (k, r) => ({ style: `width:${60 + Math.round(r() * 60)}px;height:${54 + Math.round(r() * 50)}px;background:${["#ff6b8b", "#6c5ce7", "#ffd166", "#7bdff2"][k % 4]};clip-path:polygon(50% 0,100% 100%,0 100%);` }),
    });
    const at = n2(Math.max(0, b.start));
    const js = [
      bits.js,
      fromToLate(`${s} .cb0`, { scale: 0, y: 140, transformOrigin: "50% 100%" }, { scale: 1, y: 0, duration: 0.55, ease: "back.out(2.4)" }, at),
      fromToLate(`${s} .cb1`, { scale: 0, y: 140, transformOrigin: "50% 100%" }, { scale: 1, y: 0, duration: 0.55, ease: "back.out(2.4)" }, n2(at + 0.12)),
      sway(`${s} .cb0`, { rotation: -3 }, { rotation: 3 }, 0.9, b.dur, "sine.inOut", n2(at + 0.6)),
      sway(`${s} .cb1`, { rotation: 4 }, { rotation: -4 }, 0.7, b.dur, "sine.inOut", n2(at + 0.7)),
    ].join("\n");
    void ctr;
    void c;
    return { html: cubes + bits.html, js };
  },
  charW: 0.58,
  reveal: "pop",
  trans: ["zoom", "push", "iris"],
  caption: "bar",
  speaker: { radius: 24, border: { w: 8, c: "#ffffff" }, shadow: "0 20px 0 rgba(108,92,231,0.25)", pip: 195 },
  scrim: "rgba(28,36,68,0.72)",
};
