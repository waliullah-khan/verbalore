import type { SupabaseClient } from "@supabase/supabase-js";
import type { Script } from "../ideas/types";
import { noteInputFor } from "../signals/note";
import { signalWriterInput } from "../signals/place-script";
import { fallbackScript, writeScript } from "./writer";
import type { WriterInput } from "./types";

export type WriteScriptPayload = { kind: "signal" | "note"; ideaId: string; noteId?: string; signalId: string };

const failed = (message: string, retry?: Script["retry"]): Script => ({ method: "", beats: [], totalSeconds: 0, state: "failed", error: message.slice(0, 300), retry });

// Marks the idea (and the note, if there is one) as failed, so the page says so instead of waiting forever.
export async function markScriptFailed(db: SupabaseClient, p: { ideaId?: string; noteId?: string; kind?: "signal" | "note"; signalId?: string }, message: string) {
  const script = failed(message, p.kind && p.signalId ? { kind: p.kind, signalId: p.signalId, noteId: p.noteId } : undefined);
  if (p.ideaId) await db.from("vl_ideas").update({ script }).eq("id", p.ideaId);
  if (p.noteId) await db.from("vl_video_notes").update({ script }).eq("id", p.noteId);
}

// Writes the script for a signal or a video note that was created a moment ago with an empty one.
export async function runWriteScript(db: SupabaseClient, p: WriteScriptPayload) {
  try {
    let input: WriterInput;
    if (p.kind === "note") {
      const { data: note } = await db
        .from("vl_video_notes")
        .select("workspace_id, contact:vl_crm_contacts(name,title), signal:vl_signals(kind,headline,summary, account:vl_crm_accounts(name))")
        .eq("id", p.noteId as string)
        .single();
      if (!note) throw new Error("note not found");
      const { data: ws } = await db.from("vl_workspaces").select("id,name,offer").eq("id", note.workspace_id).single();
      const contact = note.contact as unknown as { name: string; title: string | null };
      const signal = note.signal as unknown as { kind: string; headline: string; summary: string; account: { name: string } };
      input = await noteInputFor(db, {
        workspace: { id: ws!.id, name: ws!.name, offer: ws!.offer },
        account: { name: signal.account.name },
        contact,
        signal: { kind: signal.kind, headline: signal.headline, summary: signal.summary },
      });
    } else {
      const { data: s } = await db.from("vl_signals").select("workspace_id,headline,summary,kind, account:vl_crm_accounts(name)").eq("id", p.signalId).single();
      if (!s) throw new Error("signal not found");
      const account = s.account as unknown as { name: string };
      input = await signalWriterInput(db, { workspaceId: s.workspace_id, signal: { headline: s.headline, summary: s.summary, kind: s.kind }, place: account.name });
    }

    const out = process.env.OPENROUTER_API_KEY ? await writeScript(input) : null;
    const script = out?.script ?? fallbackScript(input);
    await db.from("vl_ideas").update({ script, hook: script.beats[0].text }).eq("id", p.ideaId);
    if (p.noteId) await db.from("vl_video_notes").update({ script }).eq("id", p.noteId);
    return { kind: p.kind, via: out?.via ?? "fallback", words: out?.words ?? null, beats: script.beats.length, seconds: script.totalSeconds };
  } catch (err) {
    await markScriptFailed(db, p, (err as Error).message);
    throw err;
  }
}
