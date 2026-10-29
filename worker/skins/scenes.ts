import type { Beat, Out, Reveal, Skin } from "./types";
import { clean, esc, fit, fromTo, n2, numberOf, odometer, set, to, wordSpans } from "./kit";

// How a headline's words enter. Every skin picks one, which is most of what makes two skins feel different.
export function revealWords(reveal: Reveal, sel: string, at: number): string {
  const w = `${sel} .wi`;
  switch (reveal) {
    case "mask":
      return fromTo(w, { yPercent: 118 }, { yPercent: 0, duration: 0.5, ease: "power4.out", stagger: 0.07 }, at);
    case "pop":
      return fromTo(w, { scale: 0.3, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.46, ease: "back.out(1.5)", stagger: 0.07 }, at);
    case "type":
      return fromTo(w, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.34, ease: "steps(8)", stagger: 0.16 }, at);
    case "steps":
      return fromTo(w, { y: 70, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "steps(4)", stagger: 0.1 }, at);
    case "draw":
      return fromTo(w, { rotation: -8, y: 34, autoAlpha: 0 }, { rotation: 0, y: 0, autoAlpha: 1, duration: 0.46, ease: "power2.out", stagger: 0.09 }, at);
    case "flicker":
      return fromTo(w, { autoAlpha: 0, x: -36, skewX: 24 }, { autoAlpha: 1, x: 0, skewX: 0, duration: 0.34, ease: "steps(5)", stagger: 0.07 }, at);
    case "tilt3d":
      return fromTo(w, { rotationX: -85, autoAlpha: 0, transformOrigin: "50% 100%" }, { rotationX: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out", stagger: 0.09 }, at);
    default:
      return fromTo(w, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.1 }, at);
  }
}

// font size for a headline, scaled for fonts that run wide
const longestWord = (t: string) => Math.max(1, ...t.split(/\s+/).map((w) => w.replace(/[^\w]/g, "").length));
// a line is 900 px wide and a long word cannot wrap, so the size is capped by the widest word and the font's letter width
const capW = (skin: Skin, text: string, size: number) => Math.min(size, Math.floor(1080 / (longestWord(text) * (skin.charW ?? 0.58))));
const fsz = (skin: Skin) => (text: string, big: number, small: number) => capW(skin, text, Math.round(fit(text, big, small) * (skin.fontScale ?? 1)));

const tag = (t: string) => `<div class="eyebrow rv">${esc(t)}</div>`;
const CHECK = `<svg class="chk" viewBox="0 0 40 40" width="44" height="44"><path d="M8 21 L17 30 L33 11" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="40" stroke-dashoffset="0"/></svg>`;

function kwPulse(sel: string, b: Beat): string {
  // a small lift rather than a scale, so the emphasised word can never run into its neighbour
  return fromTo(`${sel} .kw`, { y: 0 }, { y: -14, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1 }, b.kwAt);
}

