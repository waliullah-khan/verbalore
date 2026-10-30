import type { SceneType } from "../../src/lib/usecases";
import type { Scene, Word } from "../plan";
import { FONT_FACES } from "./fonts";
import { H, W, clean, esc, fromTo, fromToLate, hash, keywordOf, n2, set } from "./kit";
import { kineticCards, sceneBody } from "./scenes";
import type { Beat, Brand, Ctx, Mode, Skin, Trans } from "./types";

// Where the speaker sits in each layout. The frame is 1080 by 1920.
const GEO = {
  bottom: { left: 40, top: 800, width: 1000, height: 1080 },
  full: { left: 0, top: 0, width: 1080, height: 1920 },
  pip: { left: 650, top: 90, width: 390, height: 390 },
} as const;

const KINETIC: SceneType[] = ["hook", "quote", "tip", "cta", "keyword", "stack"];

const DEFAULT_MODES: Record<SceneType, Mode> = {
  hook: "full", stat: "pip", list: "bottom", quote: "full", tip: "bottom", cta: "full", code: "pip", compare: "bottom", facts: "pip", keyword: "pip", stack: "full",
};

// Never sit in one layout for three beats in a row: the picture should keep changing.
function chooseModes(scenes: Scene[], skin: Skin): Mode[] {
  const out: Mode[] = [];
  const order: Mode[] = ["full", "bottom", "pip"];
  scenes.forEach((s, i) => {
    let m = skin.modes?.[s.type] ?? DEFAULT_MODES[s.type];
    if (i >= 2 && out[i - 1] === m && out[i - 2] === m) m = order[(order.indexOf(m) + 1 + (i % 2)) % 3];
    out.push(m);
  });
  return out;
}

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

