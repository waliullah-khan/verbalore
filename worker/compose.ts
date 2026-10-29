import type { ThemeId } from "../src/lib/usecases";
import type { Scene, Word } from "./plan";

export type Brand = { accent: string; paper: string; ink: string };
export type Theme = ThemeId;

const esc = (s: string) => s.replace(/`/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const t2 = (n: number) => Number(n.toFixed(2));

type Palette = { bg: string; card: string; text: string; sub: string; accent: string; radius: number; serif: boolean; window: boolean; mono?: boolean; edge?: string };

function palette(theme: Theme, b: Brand): Palette {
  if (theme === "kinetic") return { bg: b.ink, card: "transparent", text: "#ffffff", sub: "#c9c0b0", accent: b.accent, radius: 0, serif: false, window: false };
  if (theme === "product") return { bg: "#0d1117", card: "#161b22", text: "#e6edf3", sub: "#8b949e", accent: b.accent, radius: 36, serif: false, window: true, edge: "#30363d" };
  if (theme === "terminal") return { bg: "#070a07", card: "#0d130e", text: "#d7ffd9", sub: "#7aa37e", accent: "#4ade80", radius: 24, serif: false, window: true, mono: true, edge: "#1f3a24" };
  if (theme === "boardroom") return { bg: "#0b1f3a", card: "#10294b", text: "#f4f7fb", sub: "#9db3d1", accent: "#8fb8ff", radius: 18, serif: true, window: false, edge: "#1f3d68" };
  if (theme === "listing") return { bg: "#15120e", card: "#1d1913", text: "#f6efe2", sub: "#bfae8e", accent: "#c9a45c", radius: 8, serif: true, window: false, edge: "#3a3224" };
  return { bg: b.paper, card: "#fbf8f1", text: b.ink, sub: "#5b5348", accent: b.accent, radius: 44, serif: true, window: false };
}

export function captionChunks(words: Word[], duration: number) {
  const chunks: { start: number; end: number; words: string[] }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur.map((w) => w.word) });
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
    start: t2(c.start),
    end: t2(Math.min(duration, Math.max(c.end + 0.15, chunks[i + 1]?.start ?? duration))),
    words: c.words,
  }));
}

function emphasise(words: string[]): string {
  let best = -1;
  let len = 4;
  words.forEach((w, i) => {
    const l = w.replace(/[^\w]/g, "").length;
    if (l > len) { len = l; best = i; }
  });
  return words.map((w, i) => (i === best ? `<b>${esc(w)}</b>` : esc(w))).join(" ");
}

function sceneBody(s: Scene, i: number, total: number): string {
  const tag = (label: string) => `<div class="eyebrow a">${esc(label)}</div>`;
  switch (s.type) {
    case "hook":
      return `${tag("Watch this")}<h1 class="head a">${esc(s.headline)}</h1>`;
    case "stat":
      return `${tag("The number")}<div class="stat a">${esc(s.stat ?? "")}</div><p class="sub a">${esc(s.headline)}</p>`;
    case "list":
      return `${tag("Do this")}<h2 class="mid a">${esc(s.headline)}</h2><ol class="list">${(s.items ?? [])
        .map((it, n) => `<li class="a"><span class="n">${n + 1}</span>${esc(it)}</li>`)
        .join("")}</ol>`;
    case "quote":
      return `<div class="qmark a">&ldquo;</div><h2 class="head q a">${esc(s.headline)}</h2>`;
    case "cta":
      return `${tag("Next")}<h1 class="head a">${esc(s.headline)}</h1><div class="pill a">${esc(s.sub ?? "Follow for more")} &rarr;</div>`;
    case "code":
      return `${tag("Try it")}<div class="code">${(s.code ?? []).map((l, n) => `<div class="ln a"><span class="no">${n + 1}</span><span class="tx">${esc(l)}</span></div>`).join("")}</div><p class="sub a">${esc(s.headline)}</p>`;
    case "compare":
      return `${tag("The difference")}<div class="cmp"><div class="col old a"><span class="lab">${esc(s.compare?.leftLabel ?? "Before")}</span><p>${esc(s.compare?.left ?? "")}</p></div><div class="col new a"><span class="lab">${esc(s.compare?.rightLabel ?? "After")}</span><p>${esc(s.compare?.right ?? "")}</p></div></div>`;
    case "facts":
      return `${tag("At a glance")}<div class="facts">${(s.facts ?? []).map((f) => `<div class="fact a"><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join("")}</div>`;
    default:
      return `${tag(`Tip ${i}`)}<h2 class="head a">${esc(s.headline)}</h2>`;
  }
}

export function composeHtml(args: {
  scenes: Scene[];
  words: Word[];
  duration: number;
  brand: Brand;
  theme: Theme;
  videoFile: string;
  brandName: string;
}): string {
  const { scenes, words, brand, theme, videoFile, brandName } = args;
  const duration = t2(args.duration);
  const p = palette(theme, brand);
  const caps = captionChunks(words, duration);
  const headFont = p.mono ? "'Courier New', Consolas, monospace" : p.serif ? "Georgia, 'Times New Roman', serif" : "Arial, Helvetica, sans-serif";
  const headWeight = p.serif ? 700 : 800;
  const big = theme === "kinetic";

  const sceneEls = scenes
    .map((s, i) => {
      const start = t2(s.start);
      const dur = t2(Math.max(1, s.end - s.start));
      const chrome = p.window ? `<div class="chrome"><i></i><i></i><i></i><span>verbalore / ${esc(s.type)}</span></div>` : "";
      return `<section id="s${i}" class="scene clip" data-start="${start}" data-duration="${dur}" data-track-index="1">${chrome}<div class="inner">${sceneBody(s, i, scenes.length)}</div></section>`;
    })
    .join("\n      ");

  const capEls = caps
    .map((c, i) => `<div id="c${i}" class="cap clip" data-start="${c.start}" data-duration="${t2(Math.max(0.3, c.end - c.start))}" data-track-index="2">${emphasise(c.words)}</div>`)
    .join("\n      ");

  const sceneTl = scenes
    .map((s, i) => {
      const start = t2(s.start);
      const end = t2(s.end);
      return `tl.fromTo("#s${i}", { y: 70, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" }, ${start});
      tl.fromTo("#s${i} .a", { y: 36, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out", stagger: 0.12 }, ${t2(start + 0.12)});
      ${s.type === "stat" ? `tl.fromTo("#s${i} .stat", { scale: 0.7 }, { scale: 1, duration: 0.7, ease: "back.out(1.6)" }, ${t2(start + 0.15)});` : ""}
      tl.to("#s${i}", { y: -40, autoAlpha: 0, duration: 0.3, ease: "power2.in" }, ${t2(Math.max(start + 0.6, end - 0.3))});`;
    })
    .join("\n      ");

  const capTl = caps
    .map((c, i) => `tl.fromTo("#c${i}", { scale: 0.88, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.22, ease: "back.out(2)" }, ${c.start});`)
    .join("\n      ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${esc(brandName)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      body { margin: 0; background: ${p.bg}; font-family: Arial, Helvetica, sans-serif; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: ${p.bg}; }
      .bar { position: absolute; left: 0; top: 0; width: 1080px; height: 10px; background: ${p.accent}; transform-origin: left center; }
      .frame { position: absolute; left: 40px; top: 780px; width: 1000px; height: 1100px; border-radius: 44px; overflow: hidden; background: #000; }
      .frame video { width: 100%; height: 100%; object-fit: cover; }
      .tag { position: absolute; left: 70px; top: 810px; padding: 10px 22px; border-radius: 999px; background: ${p.accent}; color: #fff; font-size: 26px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
      .scene { position: absolute; left: 40px; top: 70px; width: 1000px; height: 670px; border-radius: ${p.radius}px; background: ${p.card}; color: ${p.text}; box-sizing: border-box; overflow: hidden; ${p.edge ? `border: 2px solid ${p.edge};` : ""} }
      .chrome { height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 28px; border-bottom: 2px solid ${p.edge ?? "#30363d"}; color: ${p.sub}; font: 600 24px 'Courier New', monospace; }
      .chrome i { width: 18px; height: 18px; border-radius: 50%; background: #3b434c; display: block; }
      .chrome span { margin-left: 18px; }
      .inner { padding: ${p.window ? "40px 56px" : big ? "30px 20px" : "60px 60px"}; display: flex; flex-direction: column; justify-content: center; height: ${p.window ? "calc(100% - 64px)" : "100%"}; box-sizing: border-box; gap: 18px; }
      .eyebrow { font-size: 30px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; color: ${p.accent}; }
      .head { margin: 0; font: ${headWeight} ${big ? 120 : 96}px/1.04 ${headFont}; color: ${p.text}; letter-spacing: -1px; }
      .mid { margin: 0; font: ${headWeight} 60px/1.1 ${headFont}; color: ${p.text}; }
      .sub { margin: 0; font: 600 44px/1.25 Arial, sans-serif; color: ${p.sub}; }
      .stat { font: 800 ${big ? 330 : 270}px/1 ${headFont}; color: ${p.accent}; letter-spacing: -6px; }
      .list { margin: 0; padding: 0; list-style: none; display: grid; gap: 18px; }
      .list li { display: flex; align-items: center; gap: 22px; font: 700 50px/1.1 Arial, sans-serif; color: ${p.text}; }
      .list .n { width: 64px; height: 64px; border-radius: 50%; background: ${p.accent}; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; flex: none; }
      .qmark { font: 700 220px/0.7 ${headFont}; color: ${p.accent}; height: 100px; }
      .q { font-size: 76px; }
      .pill { align-self: flex-start; margin-top: 12px; padding: 18px 40px; border-radius: 999px; background: ${p.accent}; color: #fff; font: 700 44px Arial, sans-serif; }
      .cap { position: absolute; left: 90px; width: 900px; top: 1640px; text-align: center; font: 800 78px/1.1 Arial, Helvetica, sans-serif; color: #fff; text-shadow: 0 4px 22px rgba(0,0,0,0.75); box-sizing: border-box; }
      .cap b { color: #ffd2b0; }
      .code { background: #050805; border-radius: 16px; padding: 22px 26px; display: grid; gap: 8px; font: 600 40px/1.25 'Courier New', Consolas, monospace; color: ${p.text}; border: 2px solid ${p.edge ?? "#30363d"}; }
      .code .no { color: ${p.sub}; margin-right: 22px; }
      .code .tx { color: ${p.accent}; }
      .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .cmp .col { border-radius: 20px; padding: 28px; border: 2px solid ${p.edge ?? p.sub}; min-height: 250px; box-sizing: border-box; }
      .cmp .col p { margin: 14px 0 0; font: 700 44px/1.15 ${headFont}; color: ${p.text}; }
      .cmp .lab { font: 700 26px Arial, sans-serif; letter-spacing: 4px; text-transform: uppercase; color: ${p.sub}; }
      .cmp .new { background: ${p.accent}; border-color: ${p.accent}; }
      .cmp .new p, .cmp .new .lab { color: #fff; }
      .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .fact { border: 2px solid ${p.edge ?? p.sub}; border-radius: 18px; padding: 22px 26px; display: grid; gap: 4px; }
      .fact b { font: 800 100px/1 ${headFont}; color: ${p.accent}; letter-spacing: -2px; }
      .fact span { font: 600 32px Arial, sans-serif; color: ${p.sub}; text-transform: capitalize; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${duration}">
      <div id="bar" class="bar"></div>
      <div class="frame"><video id="talk" src="${esc(videoFile)}" data-start="0" data-duration="${duration}" data-track-index="0" muted playsinline></video></div>
      <audio id="talk-a" src="${esc(videoFile)}" data-start="0" data-duration="${duration}" data-track-index="10" data-volume="1"></audio>
      <div class="tag">${esc(brandName)}</div>
      ${sceneEls}
      ${capEls}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#bar", { scaleX: 0 }, { scaleX: 1, duration: ${duration}, ease: "none" }, 0);
      ${sceneTl}
      ${capTl}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
