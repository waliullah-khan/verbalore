import type { SceneType } from "../../src/lib/usecases";
import type { Scene, Word } from "../plan";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.replace("#", "").padEnd(6, "0").slice(i - 1, i + 1), 16)).join(",");
import { FONT_FACES } from "./fonts";
import { H, W, clean, esc, fromTo, fromToLate, hash, keywordOf, n2, set } from "./kit";
import { kineticCards, sceneBody } from "./scenes";
import type { Beat, Brand, Ctx, Skin, Trans } from "./types";

// THE LAYOUT RULE. The speaker is the hero of every frame: the top 60% of the 9:16 picture at full width, never
// shrunk, moved or covered. Every graphic, counter, chart, list and caption lives in the deck below (the other 40%),
// and each scene is clipped to the deck, so nothing a skin draws or animates can reach the face.
export const STAGE_H = 1152;
export const DECK_H = 768;

const KINETIC: SceneType[] = ["hook", "quote", "tip", "cta", "keyword", "stack"];

export function captionChunks(words: Word[], duration: number) {
  const chunks: { start: number; end: number; ws: Word[] }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, ws: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? next.start - w.end : 1;
    if (cur.length >= 4 || /[.!?,;]$/.test(w.word) || gap > 0.5) flush();
  });
  flush();
  // each caption holds until the next one starts
  return chunks.map((c, i) => ({
    start: n2(c.start),
    end: n2(Math.min(duration, chunks[i + 1] ? Math.min(chunks[i + 1].start, c.end + 1.0) : c.end + 0.6)),
    ws: c.ws,
    words: c.ws.map((w) => w.word),
  }));
}

function transitionJs(kind: Trans, i: number, t: number, fps: number, cy = 384, r = 1300): string {
  const inc = `#s${i}`;
  const out = `#s${i - 1}`;
  const a = t - 0.25;
  switch (kind) {
    case "wipe":
      return [
        fromToLate("#tw", { x: -1500 }, { x: 0, duration: 0.2, ease: "power2.in" }, a),
        fromToLate("#tw", { x: 0 }, { x: 1500, duration: 0.24, ease: "power2.out" }, a + 0.2),
      ].join("\n");
    case "slice": {
      const lines: string[] = [];
      for (let k = 0; k < 6; k++) {
        lines.push(fromToLate(`#tsl${k}`, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.16, ease: "power2.in" }, a + k * 0.025));
        lines.push(fromToLate(`#tsl${k}`, { scaleX: 1, transformOrigin: "100% 50%" }, { scaleX: 0, duration: 0.18, ease: "power2.out" }, a + 0.2 + k * 0.025));
      }
      return lines.join("\n");
    }
    case "iris":
      return [
        fromTo(inc, { clipPath: `circle(0px at 540px ${cy}px)` }, { clipPath: `circle(${r}px at 540px ${cy}px)`, duration: 0.5, ease: "power2.inOut" }, a),
        set(inc, { clipPath: "none" }, a + 0.52),
      ].join("\n");
    case "zoom":
      return [
        fromTo(out, { scale: 1 }, { scale: 1.4, autoAlpha: 0, duration: 0.3, ease: "power2.in" }, a),
        fromTo(inc, { scale: 0.78, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.36, ease: "power3.out" }, a + 0.04),
      ].join("\n");
    case "push":
      return [
        fromTo(inc, { x: 1080 }, { x: 0, duration: 0.42, ease: "power3.out" }, a),
        fromTo(out, { x: 0 }, { x: -320, duration: 0.42, ease: "power3.out" }, a),
      ].join("\n");
    case "glitch": {
      const lines: string[] = [];
      for (let k = 0; k < 3; k++) {
        lines.push(fromToLate(`#tg${k}`, { x: -1200 + k * 40, autoAlpha: 1 }, { x: 1200, autoAlpha: 1, duration: 0.2, ease: "steps(5)" }, a + 0.04 + k * 0.03));
        lines.push(set(`#tg${k}`, { autoAlpha: 0 }, a + 0.3));
      }
      lines.push(fromTo(inc, { x: -26, skewX: 8 }, { x: 0, skewX: 0, duration: 0.24, ease: "steps(4)" }, a + 0.05));
      return lines.join("\n");
    }
    case "flash":
      return [fromToLate("#tfl", { autoAlpha: 0 }, { autoAlpha: 0.95, duration: 0.07, ease: "power1.in" }, a + 0.12), fromToLate("#tfl", { autoAlpha: 0.95 }, { autoAlpha: 0, duration: 0.2, ease: "power2.out" }, a + 0.19)].join("\n");
    case "dip":
      return [fromToLate("#tdip", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: "power1.in" }, a), fromToLate("#tdip", { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, ease: "power1.out" }, a + 0.2)].join("\n");
    default:
      return fromTo(inc, { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, duration: Math.round(fps / 3) / fps, ease: "steps(3)" }, a + 0.04);
  }
}

