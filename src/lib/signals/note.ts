import type { SupabaseClient } from "@supabase/supabase-js";
import type { Script } from "../ideas/types";
import { fallbackScript, writeScript } from "../scripts/writer";
import type { WriterInput } from "../scripts/types";

export type NoteInput = {
  workspace: { id: string; name: string; offer: string };
  account: { name: string };
  contact: { name: string; title: string | null };
  signal: { kind: string; headline: string; summary: string };
};

const REASON: Record<string, string> = {
  funding: "just announced new funding",
  leadership: "made a leadership change",
  launch: "launched something new",
  hiring: "is hiring on the go-to-market side",
};

export function noteWriterInput(i: NoteInput, brain: string): WriterInput {
  const reason = REASON[i.signal.kind] ?? i.signal.headline.replace(/[.!?]$/, "").toLowerCase();
  return {
    kind: "note",
    structure: "Video note",
    structureGuide: "Name the change at their company. Say why it matters to someone in their role. Connect it to what we do, using only the notes. End with one low-pressure question.",
    hook: `I saw that ${i.account.name} ${reason}.`,
    angle: i.signal.headline,
    evidence: [`${i.signal.headline}. ${i.signal.summary}`],
    brain,
    offer: i.workspace.offer,
    person: { name: i.contact.name, title: i.contact.title, company: i.account.name },
    context: `The speaker works at ${i.workspace.name}. Their offer: ${i.workspace.offer}`,
  };
}

async function brainFor(db: SupabaseClient, workspaceId: string) {
  const { data: docs } = await db.from("vl_brain_docs").select("title,content").eq("workspace_id", workspaceId).or("use_case.is.null,use_case.eq.gtm");
  return (docs ?? []).map((d) => `# ${d.title}\n${d.content}`).join("\n\n").slice(0, 4000);
}

// the version built from the sources alone, for when no model is available
export function templateNote(i: NoteInput, brain: string): Script {
  return fallbackScript(noteWriterInput(i, brain));
}

export async function noteInputFor(db: SupabaseClient, i: NoteInput): Promise<WriterInput> {
  return noteWriterInput(i, await brainFor(db, i.workspace.id));
}

export async function writeNoteScript(db: SupabaseClient, i: NoteInput): Promise<Script> {
  const input = await noteInputFor(db, i);
  if (!process.env.OPENROUTER_API_KEY) return fallbackScript(input);
  return (await writeScript(input)).script;
}
