import { z } from "zod";
import { completeJson } from "../src/lib/llm";
import { playbook, type SceneType, type UseCaseId } from "../src/lib/usecases";

export type Word = { word: string; start: number; end: number };
export type { SceneType };

export const SCENE_TYPES = ["hook", "stat", "list", "quote", "tip", "cta", "code", "compare", "facts"] as const;

export type Scene = {
  type: SceneType;
  start: number;
  end: number;
  text: string;
  headline: string;
  sub?: string;
  stat?: string;
  items?: string[];
  code?: string[];
  compare?: { leftLabel: string; left: string; rightLabel: string; right: string };
  facts?: { value: string; label: string }[];
};

const MIN_SCENE = 3.5;
const MAX_SCENE = 8.5;
const sentenceEnd = /[.!?]$/;

// Group words into scenes at sentence ends, aiming for 4 to 8 seconds each.
export function segment(words: Word[], duration: number): { start: number; end: number; text: string }[] {
  if (!words.length) return [];
  const out: { start: number; end: number; text: string }[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.word).join(" ") });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const len = w.end - cur[0].start;
    if ((sentenceEnd.test(w.word) && len >= MIN_SCENE) || len >= MAX_SCENE) flush();
  }
  flush();
  if (out.length > 1 && out[out.length - 1].end - out[out.length - 1].start < 2.5) {
    const tail = out.pop()!;
    const prev = out[out.length - 1];
    prev.end = tail.end;
    prev.text += " " + tail.text;
  }
  // scenes run edge to edge so there is never a bare gap
  out.forEach((s, i) => {
    s.start = i === 0 ? 0 : out[i - 1].end;
    if (i === out.length - 1) s.end = duration;
  });
  return out;
}

const trim = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n).replace(/\s+\S*$/, "");
  return cut.replace(/[,;:]$/, "") + "…";
};
const firstSentence = (s: string) => s.split(/(?<=[.!?])\s/)[0] ?? s;

const NUMBER = /(\$\s?\d[\d,.]*\s?[kmb]?|\d[\d,.]*\s?(?:%|x|X|percent|times|k|K)|\b\d+\.\d+\b|\b\d{2,}\b)/;
// A number followed by a unit it carries itself (3 baths), or a number followed by a short label (42% growth).
const UNIT_FACT = /(\$?\d[\d,.]*)\s?(beds?|baths?|sq\s?ft|sqft|acres?|days|weeks|hours|minutes)\b/gi;
const LABEL_FACT = /(\$?\d[\d,.]*\s?(?:%|x|k|m)?)\s+([a-z][a-z' -]{2,24})/gi;

export function extractCode(text: string): string[] {
  const ticks = Array.from(text.matchAll(/`([^`]{2,60})`/g)).map((m) => m[1].trim());
  if (ticks.length) return ticks.slice(0, 5);
  const calls = Array.from(text.matchAll(/\b[a-zA-Z_.]+\([^)]{0,30}\)/g)).map((m) => m[0]);
  const cmds = Array.from(text.matchAll(/\b(?:npm|npx|git|pnpm|yarn|docker|curl)\s+[a-z0-9@./:-]+(?:\s+[a-z0-9@./:-]+){0,3}/gi)).map((m) => m[0]);
  return Array.from(new Set([...cmds, ...calls])).slice(0, 5);
}

export function splitCompare(text: string): Scene["compare"] | null {
  const clean = firstSentence(text).replace(/[.!?]$/, "");
  const patterns: [RegExp, (m: RegExpMatchArray) => [string, string]][] = [
    [/^(.{6,60}?)\s+instead of\s+(.{4,60})$/i, (m) => [m[2], m[1]]],
    [/^(.{6,60}?)\s+rather than\s+(.{4,60})$/i, (m) => [m[2], m[1]]],
    [/^(.{4,60}?)\s+(?:vs\.?|versus)\s+(.{4,60})$/i, (m) => [m[1], m[2]]],
    [/\bnot\s+(.{3,50}?),\s*(?:but\s+)?(.{4,60})$/i, (m) => [m[1], m[2]]],
    [/\bbefore\b[:,]?\s*(.{4,60}?)[,;]\s*after\b[:,]?\s*(.{4,60})$/i, (m) => [m[1], m[2]]],
  ];
  for (const [re, pick] of patterns) {
    const m = clean.match(re);
    if (m) {
      const [left, right] = pick(m);
      return { leftLabel: "Before", left: trim(left, 46), rightLabel: "After", right: trim(right, 46) };
    }
  }
  return null;
}

export function extractFacts(text: string): { value: string; label: string }[] {
  const found: { at: number; value: string; label: string }[] = [];
  const taken: [number, number][] = [];
  for (const m of text.matchAll(UNIT_FACT)) {
    const at = m.index ?? 0;
    found.push({ at, value: m[1].replace(/\s+/g, ""), label: m[2].toLowerCase().replace(/\s+/g, "") });
    taken.push([at, at + m[0].length]);
  }
  for (const m of text.matchAll(LABEL_FACT)) {
    const at = m.index ?? 0;
    if (taken.some(([x, y]) => at >= x && at < y)) continue;
    const label = m[2].trim().split(/\s+/).slice(0, 3).join(" ");
    if (/^(and|the|that|from|with|for|over|more|than|per|of|to|in|on)\b/i.test(label)) continue;
    found.push({ at, value: m[1].replace(/\s+/g, ""), label });
  }
  return found.sort((x, y) => x.at - y.at).slice(0, 4).map(({ value, label }) => ({ value, label }));
}

// Deterministic classification used when no model is available or its answer fails validation.
export function heuristicScene(
  raw: { start: number; end: number; text: string },
  index: number,
  total: number,
  prefer: SceneType[] = ["stat", "list", "quote", "tip"]
): Scene {
  const { text } = raw;
  const base = { start: raw.start, end: raw.end, text };
  if (index === 0) return { ...base, type: "hook", headline: trim(firstSentence(text), 70) };
  if (index === total - 1 && total > 1) return { ...base, type: "cta", headline: trim(firstSentence(text), 60), sub: "Follow for more" };

  const head = trim(firstSentence(text).replace(/`/g, ""), 70);
  if (prefer.includes("code")) {
    const code = extractCode(text);
    if (code.length) return { ...base, type: "code", headline: head, code };
  }
  if (prefer.includes("compare")) {
    const compare = splitCompare(text);
    if (compare) return { ...base, type: "compare", headline: head, compare };
  }
  if (prefer.includes("facts")) {
    const facts = extractFacts(text);
    if (facts.length >= 2) return { ...base, type: "facts", headline: head, facts };
  }
  const num = text.match(NUMBER);
  if (num) return { ...base, type: "stat", stat: num[0].replace(/\s+/g, "").replace(/percent/i, "%"), headline: head };
  const parts = text.split(/,|\band\b|;/).map((p) => p.trim()).filter((p) => p.split(" ").length >= 2 && p.split(" ").length <= 8);
  if (parts.length >= 3 || /\b(first|second|third|step)\b/i.test(text)) {
    return { ...base, type: "list", headline: trim(firstSentence(text), 50), items: parts.slice(0, 3).map((p) => trim(p, 40)) };
  }
  return { ...base, type: index % 2 ? "quote" : "tip", headline: head };
}