const BASE_CSS = (skin: Skin) => `
body { margin: 0; background: #000; }
#root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); color: var(--ink); font-family: var(--body); }
.layer { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: hidden; z-index: 1; }
.spk { position: absolute; left: 0; top: 0; width: ${W}px; height: ${STAGE_H}px; overflow: hidden; background: #000; z-index: 2; box-sizing: border-box; }
.spk video { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 14%; transform-origin: 50% 28%; }
.scene { position: absolute; left: 0; top: ${STAGE_H}px; width: ${W}px; height: ${DECK_H}px; z-index: 3; overflow: hidden; contain: layout paint style; }
.scrim { position: absolute; left: 0; top: 0; width: ${W}px; height: ${DECK_H}px; background: var(--deck); border-top: 8px solid var(--acc); box-sizing: border-box; }
.deco { position: absolute; left: 0; top: 0; width: ${W}px; height: ${DECK_H}px; pointer-events: none; contain: layout style; }
/* graphics are laid out on a 1175 by 690 board and scaled to 987 by 580, which is what fits the deck above the captions */
.gfxw { position: absolute; left: 46px; top: 16px; width: 1175px; height: 690px; transform: scale(0.84); transform-origin: 0 0; }
.gfx { position: absolute; left: 0; top: 0; width: 1175px; height: 690px; display: flex; flex-direction: column; justify-content: center; gap: 22px; box-sizing: border-box; }
.eyebrow { font: 700 30px var(--body); letter-spacing: 6px; text-transform: uppercase; color: var(--acc); }
.head, .mid { margin: 0; font-family: var(--head); font-weight: var(--hw); line-height: 1.02; color: var(--ink); letter-spacing: var(--ls); text-transform: var(--tt); }
.mid { font-size: 78px; line-height: 1.06; }
/* Animated words sit in inline-blocks, so the gap between them is a real margin as well as the space character:
   a mask's negative margins and a scaled word can no longer close it. */
.head, .mid, .kwword, .stackwrap { word-spacing: 0.06em; }
.w { display: inline-block; vertical-align: top; margin-right: 0.16em; }
.rv-mask .w { overflow: hidden; padding: 0.08em 0.03em 0.14em; margin-top: -0.08em; margin-bottom: -0.14em; margin-left: -0.03em; margin-right: 0.13em; }
.w:last-child { margin-right: 0; }
.wi { display: inline-block; }
.kw { color: var(--acc); }
.sub { margin: 0; font: 600 46px/1.22 var(--body); color: var(--sub); }
.rule { width: 220px; height: 14px; border-radius: var(--rad-s); background: var(--acc); transform-origin: left center; }
.qmark { font: 900 260px/0.7 var(--head); color: var(--acc); height: 120px; }
.badge { width: 150px; height: 150px; border-radius: 50%; background: var(--acc); color: var(--onacc); display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--head); border: var(--bw) solid var(--ink); }
.badge b { font-size: 72px; line-height: 1; }
.badge span { font: 700 24px var(--body); letter-spacing: 3px; text-transform: uppercase; }
.arrow { display: block; }
.statrow { display: flex; align-items: center; gap: 30px; }
.ring { flex: none; width: 300px; height: 300px; }
.stat { font-family: var(--head); font-weight: var(--hw); color: var(--acc); line-height: 1; letter-spacing: var(--ls); }
.odo { display: inline-flex; align-items: flex-start; }
.odo-c { display: inline-block; height: var(--odo); overflow: hidden; }
.odo-r { display: flex; flex-direction: column; }
.odo-r i { display: block; font-style: normal; height: var(--odo); line-height: var(--odo); }
.odo-s { display: inline-block; height: var(--odo); line-height: var(--odo); }
.meter { height: 18px; border-radius: 99px; background: var(--edge); overflow: hidden; }
.fill { display: block; width: 100%; height: 100%; border-radius: 99px; background: var(--acc); transform-origin: left center; transform: scaleX(0); }
.list { margin: 0; padding: 0; list-style: none; display: grid; gap: 16px; }
.row { display: flex; align-items: center; gap: 24px; padding: 20px 28px; border-radius: var(--rad); background: var(--card); border: var(--bw) solid var(--edge); font: 700 54px/1.1 var(--body); color: var(--ink); }
.row .n { flex: none; width: 66px; height: 66px; border-radius: 50%; background: var(--acc); color: var(--onacc); display: inline-flex; align-items: center; justify-content: center; font: 800 38px var(--body); }
.row .t { flex: 1; }
.row .chk { flex: none; color: var(--acc); }
.pill { align-self: flex-start; display: inline-flex; align-items: center; gap: 22px; padding: 22px 46px; border-radius: 999px; background: var(--acc); color: var(--onacc); font: 800 50px var(--body); border: var(--bw) solid var(--ink); }
.pings { position: relative; height: 0; }
.pings i { position: absolute; left: 90px; top: -60px; width: 120px; height: 120px; border-radius: 50%; border: 6px solid var(--acc); }
.term { border-radius: var(--rad); background: #060906; border: var(--bw) solid var(--edge); overflow: hidden; }
.tbar { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border-bottom: 2px solid var(--edge); font: 600 24px var(--mono); color: var(--sub); }
.tbar i { width: 18px; height: 18px; border-radius: 50%; background: #3b434c; display: block; }
.tbar span { margin-left: 14px; }
.tbody { padding: 26px 30px 34px; display: grid; gap: 10px; font: 600 42px/1.25 var(--mono); }
.ln .no { color: var(--sub); margin-right: 24px; }
.ln .tx { color: var(--acc); display: inline-block; }
.cur { display: inline-block; width: 22px; height: 44px; background: var(--acc); margin-left: 8px; }
.cmp { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; }
.cmp .col { position: relative; border-radius: var(--rad); padding: 30px; border: var(--bw) solid var(--edge); background: var(--card); min-height: 270px; box-sizing: border-box; }
.cmp .col p { margin: 14px 0 0; font: 800 46px/1.12 var(--head); color: var(--ink); letter-spacing: var(--ls); text-transform: var(--tt); }
.cmp .lab { font: 700 26px var(--body); letter-spacing: 4px; text-transform: uppercase; color: var(--sub); }
.cmp .new { background: var(--acc); border-color: var(--acc); }
.cmp .new p, .cmp .new .lab { color: var(--onacc); }
.vs { width: 92px; height: 92px; border-radius: 50%; background: var(--ink); color: var(--bg); display: flex; align-items: center; justify-content: center; font: 900 36px var(--head); }
.strike { position: absolute; left: 20px; right: 20px; top: 50%; width: calc(100% - 40px); height: 20px; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.fact { display: grid; gap: 6px; padding: 24px 28px; border-radius: var(--rad); background: var(--card); border: var(--bw) solid var(--edge); }
.fact b { font-family: var(--head); font-weight: var(--hw); color: var(--acc); letter-spacing: var(--ls); line-height: 1; }
.fact span { font: 700 32px var(--body); color: var(--sub); text-transform: capitalize; }
.kwrap { position: relative; width: 1175px; height: 690px; }
.kc { position: absolute; left: 0; top: 0; width: 1175px; height: 690px; display: flex; align-items: center; justify-content: center; text-align: center; font-family: var(--head); font-weight: var(--hw); line-height: 0.95; letter-spacing: var(--ls); text-transform: uppercase; color: var(--ink); overflow: hidden; visibility: hidden; }
.kc.hot { color: var(--acc); }
.kc span { display: block; }
.cap { position: absolute; left: 50px; width: 980px; top: ${STAGE_H + 602}px; text-align: center; z-index: 6; font: 800 62px/1.08 var(--cap); color: #fff; box-sizing: border-box; text-shadow: 0 4px 0 rgba(0,0,0,.55), 0 0 22px rgba(0,0,0,.7); }
.capin { display: block; }
.cap .cw { display: inline-block; margin: 0 0.12em; color: var(--capbase); }
.cap-bar { background: rgba(0,0,0,.74); border-radius: 18px; padding: 12px 24px; text-shadow: none; left: 70px; width: 940px; }
.cap-type { font-family: var(--mono); color: var(--acc); text-shadow: 0 0 18px var(--acc); text-transform: none; }
.l3 { position: absolute; left: 0; top: 22px; z-index: 7; display: flex; align-items: stretch; visibility: hidden; }
.l3 b { background: var(--acc); color: var(--onacc); font: 800 26px var(--body); padding: 9px 20px; letter-spacing: 2px; text-transform: uppercase; }
.l3 span { background: var(--ink); color: var(--bg); font: 700 22px var(--body); padding: 9px 20px; }
.pbar { position: absolute; left: 0; top: 0; width: ${W}px; height: 12px; background: var(--acc); z-index: 9; transform-origin: left center; }
#trn { position: absolute; left: 0; top: ${STAGE_H}px; width: ${W}px; height: ${DECK_H}px; overflow: hidden; z-index: 8; pointer-events: none; }
#tw { position: absolute; left: -100px; top: -60px; width: 1300px; height: ${DECK_H + 120}px; background: var(--acc); }
.tsl { position: absolute; left: 0; width: ${W}px; height: 130px; background: var(--acc); }
.tg { position: absolute; left: 0; width: ${W}px; opacity: 0; }
#tfl { position: absolute; left: 0; top: 0; width: ${W}px; height: ${DECK_H}px; background: #fff; opacity: 0; }
#tdip { position: absolute; left: 0; top: 0; width: ${W}px; height: ${DECK_H}px; background: #000; opacity: 0; }
`;

