import { completeJson } from "../llm";

type Msg = { role: "system" | "user" | "assistant"; content: string };
import { buildLabeledScript, type Script } from "../ideas/types";
import { expandDraft, fallbackDraft } from "./fallback";
import type { WriterInput } from "./types";
import {
  TARGETS, beatCount, draftWords, isTiny, repairInstruction, score, validateDraft, ungroundedNumbers,
  type Draft, type Issue, type Targets,
} from "./validate";

export { TARGETS } from "./validate";
export type { WriterInput } from "./types";

// The two models a script is written with. Tests hand in fakes.
export type Models = { large: (m: Msg[]) => Promise<unknown>; fast: (m: Msg[]) => Promise<unknown> };

export const defaultModels: Models = {
  large: (m) => completeJson<unknown>(m),
  fast: (m) => completeJson<unknown>(m, { fast: true }),
};

export type WriteResult = {
  script: Script;
  // model: first draft passed. repaired: passed after a fix. expanded: model draft topped up from the sources. fallback: built from the sources alone.
  via: "model" | "repaired" | "expanded" | "fallback";
  attempts: number;
  words: number;
  beats: number;
  issues: Issue[];
  // what went wrong along the way, for logs and for finding out why a script fell back
  notes: string[];
};

const RULES = [
  "You write a script that one person reads aloud to a camera, off a teleprompter. It is spoken, not written: contractions, short sentences, plain words.",
  "Use only facts that appear in SOURCES or NOTES. You may add reasoning, framing and plain advice, but never a new fact, name, number, customer, result or quote.",
  "Write a figure with digits only when it appears in the sources, exactly as it appears there. Spell out small counts (one to ten) as words.",
  "No hype or filler words (game-changer, unlock, supercharge, leverage, 'in today's world'), no emojis, no hashtags, no greetings, never 'in this video'.",
  "Never turn a story from a source into the speaker's own experience (\"I\", \"we\", \"a client of mine\") unless the NOTES say it happened to the speaker.",
];

function kindRules(i: WriterInput): string[] {
  if (i.kind === "signal") {
    return [
      `The fact comes from official city permit records${i.place ? ` for ${i.place}` : ""}. Say that it does, quote its numbers exactly, and say what it means for someone buying or selling.`,
      "Do not describe neighborhoods, commute times, schools or amenities, and do not place an address in a named area, unless a source says so.",
    ];
  }
  if (i.kind === "note") {
    const p = i.person;
    return [
      `This is a personal video note from a salesperson to ONE person${p ? `: ${p.name}${p.title ? `, ${p.title}` : ""}${p.company ? ` at ${p.company}` : ""}` : ""}. Use their first name in the hook.`,
      "Open with the specific change at their company, said plainly. Then why it matters to someone in their role, then how what we do connects to it (only facts from NOTES), then a low-pressure question as the ending.",
      "No flattery, no pressure, no pitch language. It should sound like a colleague who noticed something useful.",
    ];
  }
  return [];
}

export function systemPrompt(i: WriterInput, t: Targets): string {
  const lines = [
    ...RULES,
    ...kindRules(i),
    ...(i.rules ?? []),
    `Structure: ${i.structure}${i.structureGuide ? ` (${i.structureGuide})` : ""}. The structure must be visible in the labels of the body beats.`,
    `Length: ${t.label}. At least ${t.minBeats} beats in total.`,
    "Beat 1 is the hook: result first, 18 words or fewer. The last beat is the call to action: one or two sentences.",
    `Between them write ${t.minBeats - 2} to ${t.maxBeats - 2} body beats. Each is one to three short sentences and carries ONE concrete detail, example, number or consequence taken from the sources. Include a setup near the start and a turn near the end where the point lands.`,
    "Give each body beat a short label that names its job (Setup, Stakes, Proof, Example, Counterpoint, Turn, Takeaway).",
    i.voice ? `Their voice: ${i.voice}` : "",
    i.audience ? `Who it is for: ${i.audience}` : "",
    i.offer ? `What the speaker's business does: ${i.offer}` : "",
    'Reply with JSON only: {"method":"the structure name","hook":"","beats":[{"label":"","text":""}],"cta":""}.',
  ];
  return lines.filter(Boolean).join("\n");
}

function userPrompt(i: WriterInput): string {
  const sources = i.evidence.map((e, n) => `[${n + 1}] ${e.replace(/\s+/g, " ").slice(0, 900)}`).join("\n");
  return [
    `SOURCES:\n${sources || "(none)"}`,
    i.brain ? `NOTES:\n${i.brain.slice(0, 4000)}` : "",
    i.angle ? `ANGLE: ${i.angle}` : "",
    i.hook ? `HOOK TO IMPROVE ON: ${i.hook}` : "",
    i.context ? `CONTEXT: ${i.context}` : "",
  ].filter(Boolean).join("\n\n");
}