const modelScene = z.object({
  type: z.enum(SCENE_TYPES),
  headline: z.string().min(2).max(90),
  sub: z.string().max(80).optional(),
  stat: z.string().max(12).optional(),
  items: z.array(z.string().max(44)).min(2).max(4).optional(),
  code: z.array(z.string().max(48)).min(1).max(6).optional(),
  compare: z.object({ leftLabel: z.string().max(14), left: z.string().max(60), rightLabel: z.string().max(14), right: z.string().max(60) }).optional(),
  facts: z.array(z.object({ value: z.string().max(12), label: z.string().max(24) })).min(2).max(4).optional(),
});

// A scene is only valid if it carries what its graphic needs.
export function validScene(s: Scene): boolean {
  switch (s.type) {
    case "stat": return !!s.stat;
    case "list": return !!s.items && s.items.length >= 2;
    case "code": return !!s.code && s.code.length >= 1;
    case "compare": return !!s.compare?.left && !!s.compare?.right;
    case "facts": return !!s.facts && s.facts.length >= 2;
    default: return !!s.headline;
  }
}

export async function planScenes(words: Word[], duration: number, useCase: UseCaseId = "general"): Promise<{ scenes: Scene[]; via: "model" | "heuristic" }> {
  const segs = segment(words, duration);
  const prefer = playbook(useCase).scenes;
  const fallback = () => segs.map((s, i) => heuristicScene(s, i, segs.length, prefer));

  if (!process.env.OPENROUTER_API_KEY || segs.length < 2) return { scenes: fallback(), via: "heuristic" };
  try {
    const out = await completeJson<{ scenes: unknown[] }>(
      [
        {
          role: "system",
          content:
            'You turn spoken video segments into on-screen graphics. For each segment return {"type","headline","sub","stat","items","code","compare","facts"}. ' +
            "Types: hook (first segment, a punchy claim under 8 words), cta (last segment), " +
            "stat (a real number is said; stat is that number like 3.4x or 40%), list (2 to 4 items under 6 words each), " +
            "quote (a line worth reading), tip (one clear instruction), " +
            "code (code or commands are mentioned; code is up to 5 short lines), " +
            'compare (two states are contrasted; compare is {"leftLabel","left","rightLabel","right"}), ' +
            'facts (2 to 4 numbers with labels; facts is [{"value","label"}], e.g. 3 beds). ' +
            `This video is for: ${playbook(useCase).label}. Prefer these graphics when the words support them: ${prefer.join(", ")}. ` +
            'Headlines are under 9 words. Use only words and numbers from the segment. Reply {"scenes":[...]} with one entry per segment, in order.',
        },
        { role: "user", content: segs.map((s, i) => `${i + 1}. ${s.text}`).join("\n") },
      ],
      { fast: true }
    );
    const scenes = segs.map((seg, i) => {
      const parsed = modelScene.safeParse(out.scenes?.[i]);
      const h = heuristicScene(seg, i, segs.length, prefer);
      if (!parsed.success) return h;
      const candidate: Scene = { ...parsed.data, start: seg.start, end: seg.end, text: seg.text };
      return validScene(candidate) ? candidate : h;
    });
    return { scenes, via: "model" };
  } catch {
    return { scenes: fallback(), via: "heuristic" };
  }
}

// Build word timings from script text when no transcript exists: spread by word length across the take.
export function wordsFromText(text: string, duration: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => Math.max(2, t.replace(/[^\w]/g, "").length) + (sentenceEnd.test(t) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return tokens.map((word, i) => {
    const start = t;
    t += (weights[i] / total) * duration;
    return { word, start: Number(start.toFixed(2)), end: Number(t.toFixed(2)) };
  });
}
