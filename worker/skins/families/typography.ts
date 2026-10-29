import type { Skin } from "../types";
import { burst, sway } from "../decor";
import { fromTo, n2 } from "../kit";

// Kinetic typography: one huge condensed face, hard cuts, one electric accent, no imagery.
// The spoken words themselves become the cards (see kineticCards in scenes.ts).
export const typography: Skin = {
  id: "typography",
  label: "Kinetic typography",
  blurb: "Giant words that snap, stretch and wipe on the beat",
  pal: () => ({ bg: "#0a0a0a", bg2: "#161616", ink: "#ffffff", sub: "#c4c4c4", accent: "#e6ff2b", accent2: "#ff4d2e", card: "#151515", edge: "#2c2c2c", onAccent: "#0a0a0a" }),
  fonts: ["anton"],
  head: "'Anton', sans-serif",
  body: "Arial, Helvetica, 'Liberation Sans', sans-serif",
  mono: "'Courier New', 'Liberation Mono', monospace",
  css: () => `
    #root { --hw: 400; --ls: 1px; --tt: uppercase; --rad: 0px; --rad-s: 0px; --bw: 4px; --cap: 'Anton', sans-serif; }
    .row, .fact, .col, .term { box-shadow: 8px 8px 0 var(--acc); border-color: #fff; }
    .row .n, .badge { border-radius: 0; }
    .cap { font-size: 66px; text-transform: uppercase; }
    .kc { font-size: 270px; }
    .gfx .eyebrow { background: var(--acc); color: var(--onacc); align-self: flex-start; padding: 6px 18px; letter-spacing: 4px; }
  `,
  bg(c) {
    // two rows of outlined brand name drifting in opposite directions, and thin accent rules
    // the brand name when there is one worth printing, otherwise a neutral word
    const word = `${(c.brandName || "NOW PLAYING").toUpperCase()} &nbsp;/&nbsp; `.repeat(7);
    const style = "position:absolute;left:0;white-space:nowrap;font:400 430px/1 'Anton',sans-serif;color:transparent;-webkit-text-stroke:3px rgba(255,255,255,0.11);";
    const html = `<div class="mq mq0" style="${style}top:60px">${word}</div><div class="mq mq1" style="${style}top:1180px">${word}</div><div style="position:absolute;left:0;top:0;width:1080px;height:1920px;background:linear-gradient(180deg,rgba(230,255,43,0.05),rgba(0,0,0,0) 40%)"></div>`;
    const js = [
      fromTo("#bg .mq0", { x: 0 }, { x: -3600, duration: c.dur, ease: "none" }, 0),
      fromTo("#bg .mq1", { x: -3600 }, { x: 0, duration: c.dur, ease: "none" }, 0),
    ].join("\n");
    return { html, js };
  },
  decor(b, c) {
    const lines = burst(b, {
      n: 10, dist: [260, 560], dur: 0.45, ease: "power4.out", spin: 0, salt: 3,
      make: (k, r) => ({ style: `width:${60 + Math.round(r() * 140)}px;height:${6 + Math.round(r() * 8)}px;background:${k % 2 ? c.p.accent : "#fff"};transform-origin:0 50%;` }),
    });
    const s = `#s${b.i}`;
    // a slab that slams across the top as the card changes, and the beat counter
    const html = `<div class="slab" style="position:absolute;left:0;top:10px;width:1080px;height:16px;background:${c.p.accent};transform-origin:left center"></div>${lines.html}`;
    const js = [
      fromTo(`${s} .slab`, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power4.out" }, n2(Math.max(0, b.start - 0.08))),
      fromTo(`${s} .slab`, { x: 0 }, { x: 1080, duration: 0.25, ease: "power3.in" }, n2(Math.max(0.35, b.end - 0.32))),
      lines.js,
    ].join("\n");
    return { html, js };
  },
  charW: 0.5,
  reveal: "mask",
  trans: ["flash", "slice", "wipe", "push"],
  caption: "pop",
  kinetic: true,
  speaker: { radius: 0, border: { w: 8, c: "#e6ff2b" }, pip: 0 },
  scrim: "rgba(0,0,0,0.80)",
  modes: { hook: "full", quote: "full", tip: "full", cta: "full", stat: "pip", list: "bottom", compare: "bottom", facts: "pip", code: "pip" },
};
