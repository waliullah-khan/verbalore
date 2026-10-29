import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJson } from "../llm";
import { docsForUseCase } from "../brain/scope";
import { buildScript, type Script } from "../ideas/types";

type Input = { workspaceId: string; signal: { headline: string; summary: string; kind: string }; place: string };

const first = (s: string) => s.split(/(?<=[.!?])\s/)[0]?.trim() ?? s;

// What the fact means is the part a viewer cannot get from the number itself.
const MEANING: Record<string, string> = {
  market: "When permits move like this, it shows up in listings and prices a few months later.",
  permit: "A project this size changes traffic, prices and demand on the streets around it.",
};

export function templateSignalScript(i: Input): Script {
  const body = [`This comes straight from the city's permit records for ${i.place}.`, first(i.signal.summary), MEANING[i.signal.kind] ?? ""].filter(Boolean);
  return buildScript("Local market update", i.signal.headline.replace(/[.]$/, "") + ".", body.slice(0, 3), "Message me if you want to know what this means for your street.");
}

export async function writeSignalScript(db: SupabaseClient, i: Input): Promise<Script> {
  if (!process.env.OPENROUTER_API_KEY) return templateSignalScript(i);
  try {
    const { data } = await db.from("vl_brain_docs").select("title,content,use_case").eq("workspace_id", i.workspaceId);
    const brain = docsForUseCase(data ?? [], "real_estate").map((d) => `# ${d.title}\n${d.content}`).join("\n\n").slice(0, 3000);
    const out = await completeJson<{ hook: string; body: string[]; cta: string }>([
      {
        role: "system",
        content:
          `You write a 30 to 40 second video script for a local real estate agent, built on one fact from ${i.place} city permit records. ` +
          "Open with the fact in plain words, quote its numbers exactly, say it comes from city permit records, then one practical takeaway for buyers or sellers, then an invitation to message. " +
          "Use only the fact given and the agent's notes. No hype, no emojis, no invented numbers. " +
          'Reply JSON: {"hook":"","body":["",""],"cta":""}.',
      },
      { role: "user", content: `AGENT NOTES:\n${brain}\n\nFACT: ${i.signal.headline}. ${i.signal.summary}` },
    ]);
    if (out.hook && out.body?.length && out.cta) return buildScript("Local market update", out.hook, out.body.slice(0, 3), out.cta);
  } catch {
    // fall back to the template
  }
  return templateSignalScript(i);
}