function transitionJs(kind: Trans, i: number, t: number, fps: number): string {
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
        fromTo(inc, { clipPath: "circle(0px at 540px 1000px)" }, { clipPath: "circle(1700px at 540px 1000px)", duration: 0.5, ease: "power2.inOut" }, a),
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
.spk { position: absolute; overflow: hidden; background: #000; z-index: 2; box-sizing: border-box; }
.spk video { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
.scene { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; z-index: 3; overflow: hidden; contain: layout paint style; }
.scrim { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; display: none; background: linear-gradient(180deg, var(--scrim) 0%, var(--scrim2) 58%, rgba(0,0,0,0) 84%); }
.m-full .scrim { display: block; }
.gfx { position: absolute; display: flex; flex-direction: column; justify-content: center; gap: 22px; box-sizing: border-box; }
.m-bottom .gfx { left: 40px; top: 80px; width: 1000px; height: 690px; }
.m-full .gfx { left: 60px; top: 140px; width: 960px; height: 1040px; }
.m-pip .gfx { left: 60px; top: 520px; width: 960px; height: 1040px; }
.deco { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; pointer-events: none; contain: layout style; }
.eyebrow { font: 700 30px var(--body); letter-spacing: 6px; text-transform: uppercase; color: var(--acc); }
.head, .mid { margin: 0; font-family: var(--head); font-weight: var(--hw); line-height: 1.02; color: var(--ink); letter-spacing: var(--ls); text-transform: var(--tt); }
.mid { font-size: 66px; line-height: 1.08; }
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
.row { display: flex; align-items: center; gap: 24px; padding: 20px 28px; border-radius: var(--rad); background: var(--card); border: var(--bw) solid var(--edge); font: 700 50px/1.1 var(--body); color: var(--ink); }
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
.kwrap { position: relative; width: 960px; height: 780px; }
.kc { position: absolute; left: 0; top: 0; width: 960px; height: 780px; display: flex; align-items: center; justify-content: center; text-align: center; font-family: var(--head); font-weight: var(--hw); line-height: 0.95; letter-spacing: var(--ls); text-transform: uppercase; color: var(--ink); overflow: hidden; visibility: hidden; }
.kc.hot { color: var(--acc); }
.kc span { display: block; }
.cap { position: absolute; left: 70px; width: 940px; top: 1600px; text-align: center; z-index: 6; font: 800 72px/1.1 var(--cap); color: #fff; box-sizing: border-box; text-shadow: 0 4px 0 rgba(0,0,0,.55), 0 0 26px rgba(0,0,0,.7); }
.capin { display: block; }
.cap .cw { display: inline-block; margin: 0 0.12em; color: var(--capbase); }
.cap-bar { background: rgba(0,0,0,.72); border-radius: 18px; padding: 18px 28px; text-shadow: none; left: 90px; width: 900px; }
.cap-type { font-family: var(--mono); color: var(--acc); text-shadow: 0 0 18px var(--acc); text-transform: none; }
.l3 { position: absolute; left: 0; top: 1430px; z-index: 7; display: flex; align-items: stretch; visibility: hidden; }
.l3 b { background: var(--acc); color: var(--onacc); font: 800 36px var(--body); padding: 14px 28px; letter-spacing: 2px; text-transform: uppercase; }
.l3 span { background: var(--ink); color: var(--bg); font: 700 30px var(--body); padding: 14px 28px; }
.pbar { position: absolute; left: 0; top: 0; width: ${W}px; height: 12px; background: var(--acc); z-index: 9; transform-origin: left center; }
#tw { position: absolute; left: -100px; top: -60px; width: 1300px; height: 2040px; background: var(--acc); z-index: 8; }
.tsl { position: absolute; left: 0; width: ${W}px; height: 330px; background: var(--acc); z-index: 8; }
.tg { position: absolute; left: 0; width: ${W}px; z-index: 8; opacity: 0; mix-blend-mode: normal; }
#tfl { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; background: #fff; z-index: 8; opacity: 0; }
#tdip { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; background: #000; z-index: 8; opacity: 0; }
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
}): string {
  const { scenes, words, brand, skin, videoFile } = args;
  const brandName = printableBrand(args.brandName);
  const duration = n2(args.duration);
  const p = skin.pal(brand);
  const seedNum = hash(args.seed ?? brandName + scenes.length);
  const ctx: Ctx = { dur: duration, p, brandName, n: scenes.length, seed: seedNum };
  const modes = chooseModes(scenes, skin);
  const fps = skin.stepFps ?? 24;

  const beats: Beat[] = scenes.map((s, i) => {
    const inWin = words.filter((w) => w.start >= s.start - 0.05 && w.start < s.end - 0.02);
    const keyword = s.keyword || keywordOf(s.headline || s.text);
    const hit = inWin.find((w) => clean(w.word) === clean(keyword));
    return {
      i, n: scenes.length, start: n2(s.start), end: n2(s.end), dur: n2(s.end - s.start), scene: s, mode: modes[i],
      keyword, kwAt: n2(hit ? hit.start : s.start + 0.5), words: inWin, seed: seedNum + i * 977,
    };
  });

  const bg = skin.bg(ctx);
  const sceneHtml: string[] = [];
  const js: string[] = [];

  // the speaker: one video element whose frame and zoom change on every beat
  const first = GEO[beats[0]?.mode ?? "bottom"];
  const spk = skin.speaker;
  const geoFor = (m: Mode) => ({
    ...GEO[m],
    borderRadius: m === "full" ? 0 : m === "pip" ? spk.pip ?? 195 : spk.radius,
    borderWidth: m === "full" ? 0 : spk.border?.w ?? 0,
  });
  beats.forEach((b, i) => {
    const g = geoFor(b.mode);
    const prev = geoFor(beats[i - 1]?.mode ?? b.mode);
    if (i > 0 && beats[i - 1].mode !== b.mode) {
      js.push(fromToLate("#spk", { x: prev.left, y: prev.top, width: prev.width, height: prev.height, borderRadius: prev.borderRadius, borderWidth: prev.borderWidth }, { x: g.left, y: g.top, width: g.width, height: g.height, borderRadius: g.borderRadius, borderWidth: g.borderWidth, duration: 0.42, ease: "power3.inOut" }, Math.max(0, b.start - 0.28)));
    }
    js.push(set("#spk", { zIndex: b.mode === "pip" ? 6 : 2 }, Math.max(0, b.start - 0.28)));
    // a punch-in on the cut, then a slow push for the rest of the beat
    const origin = i % 2 ? "50% 35%" : "50% 28%";
    js.push(fromToLate("#talk", { scale: i % 3 === 0 ? 1.26 : 1.18, transformOrigin: origin }, { scale: 1.06, duration: 0.45, ease: "power3.out" }, b.start));
    js.push(fromToLate("#talk", { scale: 1.06 }, { scale: 1.06 + Math.min(0.1, b.dur * 0.03), duration: Math.max(0.2, b.dur - 0.45), ease: "none" }, b.start + 0.45));
  });

  beats.forEach((b, i) => {
    const s = b.scene;
    const isKinetic = skin.kinetic && KINETIC.includes(s.type);
    const body = isKinetic ? kineticCards(b, skin) : sceneBody(b, skin);
    const deco = skin.decor(b, ctx);
    const dStart = n2(Math.max(0, b.start - (i === 0 ? 0 : 0.25)));
    const dDur = n2(Math.max(1, b.end - dStart));
    sceneHtml.push(
      `<section id="s${i}" class="scene clip m-${b.mode} rv-${skin.reveal}" data-start="${dStart}" data-duration="${dDur}" data-track-index="3"><div class="scrim"></div><div class="deco">${deco.html}</div><div class="gfx">${body.html}</div></section>`
    );
    js.push(body.js, deco.js);
    if (i > 0) js.push(transitionJs(skin.trans[(i - 1) % skin.trans.length], i, b.start, fps));
  });

  // captions
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

  // overlays start parked off screen; their tweens only run at the cuts
  js.unshift(set("#spk", { x: first.left, y: first.top }, 0), set("#tw", { x: -1500, skewX: -12 }, 0), ...Array.from({ length: 6 }, (_, k) => set(`#tsl${k}`, { scaleX: 0 }, 0)), ...(brandName ? [set(".l3", { x: -700 }, 0)] : []));

  // chrome: progress bar and a lower third in the first seconds
  js.push(fromTo(".pbar", { scaleX: 0 }, { scaleX: 1, duration, ease: "none" }, 0));
  if (brandName) js.push(fromToLate(".l3", { x: -700, autoAlpha: 1 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" }, 0.5));
  if (brandName) js.push(fromToLate(".l3", { x: 0 }, { x: -700, duration: 0.4, ease: "power3.in" }, Math.min(3.2, beats[0]?.end ?? 3)));
  if (brandName) js.push(set(".l3", { autoAlpha: 0 }, Math.min(3.7, (beats[0]?.end ?? 3) + 0.5)));

  const strips = Array.from({ length: 6 }, (_, k) => `<div id="tsl${k}" class="tsl" style="top:${k * 320}px"></div>`).join("");
  const glitch = [0, 1, 2].map((k) => `<div id="tg${k}" class="tg" style="top:${400 + k * 520}px;height:${90 + k * 30}px;background:${[p.accent, p.accent2, p.ink][k]}"></div>`).join("");
  const fonts = skin.fonts.map((f) => FONT_FACES[f] ?? "").join("\n");
  const g0 = geoFor(beats[0]?.mode ?? "bottom");
  const border = spk.border ? `border: ${g0.borderWidth}px solid ${spk.border.c};` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(brandName || "Video")}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${fonts}
      #root { --bg:${p.bg}; --bg2:${p.bg2}; --ink:${p.ink}; --sub:${p.sub}; --acc:${p.accent}; --acc2:${p.accent2}; --card:${p.card}; --edge:${p.edge}; --onacc:${p.onAccent}; --head:${skin.head}; --body:${skin.body}; --mono:${skin.mono}; --cap:${skin.body}; --capbase:${skin.capBase ?? "rgba(255,255,255,0.62)"}; --scrim:${skin.scrim}; --scrim2:${skin.scrim.replace(/[\d.]+\)$/, "0.45)")}; --hw:800; --ls:0px; --tt:none; --rad:24px; --rad-s:8px; --bw:2px; }
      ${BASE_CSS(skin)}
      ${skin.css(p)}
      .spk { left:0px; top:0px; width:${first.width}px; height:${first.height}px; border-radius:${g0.borderRadius}px; ${border} ${spk.shadow ? `box-shadow:${spk.shadow};` : ""} }
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
      <div id="tw"></div>${strips}${glitch}<div id="tfl"></div><div id="tdip"></div>
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

