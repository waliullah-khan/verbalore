import type { WriterInput } from "./types";
import { draftWords, beatCount, words, type Draft, type DraftBeat, type Targets } from "./validate";

// When the model is down or will not produce a script that passes, this builds one from the sources themselves so
// that a script is never short. It is plainer than a written one, but every fact in it comes straight from the sources.

const NOISE = /(cookie|subscribe|sign up|sign in|log in|privacy policy|terms of|all rights reserved|read more|click here|share this|follow us|advertisement|link in bio|call now|\bDM\b|#\w+|@\w+)/i;
// a post's own first person is its author's, not the speaker's
const FIRST_PERSON = /^(i|i'm|i’m|i've|i’ve|i'll|i’ll|i am|we|we're|we’re|we've|my|our)\b/i;
const STOP = new Set("the and for with that this from your you are our their have has how what when why who will into about more than just like over".split(" "));

export function clean(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // a short link label ("Read more") is page furniture; a long one is part of the sentence
    .replace(/\[([^\]]*)\]\([^)]*\)/g, (_m, t: string) => (t.trim().split(/\s+/).length > 3 ? t : " "))
    .replace(/^#{1,6}\s.*$/gm, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[#>*\-•\s]+/gm, "")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const terms = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)));
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// the sentences a script may be built from, best first
export function sentencePool(input: WriterInput): string[] {
  const focus = terms(`${input.hook ?? ""} ${input.angle ?? ""}`);
  // the hook is already said, so its own sentence is never used again as a beat
  const seen = new Set<string>(input.hook ? [key(clean(input.hook))] : []);
  const out: { s: string; rank: number }[] = [];
  const own = new Set([input.brain ?? "", input.context ?? ""]);
  for (const raw of [...input.evidence, input.brain ?? "", input.context ?? ""]) {
    for (let s of clean(raw).split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)) {
      s = s.trim();
      const n = words(s);
      if (n < 5 || n > 32 || NOISE.test(s)) continue;
      // first person is only the speaker's when it comes from the speaker's own notes
      if (!own.has(raw) && FIRST_PERSON.test(s)) continue;
      if (s.replace(/[^A-Z]/g, "").length > s.length * 0.5) continue;
      const k = key(s);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const overlap = Array.from(terms(s)).filter((t) => focus.has(t)).length;
      out.push({ s, rank: (/\d/.test(s) ? 3 : 0) + Math.min(overlap, 4) + (n >= 9 && n <= 24 ? 1 : 0) });
    }
  }
  return out.sort((a, b) => b.rank - a.rank).map((x) => x.s);
}

const BRIDGES = ["Start with this.", "Here's the detail that matters.", "Then it gets more specific.", "And here's the part people skip.", "Look at it this way.", "Here's what that looks like."];
const LABELS = ["Setup", "Detail", "Proof", "Detail", "Example", "Stakes", "Detail", "Proof"];
const PAD = [
  "Here's why that matters. If you ignore it, you're guessing.",
  "You can check every one of these points yourself in a few minutes, so don't just take my word for it.",
  "Ask yourself which of these points applies to you right now.",
  "Keep that in mind the next time you're deciding where to put your time.",
  "Write down the one thing you'll do about it this week.",
];

export function shortHook(text: string, max = 18): string {
  const t = clean(text).replace(/[.!?]+$/, "");
  const parts = t.split(/[,:;—-]\s/);
  let h = parts[0];
  if (words(h) < 4 && parts.length > 1) h = `${parts[0]}, ${parts[1]}`;
  const w = h.split(/\s+/);
  if (w.length > max) h = w.slice(0, max).join(" ");
  return h.trim() + ".";
}

const firstName = (name: string) => name.trim().split(/\s+/)[0];

function defaultCta(i: WriterInput): string {
  if (i.cta) return i.cta;
  if (i.kind === "note") return "Worth a quick look next week? Just reply to this note and I'll send the details.";
  if (i.kind === "signal") return "If you want to know what this means for your own plans, message me. I'll walk you through it.";
  return "If this was useful, follow for one more play like it tomorrow.";
}

// the closing idea before the call to action
function turn(i: WriterInput): DraftBeat {
  if (i.kind === "note" && i.person) return { label: "Turn", text: `${firstName(i.person.name)}, that's why I thought of you. Here's the part I'd want to talk through.` };
  return { label: "Turn", text: "So what do you do with that? Check it against your own situation before you act on it, and start with the point that surprised you most." };
}

export function fallbackDraft(input: WriterInput, t: Targets): Draft {
  const pool = sentencePool(input);
  const lead = input.hook?.trim() || pool.shift() || input.angle || "Here's what the sources say.";
  let hook = shortHook(lead);
  if (input.kind === "note" && input.person) {
    const who = firstName(input.person.name);
    hook = shortHook(`${who}, ${input.hook?.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()) ?? "I noticed a change at your company"}`);
  }
  const body: DraftBeat[] = [];
  let n = 0;
  // the first body beat sets the scene, the rest each carry one source sentence
  while (pool.length && body.length < t.maxBeats - 4 && (body.length + 3 < t.minBeats || draftWords({ hook, beats: body, cta: "x" }) < t.minWords - 25)) {
    const s = pool.shift() as string;
    body.push({ label: LABELS[n % LABELS.length], text: `${BRIDGES[n % BRIDGES.length]} ${s}` });
    n++;
  }
  const draft: Draft = { method: input.structure, hook, beats: [...body, turn(input)], cta: defaultCta(input) };
  return padDraft(draft, t);
}

// Add source sentences first, then plain framing lines, until the script meets its minimum. Never removes anything.
export function expandDraft(d: Draft, input: WriterInput, t: Targets): Draft {
  const used = new Set([d.hook, ...d.beats.map((b) => b.text), d.cta].map(key));
  const pool = sentencePool(input).filter((s) => !used.has(key(s)) && ![...used].some((u) => u.includes(key(s))));
  const beats = [...d.beats];
  // new material goes in before the closing beat so the call to action stays last
  let at = Math.max(1, beats.length - 1);
  let n = beats.length;
  while (pool.length && beats.length + 2 < t.maxBeats && (beatCount({ ...d, beats }) < t.minBeats || draftWords({ ...d, beats }) < t.minWords)) {
    beats.splice(at, 0, { label: LABELS[n % LABELS.length], text: `${BRIDGES[n % BRIDGES.length]} ${pool.shift()}` });
    at++;
    n++;
  }
  return padDraft({ ...d, beats }, t);
}

function padDraft(d: Draft, t: Targets): Draft {
  const beats = [...d.beats];
  let i = 0;
  while ((beatCount({ ...d, beats }) < t.minBeats || draftWords({ ...d, beats }) < t.minWords) && i < PAD.length * 2) {
    beats.splice(Math.max(1, beats.length - 1), 0, { label: "Detail", text: PAD[i % PAD.length] });
    i++;
  }
  return { ...d, beats };
}
