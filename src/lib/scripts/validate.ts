// What a script has to be before it is allowed to leave the writer. These checks run in code, so a model that
// hands back thirty seconds of text cannot get it through.

export type ScriptKind = "idea" | "signal" | "note";

export type Targets = { minWords: number; maxWords: number; minBeats: number; maxBeats: number; label: string };

export const TARGETS: Record<ScriptKind, Targets> = {
  idea: { minWords: 150, maxWords: 215, minBeats: 7, maxBeats: 11, label: "60 to 75 seconds spoken, 150 to 200 words" },
  signal: { minWords: 150, maxWords: 215, minBeats: 7, maxBeats: 11, label: "60 to 70 seconds spoken, 150 to 200 words" },
  note: { minWords: 110, maxWords: 165, minBeats: 6, maxBeats: 10, label: "45 to 60 seconds spoken, 110 to 150 words" },
};

export type DraftBeat = { label?: string; text: string };
export type Draft = { method?: string; hook: string; beats: DraftBeat[]; cta: string };

export type IssueCode = "empty" | "short" | "long" | "few-beats" | "many-beats" | "long-beat" | "hook" | "cta" | "filler" | "numbers" | "dupe";
export type Issue = { code: IssueCode; detail: string };

export const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
export const sentenceCount = (t: string) => (t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).filter((s) => s.trim()).length;
export const draftWords = (d: Draft) => words(d.hook) + d.beats.reduce((a, b) => a + words(b.text), 0) + words(d.cta);
export const beatCount = (d: Draft) => d.beats.length + 2;