// The model sometimes answers in a slightly different shape; accept the reasonable ones.
export function parseDraft(raw: unknown): Draft | null {
  const o = raw as { method?: unknown; hook?: unknown; cta?: unknown; beats?: unknown; body?: unknown } | null;
  if (!o || typeof o !== "object") return null;
  const list = Array.isArray(o.beats) ? o.beats : Array.isArray(o.body) ? o.body : [];
  let hook = typeof o.hook === "string" ? o.hook.trim() : "";
  let cta = typeof o.cta === "string" ? o.cta.trim() : "";
  const beats: { label?: string; text: string }[] = [];
  for (const b of list) {
    const text = typeof b === "string" ? b : typeof (b as { text?: unknown })?.text === "string" ? (b as { text: string }).text : "";
    const label = typeof b === "object" && b ? String((b as { label?: unknown }).label ?? "") : "";
    if (!text.trim()) continue;
    if (!hook && /^hook$/i.test(label)) { hook = text.trim(); continue; }
    if (!cta && /^cta$/i.test(label)) { cta = text.trim(); continue; }
    if (/^hook$/i.test(label) && text.trim() === hook) continue;
    if (/^cta$/i.test(label) && text.trim() === cta) continue;
    beats.push({ label: label || undefined, text: text.trim() });
  }
  if (!hook && !cta && !beats.length) return null;
  return { method: typeof o.method === "string" ? o.method : undefined, hook, beats, cta };
}

const sourcesOf = (i: WriterInput) => [...i.evidence, i.brain ?? "", i.hook ?? "", i.angle ?? "", i.context ?? "", i.person ? `${i.person.name} ${i.person.title ?? ""} ${i.person.company ?? ""}` : "", i.place ?? ""];
const yearNumbers = () => [new Date().getFullYear()];

// dashes read badly off a teleprompter; a comma is how a person would say it
const tidy = (t: string) => t.replace(/\s*[—–]\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
const tidyDraft = (d: Draft): Draft => ({ ...d, hook: tidy(d.hook), cta: tidy(d.cta), beats: d.beats.map((b) => ({ ...b, text: tidy(b.text) })) });

function toResult(i: WriterInput, d0: Draft, via: WriteResult["via"], attempts: number, issues: Issue[], notes: string[] = []): WriteResult {
  const d = tidyDraft(d0);
  const script = buildLabeledScript(d.method || i.structure, d.hook, d.beats, d.cta);
  return { script, via, attempts, words: draftWords(d), beats: beatCount(d), issues, notes };
}

// Draft with the large model, check it, send it back with exact instructions up to twice, then top it up from the
// sources if it is still short. A script that is too short never comes out of this function.
export async function writeScript(input: WriterInput, models: Models = defaultModels, log: (m: string) => void = () => {}): Promise<WriteResult> {
  const t = TARGETS[input.kind];
  const sources = sourcesOf(input);
  const check = (d: Draft) => validateDraft(d, t, sources, yearNumbers());
  const system = systemPrompt(input, t);
  const base: Msg[] = [{ role: "system", content: system }, { role: "user", content: userPrompt(input) }];

  let best: { d: Draft; issues: Issue[] } | null = null;
  let attempts = 0;
  const notes: string[] = [];
  const note = (m: string) => { notes.push(m); log(m); };
  const consider = (d: Draft | null) => {
    if (!d) return null;
    const issues = check(d);
    if (!best || score(issues) < score(best.issues)) best = { d, issues };
    return { d, issues };
  };

  try {
    attempts++;
    let first: Draft | null = null;
    try {
      first = parseDraft(await models.large(base));
    } catch (err) {
      // the large model timed out or errored: the fast one gets a go before the sources-only builder does
      note(`large model failed: ${(err as Error).message.slice(0, 120)}`);
      attempts++;
      first = parseDraft(await models.fast(base));
    }
    let cur = consider(first);
    if (cur && !cur.issues.length) return toResult(input, cur.d, "model", attempts, [], notes);

    for (let round = 1; round <= 2 && cur; round++) {
      note(`repair ${round}: ${cur.issues.map((x) => x.code).join(", ")}`);
      const ask: Msg[] = [
        ...base,
        { role: "assistant", content: JSON.stringify({ method: cur.d.method, hook: cur.d.hook, beats: cur.d.beats, cta: cur.d.cta }) },
        { role: "user", content: repairInstruction(cur.issues, cur.d, t) },
      ];
      attempts++;
      const fixed = consider(parseDraft(await (isTiny(cur.issues) ? models.fast : models.large)(ask)));
      if (fixed && !fixed.issues.length) return toResult(input, fixed.d, "repaired", attempts, [], notes);
      if (fixed) cur = fixed;
    }
  } catch (err) {
    note(`model unavailable: ${(err as Error).message.slice(0, 120)}`);
  }

  const held = best as { d: Draft; issues: Issue[] } | null;
  if (!held) {
    const d = fallbackDraft(input, t);
    return toResult(input, d, "fallback", attempts, check(d), notes);
  }
  // keep what the model got right: drop beats with unsupported figures, then top up from the sources
  let d = held.d;
  if (held.issues.some((x) => x.code === "numbers")) {
    const keep = d.beats.filter((b) => !ungroundedNumbers(b.text, sources, yearNumbers()).length);
    d = { ...d, beats: keep.length ? keep : d.beats };
    if (ungroundedNumbers(d.hook, sources, yearNumbers()).length) d = { ...d, hook: fallbackDraft(input, t).hook };
    if (ungroundedNumbers(d.cta, sources, yearNumbers()).length) d = { ...d, cta: fallbackDraft(input, t).cta };
  }
  d = expandDraft(d, input, t);
  return toResult(input, d, "expanded", attempts, check(d), notes);
}

// A full script built only from the sources, for when no model is available at all.
export function fallbackScript(input: WriterInput): Script {
  return toResult(input, fallbackDraft(input, TARGETS[input.kind]), "fallback", 0, []).script;
}
