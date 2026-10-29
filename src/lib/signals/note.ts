import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJson } from "../llm";
import { buildScript, type Script } from "../ideas/types";

type Input = {
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

const first = (name: string) => name.split(/\s+/)[0];

export function templateNote(i: Input, proof: string): Script {
  const reason = REASON[i.signal.kind] ?? i.signal.headline.replace(/[.!?]$/, "").toLowerCase();
  const hook = `${first(i.contact.name)}, I saw that ${i.account.name} ${reason}.`;
  const body = [
    `Teams at that stage usually hit the same wall: more accounts to reach and the same number of reps.`,
    i.workspace.offer.replace(/\s+/g, " "),
    proof,
  ].filter(Boolean);
  return buildScript("Video note", hook, body.slice(0, 3), "Worth a short look next week? Just reply to this note.");
}

export async function writeNoteScript(db: SupabaseClient, i: Input): Promise<Script> {
  const { data: docs } = await db.from("vl_brain_docs").select("title,content").eq("workspace_id", i.workspace.id).or("use_case.is.null,use_case.eq.gtm");
  const proof = (docs ?? []).find((d) => /proof/i.test(d.title))?.content.split(/(?<=\.)\s/)[0] ?? "";
  if (!process.env.OPENROUTER_API_KEY) return templateNote(i, proof);

  try {
    const brain = (docs ?? []).map((d) => `# ${d.title}\n${d.content}`).join("\n\n").slice(0, 4000);
    const out = await completeJson<{ hook: string; body: string[]; cta: string }>([
      {
        role: "system",
        content:
          `You write a personal 30 second video note from a salesperson at ${i.workspace.name} to one person. ` +
          "Open with the specific change at their company, said plainly, using their first name. Then one line on why it matters to someone in their role, " +
          "one line connecting it to what we do (use only facts from the notes), and one low-pressure question as the ending. " +
          'No flattery, no hype, no emojis, no invented numbers. Reply JSON: {"hook":"","body":["",""],"cta":""}.',
      },
      {
        role: "user",
        content: `NOTES:\n${brain}\n\nPERSON: ${i.contact.name}, ${i.contact.title ?? "unknown role"} at ${i.account.name}\nSIGNAL (${i.signal.kind}): ${i.signal.headline}. ${i.signal.summary}`,
      },
    ]);
    if (out.hook && out.body?.length && out.cta) return buildScript("Video note", out.hook, out.body.slice(0, 3), out.cta);
  } catch {
    // fall back to the template
  }
  return templateNote(i, proof);
}