export function sceneBody(b: Beat, skin: Skin): Out {
  const F = fsz(skin);
  const s = b.scene;
  const sel = `#s${b.i}`;
  const a = b.i === 0 ? 0.05 : b.start - 0.1;
  const rv = (n = 0.45, stag = 0.1, at = a + 0.05) =>
    fromTo(`${sel} .rv`, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: n, ease: "power3.out", stagger: stag }, at);

  switch (s.type) {
    case "hook": {
      const size = F(s.headline, 168, 104);
      return {
        html: `${tag("Watch this")}<h1 class="head" style="font-size:${size}px">${wordSpans(s.headline, b.keyword)}</h1><div class="rule rv"></div>`,
        js: [
          fromTo(`${sel} .eyebrow`, { autoAlpha: 0, x: -50 }, { autoAlpha: 1, x: 0, duration: 0.35, ease: "power3.out" }, a),
          revealWords(skin.reveal, `${sel} .head`, a + 0.08),
          fromTo(`${sel} .rule`, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.out" }, a + 0.3),
          kwPulse(sel, b),
        ].join("\n"),
      };
    }
    case "stat": {
      const val = s.stat ?? "";
      const size = Math.round((val.length > 6 ? 230 : val.length > 4 ? 290 : 360) * (skin.fontScale ?? 1));
      const odo = odometer(val);
      const pct = /%/.test(val) ? numberOf(val) : null;
      const C = 2 * Math.PI * 150;
      const ring =
        pct !== null
          ? `<svg class="ring rv" viewBox="0 0 340 340" width="340" height="340"><circle cx="170" cy="170" r="150" fill="none" stroke="var(--edge)" stroke-width="22"/><circle class="arc" cx="170" cy="170" r="150" fill="none" stroke="var(--acc)" stroke-width="22" stroke-linecap="round" stroke-dasharray="${n2(C)}" stroke-dashoffset="${n2(C)}" transform="rotate(-90 170 170)"/></svg>`
          : "";
      const arcTo = pct !== null ? n2(C * (1 - Math.min(100, pct) / 100)) : n2(C * 0.25);
      return {
        html: `${tag("The number")}<div class="statrow">${ring}<div class="stat" style="font-size:${size}px;height:${size}px;--odo:${size}px">${odo.html}</div></div><p class="sub rv">${esc(s.headline)}</p><div class="meter rv"><i class="fill"></i></div>`,
        js: [
          rv(0.4, 0.08),
          pct !== null ? fromTo(`${sel} .arc`, { strokeDashoffset: n2(C) }, { strokeDashoffset: arcTo, duration: 1.1, ease: "power3.out" }, a + 0.1) : "",
          fromTo(`${sel} .odo-r`, { y: 0 }, { y: -20 * size, duration: Math.min(1.2, Math.max(0.7, b.dur * 0.5)), ease: "power3.out", stagger: { each: 0.09, from: "end" } }, a + 0.1),
          fromTo(`${sel} .stat`, { scale: 0.82 }, { scale: 1, duration: 0.7, ease: "back.out(1.7)" }, a + 0.1),
          fromTo(`${sel} .fill`, { scaleX: 0 }, { scaleX: pct !== null ? Math.min(1, pct / 100) : 0.78, duration: 1, ease: "power3.out" }, a + 0.25),
        ].join("\n"),
      };
    }
    case "list": {
      const items = (s.items ?? []).slice(0, b.mode === "cutout" ? 3 : 4);
      return {
        html: `${tag("Do this")}<h2 class="mid">${wordSpans(s.headline, b.keyword)}</h2><ol class="list">${items
          .map((it, n) => `<li class="row"><span class="n">${n + 1}</span><span class="t">${esc(it)}</span>${CHECK}</li>`)
          .join("")}</ol>`,
        js: [
          fromTo(`${sel} .eyebrow`, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.3 }, a),
          revealWords(skin.reveal, `${sel} .mid`, a + 0.05),
          fromTo(`${sel} .row`, { autoAlpha: 0, x: -120, scale: 0.94 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.45, ease: skin.reveal === "steps" ? "steps(5)" : "back.out(1.5)", stagger: 0.28 }, a + 0.3),
          fromTo(`${sel} .chk path`, { strokeDashoffset: 40 }, { strokeDashoffset: 0, duration: 0.3, ease: "power2.out", stagger: 0.28 }, a + 0.55),
        ].join("\n"),
      };
    }
    case "quote": {
      const size = F(s.headline, 112, 78);
      return {
        html: `<div class="qmark rv">${/\?/.test(s.text) ? "?" : "&ldquo;"}</div><h2 class="head" style="font-size:${size}px">${wordSpans(s.headline, b.keyword)}</h2><div class="rule rv"></div>`,
        js: [
          fromTo(`${sel} .qmark`, { scale: 0.2, autoAlpha: 0, rotation: -25 }, { scale: 1, autoAlpha: 1, rotation: 0, duration: 0.55, ease: "back.out(2)" }, a),
          revealWords(skin.reveal, `${sel} .head`, a + 0.12),
          fromTo(`${sel} .rule`, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out" }, a + 0.45),
          kwPulse(sel, b),
        ].join("\n"),
      };
    }
    case "cta": {
      const size = F(s.headline, 124, 84);
      return {
        html: `${tag("Next")}<h1 class="head" style="font-size:${size}px">${wordSpans(s.headline, b.keyword)}</h1><div class="pill rv"><span>${esc(s.sub ?? "Follow for more")}</span><svg viewBox="0 0 40 24" width="56" height="34"><path d="M2 12 H34 M24 3 L35 12 L24 21" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="pings"><i></i><i></i><i></i></div>`,
        js: [
          fromTo(`${sel} .eyebrow`, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.3 }, a),
          revealWords(skin.reveal, `${sel} .head`, a + 0.08),
          fromTo(`${sel} .pill`, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(2.2)" }, a + 0.4),
          to(`${sel} .pill`, { scale: 1.07, duration: 0.3, yoyo: true, repeat: Math.max(0, Math.floor((b.dur - 0.9) / 0.3) - 1), ease: "sine.inOut" }, a + 0.95),
          fromTo(`${sel} .pings i`, { scale: 0.2, autoAlpha: 0.7 }, { scale: 3.2, autoAlpha: 0, duration: 1, ease: "power2.out", stagger: 0.3 }, a + 0.5),
        ].join("\n"),
      };
    }
    case "code": {
      const lines = (s.code ?? []).slice(0, 5);
      return {
        html: `${tag("Try it")}<div class="term"><div class="tbar"><i></i><i></i><i></i><span>terminal</span></div><div class="tbody">${lines
          .map((l, n) => `<div class="ln"><span class="no">${n + 1}</span><span class="tx">${esc(l)}</span></div>`)
          .join("")}<span class="cur"></span></div></div><p class="sub rv">${esc(s.headline)}</p>`,
        js: [
          fromTo(`${sel} .term`, { autoAlpha: 0, y: 80, scale: 0.92 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.4)" }, a),
          fromTo(`${sel} .ln .tx`, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.4, ease: "steps(14)", stagger: 0.4 }, a + 0.35),
          to(`${sel} .cur`, { autoAlpha: 0, duration: 0.01, repeat: Math.max(0, Math.floor(b.dur / 0.5) - 1) * 2 + 1, repeatDelay: 0.24 }, a + 0.4),
          rv(0.4, 0.1, a + 0.6),
        ].join("\n"),
      };
    }
    case "compare": {
      const c = s.compare;
      return {
        html: `${tag("The difference")}<div class="cmp"><div class="col old"><span class="lab">${esc(c?.leftLabel ?? "Before")}</span><p>${esc(c?.left ?? "")}</p><svg class="strike" viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M2 10 L398 10" stroke="var(--acc)" stroke-width="8" stroke-linecap="round" stroke-dasharray="400" stroke-dashoffset="0"/></svg></div><div class="vs">VS</div><div class="col new"><span class="lab">${esc(c?.rightLabel ?? "After")}</span><p>${esc(c?.right ?? "")}</p></div></div>`,
        js: [
          fromTo(`${sel} .eyebrow`, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.3 }, a),
          fromTo(`${sel} .old`, { autoAlpha: 0, x: -260 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: "power4.out" }, a + 0.05),
          fromTo(`${sel} .new`, { autoAlpha: 0, x: 260 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: "power4.out" }, a + 0.15),
          fromTo(`${sel} .vs`, { scale: 0, rotation: -180 }, { scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.4)" }, a + 0.3),
          fromTo(`${sel} .strike path`, { strokeDashoffset: 400 }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, a + 0.75),
          to(`${sel} .old`, { opacity: 0.5, duration: 0.3 }, a + 0.85),
        ].join("\n"),
      };
    }
    case "facts": {
      const facts = (s.facts ?? []).slice(0, b.mode === "cutout" ? 2 : 4);
      const tiles = facts.map((f, n) => {
        const o = odometer(f.value, "odo");
        return `<div class="fact"><b style="font-size:104px;height:104px;--odo:104px">${o.html}</b><span>${esc(f.label)}</span><div class="meter"><i class="fill"></i></div></div>`;
      });
      return {
        html: `${tag("At a glance")}<div class="facts">${tiles.join("")}</div>`,
        js: [
          fromTo(`${sel} .eyebrow`, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.3 }, a),
          fromTo(`${sel} .fact`, { autoAlpha: 0, y: 90, scale: 0.8 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)", stagger: 0.12 }, a + 0.08),
          fromTo(`${sel} .odo-r`, { y: 0 }, { y: -20 * 104, duration: 0.9, ease: "power3.out", stagger: { each: 0.05, from: "end" } }, a + 0.2),
          fromTo(`${sel} .fill`, { scaleX: 0 }, { scaleX: 0.8, duration: 0.8, ease: "power3.out", stagger: 0.12 }, a + 0.4),
        ].join("\n"),
      };
    }
    case "keyword": {
      const toks = s.text.replace(/\s+/g, " ").trim().split(" ");
      const at = toks.findIndex((t) => clean(t) === clean(b.keyword));
      const before = toks.slice(Math.max(0, at - 3), Math.max(0, at)).join(" ").replace(/[,;:]$/, "");
      const after = toks.slice(at + 1, at + 4).join(" ").replace(/[.,;:!?]+$/, "");
      const word = b.keyword.replace(/[^\w$%.,-]/g, "") || s.headline;
      const size = capW(skin, word, Math.round((word.length <= 5 ? 330 : word.length <= 8 ? 240 : word.length <= 11 ? 180 : 135) * (skin.fontScale ?? 1)));
      return {
        html: `<div class="sub rv" style="min-height:56px">${esc(before || "Remember")}</div><h1 class="head kwword" style="font-size:${size}px">${wordSpans(word, word)}</h1><svg class="squig rv" viewBox="0 0 600 40" width="600" height="40"><path d="M4 24 C 60 4, 110 44, 170 22 S 280 6, 340 26 S 450 40, 520 18 S 580 14, 596 22" fill="none" stroke="var(--acc)" stroke-width="10" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0"/></svg><div class="sub rv">${esc(after)}</div>`,
        js: [
          fromTo(`${sel} .sub`, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power3.out", stagger: 0.25 }, a),
          revealWords(skin.reveal, `${sel} .kwword`, a + 0.06),
          fromTo(`${sel} .squig path`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.55, ease: "power2.out" }, a + 0.4),
          fromTo(`${sel} .squig`, { autoAlpha: 1 }, { autoAlpha: 1, duration: 0.01 }, a),
          fromTo(`${sel} .kwword .wi`, { scale: 1 }, { scale: 1.06, duration: Math.max(0.4, b.dur - 0.6), ease: "none" }, a + 0.6),
        ].join("\n"),
      };
    }
    case "stack": {
      const toks = s.headline.split(" ").filter(Boolean).slice(0, 3);
      const sizes = [210, 160, 120].map((x, n) => capW(skin, toks[n] ?? "", Math.round(x * (skin.fontScale ?? 1))));
      const rows = toks.map((t, n) => `<div class="stk stk${n}" style="font-size:${sizes[n]}px;${n === 1 ? "-webkit-text-stroke:4px var(--ink);color:transparent;" : ""}${n === 2 ? "color:var(--acc);" : ""}text-align:${n === 1 ? "right" : "left"}"><span class="w"><span class="wi">${esc(t)}</span></span></div>`);
      return {
        html: `<div class="stackwrap head" style="font-size:20px">${rows.join("")}</div>`,
        js: [
          revealWords(skin.reveal, `${sel} .stackwrap`, a),
          fromTo(`${sel} .stk1 .wi`, { x: 0 }, { x: -40, duration: Math.max(0.5, b.dur), ease: "none" }, a),
          fromTo(`${sel} .stk2 .wi`, { x: 0 }, { x: 40, duration: Math.max(0.5, b.dur), ease: "none" }, a),
        ].join("\n"),
      };
    }
    default: {
      const size = F(s.headline, 138, 92);
      return {
        html: `<div class="badge rv"><svg viewBox="0 0 48 48" width="70" height="70"><path d="M24 3 L29.8 17.6 L45 19 L33.4 29.2 L37 44 L24 36 L11 44 L14.6 29.2 L3 19 L18.2 17.6Z" fill="currentColor"/></svg><span>Tip</span></div><h2 class="head" style="font-size:${size}px">${wordSpans(s.headline, b.keyword)}</h2><svg class="arrow rv" viewBox="0 0 400 40" width="400" height="40"><path d="M4 20 H370 M345 4 L378 20 L345 36" fill="none" stroke="var(--acc)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="460" stroke-dashoffset="0"/></svg>`,
        js: [
          fromTo(`${sel} .badge`, { autoAlpha: 0, scale: 0.2, rotation: -40 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2.2)" }, a),
          revealWords(skin.reveal, `${sel} .head`, a + 0.1),
          fromTo(`${sel} .arrow`, { autoAlpha: 1 }, { autoAlpha: 1, duration: 0.01 }, a),
          fromTo(`${sel} .arrow path`, { strokeDashoffset: 460 }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, a + 0.45),
          kwPulse(sel, b),
        ].join("\n"),
      };
    }
  }
}

// Typography's signature: the spoken words themselves become giant cards that cut on the beat.
export function kineticCards(b: Beat, skin: Skin): Out {
  const F = fsz(skin);
  const words = b.words.length ? b.words : [{ word: b.scene.headline, start: b.start, end: b.end }];
  const groups: { text: string; start: number; end: number }[] = [];
  let cur: typeof words = [];
  const flush = () => {
    if (!cur.length) return;
    groups.push({ text: cur.map((w) => w.word).join(" "), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 2 || /[.!?,;]$/.test(w.word) || cur.map((x) => x.word).join(" ").length > 16) flush();
  }
  flush();
  const sel = `#s${b.i}`;
  const kw = clean(b.keyword);
  const moves = ["up", "snap", "left", "stretch", "down", "spin"];
  const html = groups
    .map((g, k) => {
      const hot = kw && g.text.split(" ").some((x) => clean(x) === kw);
      const size = F(g.text, 270, 150);
      return `<div class="kc kc${k}${hot ? " hot" : ""}" style="font-size:${size}px"><span>${esc(g.text.replace(/[.,;!?]+$/g, ""))}</span></div>`;
    })
    .join("");
  const js = groups
    .map((g, k) => {
      const at = Math.max(b.start - 0.1, g.start - 0.04);
      const next = groups[k + 1];
      const end = next ? Math.max(at + 0.25, next.start - 0.04) : b.end + 0.05;
      const sel2 = `${sel} .kc${k}`;
      const m = moves[(b.i + k) % moves.length];
      const from =
        m === "up" ? { yPercent: 120 } : m === "down" ? { yPercent: -120 } : m === "left" ? { xPercent: -130 } : m === "snap" ? { scale: 2.6, autoAlpha: 0 } : m === "stretch" ? { scaleX: 3, autoAlpha: 0 } : { rotation: -14, scale: 0.4, autoAlpha: 0 };
      const toV = { yPercent: 0, xPercent: 0, scale: 1, scaleX: 1, rotation: 0, autoAlpha: 1, duration: 0.22, ease: "power4.out" };
      return [
        set(sel2, { autoAlpha: 0 }, 0),
        set(sel2, { autoAlpha: 1 }, at),
        fromTo(`${sel2} span`, from, toV, at),
        set(sel2, { autoAlpha: 0 }, end),
      ].join("\n");
    })
    .join("\n");
  return { html: `<div class="kwrap">${html}</div>`, js };
}
