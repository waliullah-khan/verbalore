export type Beat = { label: "Hook" | "Body" | "CTA"; text: string; seconds: number };

export type Script = {
  method: string;
  beats: Beat[];
  totalSeconds: number;
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
