import type { StudioPlatform } from "./platforms";

type Beat = { label?: string; text: string };
export type ScriptLike = { beats?: Beat[] } | null | undefined;

export function truncate(text: string, limit: number) {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).replace(/\s+\S*$/, "").trimEnd() + "…";
}

// Same rule as the design's "Make it shorter": keep the first two sentences.
export const shorten = (text: string) => text.split(/(?<=[.!?])\s/).slice(0, 2).join(" ");

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");

// A starting caption per platform, built only from the video's own script. With no script there is only the title.
export function defaultCaptions(title: string, script: ScriptLike, platforms: StudioPlatform[]): Record<string, string> {
  const beats = script?.beats ?? [];
  const hook = beats[0]?.text?.trim() || title;
  const cta = beats.length > 1 && /cta/i.test(beats[beats.length - 1].label ?? "") ? beats[beats.length - 1].text.trim() : "";
  const body = beats.filter((b, i) => i > 0 && !(cta && i === beats.length - 1)).map((b) => b.text.trim());

  const out: Record<string, string> = {};
  for (const p of platforms) {
    let text: string;
    if (p.id === "linkedin") text = [hook, body.slice(0, 2).join(" "), cta].filter(Boolean).join("\n\n");
    else if (p.id === "instagram") text = join(hook, cta);
    else if (p.id === "facebook") text = join(hook, body[0], cta);
    else text = hook;
    out[p.id] = truncate(text, p.limit);
  }
  return out;
}
