// The first beat is always "Hook" and the last "CTA" (captions read them that way). The ones between carry the
// structure of the script: Setup, Stakes, Proof, Example, Turn and so on.
export type Beat = { label: string; text: string; seconds: number };

// A script that is still being written, or that could not be, has no beats yet and says so in state.
export type Script = {
  method: string;
  beats: Beat[];
  totalSeconds: number;
  state?: "writing" | "failed";
  error?: string;
  // what to queue again if the writing failed
  retry?: { kind: "signal" | "note"; signalId: string; noteId?: string };
};

export type Evidence = { url: string; title: string; platform: string; author: string; engagement: number; synthetic?: boolean };

export type Reference = Evidence & {
  why: string;
  viaJev: boolean;
  structure: { hook: string; body: string[]; cta: string };
};

export type Idea = {
  angle: string;
  hook: string;
  why_now: string;
  score: number;
  evidence: Evidence[];
  reference: Reference | null;
  script: Script;
};

export const WORDS_PER_SECOND = 2.6;

export function secondsFor(text: string): number {
  return Math.max(2, Math.round(text.trim().split(/\s+/).length / WORDS_PER_SECOND));
}

export function buildScript(method: string, hook: string, body: string[], cta: string): Script {
  const beats: Beat[] = [
    { label: "Hook", text: hook, seconds: secondsFor(hook) },
    ...body.map((t) => ({ label: "Body" as const, text: t, seconds: secondsFor(t) })),
    { label: "CTA", text: cta, seconds: secondsFor(cta) },
  ];
  return { method, beats, totalSeconds: beats.reduce((a, b) => a + b.seconds, 0) };
}

// A script whose middle beats keep the labels they were written with.
export function buildLabeledScript(method: string, hook: string, body: { label?: string; text: string }[], cta: string): Script {
  const beats: Beat[] = [
    { label: "Hook", text: hook, seconds: secondsFor(hook) },
    ...body.map((b) => ({ label: cleanLabel(b.label), text: b.text, seconds: secondsFor(b.text) })),
    { label: "CTA", text: cta, seconds: secondsFor(cta) },
  ];
  return { method, beats, totalSeconds: beats.reduce((a, b) => a + b.seconds, 0) };
}

export function cleanLabel(raw?: string): string {
  const t = (raw ?? "").replace(/[^A-Za-z0-9 -/]/g, "").trim().slice(0, 16);
  if (!t || /^(hook|cta)$/i.test(t)) return "Body";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// An edited script keeps the structure it had: when the number of beats is unchanged each beat keeps its label.
export function rebuildScript(prev: Script | null | undefined, texts: string[]): Script {
  const [hook, ...rest] = texts;
  const cta = rest.pop() as string;
  const before = prev?.beats ?? [];
  const sameShape = before.length === texts.length;
  const body = rest.map((text, i) => ({ text, label: sameShape ? before[i + 1]?.label : undefined }));
  return buildLabeledScript(prev?.method ?? "Direct", hook, body, cta);
}
