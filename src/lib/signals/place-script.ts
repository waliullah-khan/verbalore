import type { SupabaseClient } from "@supabase/supabase-js";
import { docsForUseCase } from "../brain/scope";
import type { Script } from "../ideas/types";
import { fallbackScript, writeScript } from "../scripts/writer";
import type { WriterInput } from "../scripts/types";

export type SignalInput = { workspaceId: string; signal: { headline: string; summary: string; kind: string }; place: string };

// A fact from a city's own records, made into a full video script for a local agent.
export async function signalWriterInput(db: SupabaseClient, i: SignalInput): Promise<WriterInput> {
  const { data } = await db.from("vl_brain_docs").select("title,content,use_case").eq("workspace_id", i.workspaceId);
  const brain = docsForUseCase(data ?? [], "real_estate").map((d) => `# ${d.title}\n${d.content}`).join("\n\n").slice(0, 4000);
  return {
    kind: "signal",
    structure: "Local market update",
    structureGuide: "Open with the fact in plain words. Say it comes from city permit records and quote the numbers. Explain what it means for buyers, then for sellers, then give one practical thing to do this week, then invite a message.",
    hook: i.signal.headline.replace(/[.]$/, "") + ".",
    angle: i.signal.headline,
    evidence: [`${i.signal.headline}. ${i.signal.summary}`],
    brain,
    audience: "People buying or selling a home in the area",
    place: i.place,
    context: `Source: ${i.place} city permit records.`,
  };
}

export async function writeSignalScript(db: SupabaseClient, i: SignalInput): Promise<Script> {
  const input = await signalWriterInput(db, i);
  if (!process.env.OPENROUTER_API_KEY) return fallbackScript(input);
  return (await writeScript(input)).script;
}