// A workspace the app named itself ("Ada's workspace", "Admin's workspace") must never be burned into a video.
export const printableBrand = (name: string) => {
  const n = (name ?? "").trim();
  return n && !/'s workspace$/i.test(n) ? n : "";
};

export function composeShowreel(args: {
  scenes: Scene[];
  words: Word[];
  duration: number;
  brand: Brand;
  skin: Skin;
  videoFile: string;
  brandName: string;
  seed?: string;
  // an alpha matte of the speaker: when there is one, the cutout layout is used
  matteFile?: string;
}): string {
  if (args.matteFile) return composeCutout({ ...args, matteFile: args.matteFile });
  const { scenes, words, brand, skin, videoFile } = args;
  const brandName = printableBrand(args.brandName);
  const duration = n2(args.duration);
  const p = skin.pal(brand);
  const seedNum = hash(args.seed ?? brandName + scenes.length);
  const ctx: Ctx = { dur: duration, p, brandName, n: scenes.length, seed: seedNum };
  const fps = skin.stepFps ?? 24;

  const beats: Beat[] = scenes.map((s, i) => {
    const inWin = words.filter((w) => w.start >= s.start - 0.05 && w.start < s.end - 0.02);
    const keyword = s.keyword || keywordOf(s.headline || s.text);
    const hit = inWin.find((w) => clean(w.word) === clean(keyword));
    return {
      i, n: scenes.length, start: n2(s.start), end: n2(s.end), dur: n2(s.end - s.start), scene: s, mode: "bottom",
      keyword, kwAt: n2(hit ? hit.start : s.start + 0.5), words: inWin, seed: seedNum + i * 977,
    };
  });

  const bg = skin.bg(ctx);
  const sceneHtml: string[] = [];
  const js: string[] = [];

  // The speaker never moves or shrinks. All he gets is a small push-in on each cut, anchored high so the face stays framed.
  beats.forEach((b) => {
    js.push(fromToLate("#talk", { scale: 1.055, transformOrigin: "50% 28%" }, { scale: 1, duration: 0.4, ease: "power3.out" }, b.start));
    js.push(fromToLate("#talk", { scale: 1 }, { scale: n2(1 + Math.min(0.04, b.dur * 0.012)), duration: Math.max(0.2, b.dur - 0.4), ease: "none" }, n2(b.start + 0.4)));
  });

  beats.forEach((b, i) => {
    const s = b.scene;
    const isKinetic = skin.kinetic && KINETIC.includes(s.type);
    const body = isKinetic ? kineticCards(b, skin) : sceneBody(b, skin);
    const deco = skin.decor(b, ctx);
    const dStart = n2(Math.max(0, b.start - (i === 0 ? 0 : 0.25)));
    const dDur = n2(Math.max(1, b.end - dStart));
    sceneHtml.push(
      `<section id="s${i}" class="scene clip m-deck rv-${skin.reveal}" data-start="${dStart}" data-duration="${dDur}" data-track-index="3"><div class="scrim"></div><div class="deco">${deco.html}</div><div class="gfxw"><div class="gfx">${body.html}</div></div></section>`
    );
    js.push(body.js, deco.js);
    if (i > 0) js.push(transitionJs(skin.trans[(i - 1) % skin.trans.length], i, b.start, fps));
  });

  // captions sit in the deck, under the graphic
  const onKinetic = (t: number) => !!skin.kinetic && beats.some((b) => KINETIC.includes(b.scene.type) && t >= b.start - 0.05 && t < b.end);
  const caps = skin.caption === "none" ? [] : captionChunks(words, duration).filter((c) => !onKinetic(c.start));
  const capHtml = caps
    .map((c, k) => `<div id="c${k}" class="cap cap-${skin.caption} clip" data-start="${c.start}" data-duration="${n2(Math.max(0.3, c.end - c.start))}" data-track-index="5"><div class="capin">${c.ws.map((w) => `<span class="cw">${esc(w.word)}</span>`).join(" ")}</div></div>`)
    .join("\n      ");
  caps.forEach((c, k) => {
    js.push(fromTo(`#c${k} .capin`, { scale: 0.86, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.2, ease: "back.out(2)" }, c.start));
    c.ws.forEach((w, j) => {
      js.push(fromTo(`#c${k} .cw:nth-child(${j + 1})`, { color: skin.capBase ?? "rgba(255,255,255,0.62)" }, { color: p.accent2, duration: 0.05 }, n2(Math.max(c.start, w.start))));
    });
  });

  // overlays start parked; their tweens only run at the cuts, and only inside the deck
  js.unshift(set("#tw", { x: -1500, skewX: -12 }, 0), ...Array.from({ length: 6 }, (_, k) => set(`#tsl${k}`, { scaleX: 0 }, 0)), ...(brandName ? [set(".l3", { x: -700 }, 0)] : []));

  // chrome: the progress bar and a small tag live in the top strip
  js.push(fromTo(".pbar", { scaleX: 0 }, { scaleX: 1, duration, ease: "none" }, 0));
  if (brandName) js.push(fromToLate(".l3", { x: -700, autoAlpha: 1 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" }, 0.5));
  if (brandName) js.push(fromToLate(".l3", { x: 0 }, { x: -700, duration: 0.4, ease: "power3.in" }, Math.min(3.2, beats[0]?.end ?? 3)));
  if (brandName) js.push(set(".l3", { autoAlpha: 0 }, Math.min(3.7, (beats[0]?.end ?? 3) + 0.5)));

  const strips = Array.from({ length: 6 }, (_, k) => `<div id="tsl${k}" class="tsl" style="top:${k * 128}px"></div>`).join("");
  const glitch = [0, 1, 2].map((k) => `<div id="tg${k}" class="tg" style="top:${70 + k * 230}px;height:${70 + k * 22}px;background:${[p.accent, p.accent2, p.accent][k]}"></div>`).join("");
  const fonts = skin.fonts.map((f) => FONT_FACES[f] ?? "").join("\n");
  const sp = skin.speaker;
  const rad = Math.min(44, sp.radius);
  const edge = sp.border ? `border-bottom: ${sp.border.w}px solid ${sp.border.c};` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(brandName || "Video")}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${fonts}
      #root { --bg:${p.bg}; --bg2:${p.bg2}; --ink:${p.ink}; --sub:${p.sub}; --acc:${p.accent}; --acc2:${p.accent2}; --card:${p.card}; --edge:${p.edge}; --onacc:${p.onAccent}; --head:${skin.head}; --body:${skin.body}; --mono:${skin.mono}; --cap:${skin.body}; --capbase:${skin.capBase ?? "rgba(255,255,255,0.62)"}; --deck:rgba(${rgb(p.bg)},0.86); --hw:800; --ls:0px; --tt:none; --rad:24px; --rad-s:8px; --bw:2px; }
      ${BASE_CSS(skin)}
      ${skin.css(p)}
      .spk { border-radius: 0 0 ${rad}px ${rad}px; ${edge} ${sp.shadow ? `box-shadow:${sp.shadow};` : ""} }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-duration="${duration}">
      <div class="layer" id="bg">${bg.html}</div>
      <div id="spk" class="spk"><video id="talk" src="${esc(videoFile)}" data-start="0" data-duration="${duration}" data-track-index="0" muted playsinline></video></div>
      <audio id="talk-a" src="${esc(videoFile)}" data-start="0" data-duration="${duration}" data-track-index="10" data-volume="1"></audio>
      ${sceneHtml.join("\n      ")}
      ${capHtml}
      ${brandName ? `<div class="l3"><b>${esc(brandName)}</b><span>on camera</span></div>` : ""}
      <div id="trn"><div id="tw"></div>${strips}${glitch}<div id="tfl"></div><div id="tdip"></div></div>
      <div class="pbar"></div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${bg.js}
      ${js.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------------------------
// THE CUTOUT LAYOUT. With an alpha matte of the speaker, the room is replaced by the skin's own backdrop and the
// graphics move behind him. Bottom to top: backdrop, the original room (which slides away as strips in the first
// second), behind-the-speaker graphics, the speaker cutout, foreground chips, captions, top-edge progress.
// Nothing in front of the speaker ever sits on the face: foreground items live at the edges and over the chest.
// ---------------------------------------------------------------------------------------------------------------
type CutoutArgs = {
  scenes: Scene[];
  words: Word[];
  duration: number;
  brand: Brand;
  skin: Skin;
  videoFile: string;
  brandName: string;
  seed?: string;
  matteFile: string;
};

const HEAD_Y = 790; // where the head sits in the 1080 by 1920 frame once the cutout is placed
const CUT = { left: 97, top: 345, width: 886, height: 1575 };

function composeCutout(args: CutoutArgs): string {
  const { scenes, words, brand, skin, videoFile, matteFile } = args;
  const brandName = printableBrand(args.brandName);
  const duration = n2(args.duration);
  const p = skin.pal(brand);
  const seedNum = hash(args.seed ?? brandName + scenes.length);
  const ctx: Ctx = { dur: duration, p, brandName, n: scenes.length, seed: seedNum, full: true };
  const fps = skin.stepFps ?? 24;

  const beats: Beat[] = scenes.map((s, i) => {
    const inWin = words.filter((w) => w.start >= s.start - 0.05 && w.start < s.end - 0.02);
    const keyword = s.keyword || keywordOf(s.headline || s.text);
    const hit = inWin.find((w) => clean(w.word) === clean(keyword));
    return {
      i, n: scenes.length, start: n2(s.start), end: n2(s.end), dur: n2(s.end - s.start), scene: s, mode: "cutout",
      keyword, kwAt: n2(hit ? hit.start : s.start + 0.5), words: inWin, seed: seedNum + i * 977,
    };
  });

  const bg = skin.bg(ctx);
  const sceneHtml: string[] = [];
  const fgHtml: string[] = [];
  const js: string[] = [];

  // the room leaves: five strips of the original footage slide off, and the speaker (who starts at the room's own
  // scale, so he sits exactly on his own picture) eases back to head-and-shoulders size as they go
  const STRIPS = 5;
  const SW = 216;
  const room = Array.from({ length: STRIPS }, (_, k) =>
    `<div id="rs${k}" class="rs" style="left:${k * SW}px;width:${SW}px"><video class="rvid" src="${esc(videoFile)}" data-start="0" data-duration="1.3" data-track-index="${20 + k}" muted playsinline style="left:${-k * SW}px"></video></div>`
  ).join("");
  for (let k = 0; k < STRIPS; k++) js.push(fromToLate(`#rs${k}`, { yPercent: 0 }, { yPercent: k % 2 ? 108 : -108, duration: 0.62, ease: "power3.in" }, n2(0.14 + k * 0.07)));
  const roomScale = n2(1080 / CUT.width);
  js.push(set("#cut", { scale: roomScale, transformOrigin: "50% 100%" }, 0));
  js.push(fromToLate("#cut", { scale: roomScale, transformOrigin: "50% 100%" }, { scale: 1, duration: 0.95, ease: "power3.inOut" }, 0.15));

  // a punch-in on every cut after the opening, anchored on the head, never past 1.08
  beats.forEach((b) => {
    const t0 = Math.max(b.start, 1.2);
    if (t0 > b.end - 0.35) return;
    js.push(fromToLate("#cut", { scale: 1.06, transformOrigin: "50% 32%" }, { scale: 1, duration: 0.4, ease: "power3.out" }, n2(t0)));
    js.push(fromToLate("#cut", { scale: 1, transformOrigin: "50% 32%" }, { scale: n2(1 + Math.min(0.035, b.dur * 0.011)), duration: Math.max(0.2, b.dur - (t0 - b.start) - 0.4), ease: "none" }, n2(t0 + 0.4)));
  });

  const GX = [129, 40, 218, 129];
  const GY = [112, 150, 124, 140];
  const BGY = [560, 690, 520, 640];
  beats.forEach((b, i) => {
    const s = b.scene;
    const v = i % 4;
    const isKinetic = skin.kinetic && KINETIC.includes(s.type);
    const body = isKinetic ? kineticCards(b, skin) : sceneBody(b, skin);
    const deco = skin.decor(b, ctx);
    const dStart = n2(Math.max(0, b.start - (i === 0 ? 0 : 0.25)));
    const dDur = n2(Math.max(1, b.end - dStart));

    // a giant version of the emphasised word sits behind his head and shoulders, so his body cuts into it
    const kw = (b.keyword || "").toUpperCase().replace(/[^A-Z0-9$%]/g, "") || "NOW";
    const size = Math.min(520, Math.floor(1000 / (Math.max(3, kw.length) * (skin.charW ?? 0.58) * 1.1)));
    const bgStyle = [
      `-webkit-text-stroke:5px ${p.accent};color:transparent;`,
      `color:${p.accent};opacity:0.22;transform:rotate(-4deg);`,
      `-webkit-text-stroke:5px ${p.accent2};color:transparent;transform:rotate(3deg);`,
      `color:${p.ink};opacity:0.14;`,
    ][v];
    const orbit = s.type === "stat" || i % 3 === 1 ? `<div class="orbit"></div>` : "";
    const rot = v === 3 ? " rotate(-2deg)" : "";
    sceneHtml.push(
      `<section id="s${i}" class="scene clip m-cutout rv-${skin.reveal}" data-start="${dStart}" data-duration="${dDur}" data-track-index="3"><div class="deco">${orbit}<div class="bgword" style="top:${BGY[v]}px;font-size:${size}px;${bgStyle}">${esc(kw)}</div>${deco.html}</div><div class="gfxw" style="left:${GX[v]}px;top:${GY[v]}px;transform:scale(0.7)${rot}"><div class="gfx">${body.html}</div></div></section>`
    );
    const sel = `#s${i}`;
    js.push(fromToLate(`${sel} .bgword`, { y: 90, autoAlpha: 0, scale: 1.08 }, { y: 0, autoAlpha: v === 1 ? 0.22 : v === 3 ? 0.14 : 1, scale: 1, duration: 0.7, ease: "power3.out" }, n2(Math.max(0, b.start - 0.05))));
    js.push(fromToLate(`${sel} .bgword`, { x: -40 }, { x: 40, duration: Math.max(0.6, b.dur), ease: "none" }, n2(b.start + 0.3)));
    if (orbit) {
      js.push(fromToLate(`${sel} .orbit`, { scale: 0.5, autoAlpha: 0, rotation: 0 }, { scale: 1, autoAlpha: 0.55, rotation: 120, duration: Math.max(0.8, b.dur), ease: "power1.out" }, n2(b.start)));
    }
    js.push(body.js, deco.js);
    if (i > 0) js.push(transitionJs(skin.trans[(i - 1) % skin.trans.length], i, b.start, fps, HEAD_Y, 1500));

    // foreground chip at the edge, pointing toward him, never near the face
    const left = i % 2 === 0;
    const label = s.type === "stat" && s.stat ? s.stat : (b.keyword || "").slice(0, 14);
    const arrow = `<svg viewBox="0 0 40 24" width="44" height="26" style="transform:${left ? "none" : "scaleX(-1)"}"><path d="M2 12 H32 M22 3 L34 12 L22 21" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    fgHtml.push(
      `<div id="f${i}" class="fg clip" data-start="${b.start}" data-duration="${n2(b.dur)}" data-track-index="6"><div class="fgin" style="${left ? "left:14px" : "right:14px"};top:${1290 + (i % 3) * 60}px">${esc(label)}${arrow}</div></div>`
    );
    js.push(fromTo(`#f${i} .fgin`, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.4, ease: "back.out(2)" }, n2(Math.max(b.start + 0.15, b.kwAt - 0.1))));
  });

  // captions over the chest, on a strong backing
  const caps = skin.caption === "none" ? [] : captionChunks(words, duration);
  const capHtml = caps
    .map((c, k) => `<div id="c${k}" class="cap cap-${skin.caption} clip" data-start="${c.start}" data-duration="${n2(Math.max(0.3, c.end - c.start))}" data-track-index="5"><div class="capin">${c.ws.map((w) => `<span class="cw">${esc(w.word)}</span>`).join(" ")}</div></div>`)
    .join("\n      ");
  caps.forEach((c, k) => {
    js.push(fromTo(`#c${k} .capin`, { scale: 0.86, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.2, ease: "back.out(2)" }, c.start));
    c.ws.forEach((w, j) => {
      js.push(fromTo(`#c${k} .cw:nth-child(${j + 1})`, { color: skin.capBase ?? "rgba(255,255,255,0.62)" }, { color: p.accent2, duration: 0.05 }, n2(Math.max(c.start, w.start))));
    });
  });

  js.unshift(set("#tw", { x: -1500, skewX: -12 }, 0), ...Array.from({ length: 6 }, (_, k) => set(`#tsl${k}`, { scaleX: 0 }, 0)), ...(brandName ? [set(".l3", { x: -700 }, 0)] : []));
  js.push(fromTo(".pbar", { scaleX: 0 }, { scaleX: 1, duration, ease: "none" }, 0));
  if (brandName) js.push(fromToLate(".l3", { x: -700, autoAlpha: 1 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" }, 1.1));
  if (brandName) js.push(fromToLate(".l3", { x: 0 }, { x: -700, duration: 0.4, ease: "power3.in" }, Math.min(3.8, beats[0]?.end ?? 3.5)));
  if (brandName) js.push(set(".l3", { autoAlpha: 0 }, Math.min(4.3, (beats[0]?.end ?? 3.5) + 0.5)));

  const strips = Array.from({ length: 6 }, (_, k) => `<div id="tsl${k}" class="tsl" style="top:${k * 320}px"></div>`).join("");
  const glitch = [0, 1, 2].map((k) => `<div id="tg${k}" class="tg" style="top:${300 + k * 520}px;height:${90 + k * 26}px;background:${[p.accent, p.accent2, p.accent][k]}"></div>`).join("");
  const fonts = skin.fonts.map((f) => FONT_FACES[f] ?? "").join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(brandName || "Video")}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${fonts}
      #root { --bg:${p.bg}; --bg2:${p.bg2}; --ink:${p.ink}; --sub:${p.sub}; --acc:${p.accent}; --acc2:${p.accent2}; --card:${p.card}; --edge:${p.edge}; --onacc:${p.onAccent}; --head:${skin.head}; --body:${skin.body}; --mono:${skin.mono}; --cap:${skin.body}; --capbase:${skin.capBase ?? "rgba(255,255,255,0.62)"}; --hw:800; --ls:0px; --tt:none; --rad:24px; --rad-s:8px; --bw:2px; }
      ${BASE_CSS(skin)}
      ${skin.css(p)}
      #room { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; z-index: 2; overflow: hidden; }
      .rs { position: absolute; top: 0; height: ${H}px; overflow: hidden; }
      .rvid { position: absolute; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
      .scene { left: 0; top: 0; width: ${W}px; height: ${H}px; z-index: 3; contain: none; }
      .scrim { display: none; }
      .deco { width: ${W}px; height: ${H}px; contain: none; }
      .gfxw { width: 1175px; height: 690px; transform-origin: 0 0; }
      .bgword { position: absolute; left: 0; width: ${W}px; text-align: center; font-family: var(--head); font-weight: var(--hw); text-transform: uppercase; line-height: 1; white-space: nowrap; letter-spacing: var(--ls); }
      .orbit { position: absolute; left: 210px; top: ${HEAD_Y - 330}px; width: 660px; height: 660px; border-radius: 50%; border: 6px dashed var(--acc); }
      #cut { position: absolute; left: ${CUT.left}px; top: ${CUT.top}px; width: ${CUT.width}px; height: ${CUT.height}px; z-index: 4; object-fit: cover; pointer-events: none; }
      .fg { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; z-index: 5; pointer-events: none; }
      .fgin { position: absolute; display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-radius: var(--rad); background: var(--acc); color: var(--onacc); font: 800 38px var(--body); border: var(--bw) solid var(--ink); text-transform: uppercase; box-shadow: 0 8px 0 rgba(0,0,0,0.25); }
      .cap { top: 1556px; left: 60px; width: 960px; background: rgba(0,0,0,0.78); border-radius: 18px; padding: 12px 24px; text-shadow: none; z-index: 6; }
      .cap-bar { left: 60px; width: 960px; }
      #trn { top: 0; height: ${H}px; z-index: 3; }
      #tw { height: ${H + 120}px; }
      .tsl { height: 330px; }
      #tfl, #tdip { height: ${H}px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-duration="${duration}">
      <div class="layer" id="bg">${bg.html}</div>
      <div id="room">${room}</div>
      ${sceneHtml.join("\n      ")}
      <div id="trn"><div id="tw"></div>${strips}${glitch}<div id="tfl"></div><div id="tdip"></div></div>
      <video id="cut" src="${esc(matteFile)}" data-start="0" data-duration="${duration}" data-track-index="2" muted playsinline></video>
      ${fgHtml.join("\n      ")}
      <audio id="talk-a" src="${esc(videoFile)}" data-start="0" data-duration="${duration}" data-track-index="10" data-volume="1"></audio>
      ${capHtml}
      ${brandName ? `<div class="l3"><b>${esc(brandName)}</b><span>on camera</span></div>` : ""}
      <div class="pbar"></div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${bg.js}
      ${js.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