const FILLER: RegExp[] = [
  /game[- ]?chang/i, /revolution/i, /\bunlock(s|ing)?\b/i, /fast[- ]paced/i, /let'?s dive/i, /buckle up/i, /supercharg/i,
  /skyrocket/i, /\b10x\b/i, /secret sauce/i, /you won'?t believe/i, /in today'?s (world|landscape|market|age)/i,
  /at the end of the day/i, /it'?s no secret/i, /thought leader/i, /\bleverag(e|es|ing)\b/i, /\bsynerg/i,
  /next level/i, /like and subscribe/i, /smash (that|the)/i, /\bhey guys\b/i, /what'?s up (guys|everyone)/i, /\bgroundbreaking\b/i,
  /\bcutting[- ]edge\b/i, /\bseamless(ly)?\b/i, /\bdelve\b/i,
];
const BAD_OPENER = /^(in this video|today i|today we|hey|hi everyone|welcome|so today|what'?s up)/i;
const EMOJI = /\p{Extended_Pictographic}/u;

// every figure the script quotes has to exist in what the writer was given
const NUM = /\d[\d,]*(?:\.\d+)?\s?(?:[kKmMbB]\b)?/g;
const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

function values(text: string): number[] {
  const out: number[] = [];
  for (const raw of text.match(NUM) ?? []) {
    const t = raw.trim();
    const suffix = /[kKmMbB]$/.test(t) ? SUFFIX[t.slice(-1).toLowerCase()] : 1;
    const n = Number(t.replace(/[,kKmMbB\s]/g, ""));
    if (Number.isFinite(n)) out.push(n * suffix);
  }
  return out;
}

export function ungroundedNumbers(text: string, sources: string[], extra: number[] = []): string[] {
  const known = new Set<number>([0, ...extra]);
  for (const s of sources) for (const v of values(s)) known.add(v);
  // a figure such as "4.2" may also appear in the sources as "4.2%" or "$4.2"; values() already ignores those marks
  const bad: string[] = [];
  for (const raw of text.match(NUM) ?? []) {
    const t = raw.trim();
    const suffix = /[kKmMbB]$/.test(t) ? SUFFIX[t.slice(-1).toLowerCase()] : 1;
    const n = Number(t.replace(/[,kKmMbB\s]/g, "")) * suffix;
    if (!Number.isFinite(n)) continue;
    const ok = known.has(n) || Array.from(known).some((k) => Math.abs(k - n) <= 1e-9 * Math.max(1, Math.abs(k)));
    if (!ok) bad.push(t);
  }
  return Array.from(new Set(bad));
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function validateDraft(d: Draft, t: Targets, sources: string[], extraNumbers: number[] = []): Issue[] {
  const issues: Issue[] = [];
  const all = [d.hook, ...d.beats.map((b) => b.text), d.cta];
  if (!d.hook?.trim() || !d.cta?.trim() || d.beats.length === 0 || all.some((x) => !x || !x.trim())) {
    return [{ code: "empty", detail: "the script is missing its hook, its call to action, or some beats" }];
  }

  const w = draftWords(d);
  if (w < t.minWords) issues.push({ code: "short", detail: `you wrote ${w} words and it needs at least ${t.minWords}` });
  if (w > t.maxWords) issues.push({ code: "long", detail: `you wrote ${w} words and it must stay under ${t.maxWords}` });
  const b = beatCount(d);
  if (b < t.minBeats) issues.push({ code: "few-beats", detail: `it has ${b} beats and needs at least ${t.minBeats} (hook, ${t.minBeats - 2} or more body beats, call to action)` });
  if (b > t.maxBeats) issues.push({ code: "many-beats", detail: `it has ${b} beats and must have at most ${t.maxBeats}` });

  d.beats.forEach((beat, i) => {
    if (words(beat.text) > 45 || sentenceCount(beat.text) > 3) {
      issues.push({ code: "long-beat", detail: `body beat ${i + 1} is too long to say in one breath: split it, one to three short sentences each` });
    }
  });

  if (words(d.hook) > 18) issues.push({ code: "hook", detail: `the hook is ${words(d.hook)} words and must be 18 or fewer, result first` });
  else if (BAD_OPENER.test(d.hook.trim())) issues.push({ code: "hook", detail: "the hook opens with a greeting or 'today we'; open with the result or the surprising fact instead" });
  if (sentenceCount(d.cta) > 2) issues.push({ code: "cta", detail: "the call to action must be one or two sentences" });

  const text = all.join(" ");
  const hits = FILLER.map((r) => text.match(r)?.[0]).filter(Boolean) as string[];
  if (hits.length) issues.push({ code: "filler", detail: `remove the hype or filler wording: ${Array.from(new Set(hits.map((h) => h.toLowerCase()))).join(", ")}` });
  if (EMOJI.test(text)) issues.push({ code: "filler", detail: "remove the emojis" });

  const bad = ungroundedNumbers(text, sources, extraNumbers);
  if (bad.length) issues.push({ code: "numbers", detail: `these figures are not in the sources, so remove or replace them with sourced ones: ${bad.join(", ")}` });

  const seen = new Set<string>();
  for (const x of all) {
    const k = norm(x);
    if (k.length > 12 && seen.has(k)) { issues.push({ code: "dupe", detail: "two beats say the same thing" }); break; }
    seen.add(k);
  }
  return issues;
}

// A small slip can be fixed by the fast model; anything about length, structure or facts goes back to the large one.
export const isTiny = (issues: Issue[]) => issues.length > 0 && issues.every((i) => i.code === "hook" || i.code === "filler" || i.code === "long-beat" || i.code === "cta" || i.code === "dupe");

// the order a candidate is judged in when no draft passes cleanly
export function score(issues: Issue[]): number {
  const weight: Record<IssueCode, number> = { empty: 100, short: 8, long: 3, "few-beats": 6, "many-beats": 2, "long-beat": 1, hook: 1, cta: 1, filler: 2, numbers: 7, dupe: 2 };
  return issues.reduce((a, i) => a + weight[i.code], 0);
}

export function repairInstruction(issues: Issue[], d: Draft, t: Targets): string {
  const lines = issues.map((i) => `- ${i.detail}`);
  const need = [
    issues.some((i) => i.code === "short" || i.code === "few-beats")
      ? `Build it out instead of padding it: give each body beat one concrete detail, example, number or consequence from the sources, and add the missing beats (a setup, a proof, a turn). Target ${t.label}.`
      : "",
    "Change only what is wrong. Keep the hook, the facts and the parts that already work.",
  ].filter(Boolean);
  return `Your draft (${draftWords(d)} words, ${beatCount(d)} beats) has these problems:\n${lines.join("\n")}\n\n${need.join("\n")}\nReturn the complete corrected script as JSON in the same shape.`;
}
