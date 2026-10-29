import type { Skin } from "../types";
import { burst, center, drift } from "../decor";
import { esc, fromTo, fromToLate, n2 } from "../kit";

// Product launch film: crisp light UI, a cursor that moves and clicks, toasts, soft shadows, spring easing.
export const productui: Skin = {
  id: "productui",
  label: "Product UI",
  blurb: "App windows, a clicking cursor and spring motion",
  pal: () => ({ bg: "#f2f5fa", bg2: "#e4eaf5", ink: "#0f172a", sub: "#556077", accent: "#2f5bea", accent2: "#ff7a1a", card: "#ffffff", edge: "#e1e7f1", onAccent: "#ffffff" }),
  fonts: [],
  head: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  body: "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 800; --ls: -2px; --tt: none; --rad: 28px; --rad-s: 8px; --bw: 0px; }
    .row, .fact, .col, .term, .pill, .badge { box-shadow: 0 16px 36px rgba(15,23,42,0.14); }
    .row { border: 1px solid var(--edge); }
    .m-full { --ink: #ffffff; --sub: #dbe4f7; --card: rgba(255,255,255,0.18); --edge: rgba(255,255,255,0.3); }
    .m-full .row, .m-full .fact, .m-full .col, .m-full .term { box-shadow: none; }
    .mini { position: absolute; width: 300px; height: 190px; border-radius: 22px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,0.10); border: 1px solid #e3e9f3; }
    .mini i { position: absolute; left: 22px; height: 12px; border-radius: 6px; background: #dfe6f2; display: block; }
    .mini b { position: absolute; right: 22px; top: 22px; width: 38px; height: 38px; border-radius: 50%; background: var(--acc); opacity: .85; }
    .toast { position: absolute; left: 50px; top: 56px; width: 560px; display: flex; align-items: center; gap: 20px; padding: 22px 28px; border-radius: 26px; background: #fff; color: #0f172a; box-shadow: 0 22px 50px rgba(15,23,42,0.25); font: 700 40px var(--body); }
    .toast b { flex: none; width: 56px; height: 56px; border-radius: 50%; background: #16a34a; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 34px; }
    .toast span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .curs { position: absolute; left: 0; top: 0; width: 70px; height: 70px; }
    .rip { position: absolute; width: 90px; height: 90px; border-radius: 50%; border: 6px solid var(--acc); }
    .cap-bar { background: rgba(15,23,42,0.86); border-radius: 22px; }
  `,
  bg(c) {
    const blobs = drift(c.seed, c.dur, {
      n: 3, dx: [-160, 160], dy: [-200, 200], ease: "sine.inOut",
      make: (k) => ({ x: [-260, 560, 80][k], y: [120, 900, 1500][k], style: `width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,${["rgba(47,91,234,0.20)", "rgba(255,122,26,0.16)", "rgba(47,91,234,0.14)"][k]} 0%,rgba(255,255,255,0) 68%);` }),
    });
    const cards = drift(c.seed + 5, c.dur, {
      n: 7, dx: [-60, 60], dy: [-720, -420], area: [900, 1500],
      make: (k, r) => ({ x: Math.round(r() * 800), y: 400 + Math.round(r() * 1400), inner: `<i style="top:30px;width:${120 + Math.round(r() * 90)}px"></i><i style="top:62px;width:${80 + Math.round(r() * 120)}px"></i><i style="top:110px;width:${160 + Math.round(r() * 80)}px"></i><b></b>`, cls: "mini" }),
    });
    const dots = `<div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background-image:radial-gradient(rgba(15,23,42,0.10) 2px,transparent 2px);background-size:54px 54px"></div>`;
    return { html: dots + blobs.html + cards.html, js: [blobs.js, cards.js].join("\n") };
  },
  decor(b, c) {
    const s = `#s${b.i}`;
    const ctr = center(b.mode);
    const at = n2(Math.max(0.1, b.kwAt));
    const tx = 420 + ((b.i * 137) % 260);
    const ty = ctr.y + 70;
    const from = b.i % 2 ? { x: 980, y: ty + 380 } : { x: 80, y: ty - 120 };
    const plus = burst(b, {
      n: 7, dist: [140, 360], dur: 0.7, salt: 11, ease: "back.out(1.6)", spin: 120,
      make: (k) => ({ inner: `<div style="font:800 54px Arial;color:${k % 2 ? c.p.accent : c.p.accent2}">+</div>` }),
    });
    const html = `${plus.html}<div class="rip" style="left:${tx - 45}px;top:${ty - 45}px;opacity:0"></div><svg class="curs" viewBox="0 0 70 70" style="opacity:0"><path d="M10 6 L10 54 L22 43 L30 62 L38 58 L30 40 L47 40 Z" fill="#0f172a" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>`;
    const js = [
      plus.js,
      fromToLate(`${s} .curs`, { x: from.x, y: from.y, autoAlpha: 0 }, { x: tx, y: ty, autoAlpha: 1, duration: Math.min(0.7, Math.max(0.35, at - b.start + 0.2)), ease: "power3.inOut" }, n2(Math.max(0, b.start - 0.1))),
      fromToLate(`${s} .curs`, { scale: 1 }, { scale: 0.8, duration: 0.09, yoyo: true, repeat: 1 }, at),
      fromToLate(`${s} .rip`, { scale: 0.3, autoAlpha: 0.9, x: 0 }, { scale: 2.6, autoAlpha: 0, duration: 0.55, ease: "power2.out" }, at),
    ].join("\n");
    return { html, js };
  },
  charW: 0.58,
  reveal: "pop",
  trans: ["push", "zoom", "wipe"],
  caption: "bar",
  speaker: { radius: 46, shadow: "0 28px 64px rgba(15,23,42,0.38)", pip: 195 },
  scrim: "rgba(15,23,42,0.80)",
  modes: { hook: "full", stat: "pip", list: "bottom", quote: "full", tip: "bottom", cta: "full", compare: "bottom", facts: "pip", code: "pip" },
};

void fromTo;
