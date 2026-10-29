import { completeJson } from "../llm";

export const MIN_WORDS = 120;

type Body = { hook: string; body: string[]; cta: string };

export const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
export const draftWords = (d: Body) => words(d.hook) + d.body.reduce((a, b) => a + words(b), 0) + words(d.cta);

// A model asked for a minute of script often hands back thirty seconds. Short ones are sent back once
// with the sources and told to build the argument out, using only what the sources say.
export async function ensureLength<T extends Body>(d: T, sources: string[]): Promise<T> {
  if (draftWords(d) >= MIN_WORDS) return d;
  try {
    const out = await completeJson<Body>([
      {
        role: "system",
        content:
          `Rewrite this video script so it runs about a minute spoken: 140 to 170 words. Keep the hook. Keep every claim. Build it out with five to seven body beats of two short sentences each: ` +
          `name the specific detail, number or example from the SOURCES, say why it matters to the viewer, and show what to do about it. Add nothing that is not in the SOURCES or the script. ` +
          `Plain words, no hype, no emojis. Reply JSON {"hook":"","body":["",""],"cta":""}.`,
      },
      { role: "user", content: `SCRIPT:\n${[d.hook, ...d.body, d.cta].join("\n")}\n\nSOURCES:\n${sources.join("\n---\n").slice(0, 5000)}` },
    ]);
    if (out.hook && Array.isArray(out.body) && out.cta && draftWords(out) > draftWords(d)) return { ...d, hook: out.hook, body: out.body, cta: out.cta };
  } catch {
    // the short script is still a usable script
  }
  return d;
}
