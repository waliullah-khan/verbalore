import { serviceClient } from "../src/lib/supabase/service";
import { generateIdeas } from "../src/lib/ideas/generate";
import { runWriteScript } from "../src/lib/scripts/job";
import type { Script } from "../src/lib/ideas/types";
import { words } from "../src/lib/scripts/validate";

// Writes real scripts through each path and prints them in full, so they can be read.
// usage: tsx scripts/try-scripts.ts [ideas|signal|note|all]
const which = process.argv[2] ?? "all";
const show = (title: string, s: Script) => {
  const total = s.beats.reduce((a, b) => a + words(b.text), 0);
  console.log(`\n===== ${title}\n${total} words, ${s.beats.length} beats, about ${s.totalSeconds} seconds, structure: ${s.method}`);
  s.beats.forEach((b, i) => console.log(`${String(i + 1).padStart(2)}. [${b.label}] ${b.text}`));
};

async function main() {
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("*").eq("is_demo", true).single();

  if (which === "ideas" || which === "all") {
    const t = Date.now();
    const { ideas, notes } = await generateIdeas(db, ws, 3, "gtm");
    console.log(`\n${ideas.length} daily ideas in ${Math.round((Date.now() - t) / 1000)}s`, notes.slice(0, 3));
    ideas.forEach((i, n) => show(`DAILY IDEA ${n + 1}: ${i.hook}`, i.script));
  }

  if (which === "signal" || which === "all") {
    const { data: sig } = await db.from("vl_signals").select("id,headline,summary,kind,account:vl_crm_accounts(name,source)").eq("workspace_id", ws.id).in("kind", ["permit", "market"]).limit(1).maybeSingle();
    if (sig) {
      const writing: Script = { method: "Local market update", beats: [], totalSeconds: 0, state: "writing" };
      const { data: idea } = await db.from("vl_ideas").insert({ workspace_id: ws.id, angle: sig.headline, hook: sig.headline, why_now: sig.summary, status: "signal", use_case: "real_estate", evidence: [], script: writing }).select("id").single();
      const t = Date.now();
      const out = await runWriteScript(db, { kind: "signal", ideaId: idea!.id, signalId: sig.id });
      const { data: after } = await db.from("vl_ideas").select("script").eq("id", idea!.id).single();
      console.log(`\nsignal job: ${JSON.stringify(out)} in ${Math.round((Date.now() - t) / 1000)}s`);
      show(`SIGNAL SCRIPT: ${sig.headline}`, after!.script as Script);
      await db.from("vl_ideas").delete().eq("id", idea!.id);
    } else console.log("no permit signal in the demo workspace");
  }

  if (which === "note" || which === "all") {
    const { data: sigs } = await db.from("vl_signals").select("id,headline,account_id").eq("workspace_id", ws.id).not("kind", "in", "(permit,market)").limit(40);
    let pick: { signal: { id: string; headline: string }; contact: { id: string; name: string } } | null = null;
    for (const s of sigs ?? []) {
      const { data: c } = await db.from("vl_crm_contacts").select("id,name").eq("account_id", s.account_id).limit(1).maybeSingle();
      if (c) { pick = { signal: s, contact: c }; break; }
    }
    if (pick) {
      const writing: Script = { method: "Video note", beats: [], totalSeconds: 0, state: "writing" };
      const { data: idea } = await db.from("vl_ideas").insert({ workspace_id: ws.id, angle: "test note", hook: pick.signal.headline, why_now: pick.signal.headline, status: "note", use_case: "gtm", evidence: [], script: writing }).select("id").single();
      const { data: note } = await db.from("vl_video_notes").insert({ workspace_id: ws.id, signal_id: pick.signal.id, contact_id: pick.contact.id, script: writing, idea_id: idea!.id }).select("id").single();
      const t = Date.now();
      const out = await runWriteScript(db, { kind: "note", ideaId: idea!.id, noteId: note!.id, signalId: pick.signal.id });
      const { data: after } = await db.from("vl_video_notes").select("script").eq("id", note!.id).single();
      console.log(`\nnote job: ${JSON.stringify(out)} in ${Math.round((Date.now() - t) / 1000)}s, for ${pick.contact.name}`);
      show(`VIDEO NOTE for ${pick.contact.name}: ${pick.signal.headline}`, after!.script as Script);
      await db.from("vl_video_notes").delete().eq("id", note!.id);
      await db.from("vl_ideas").delete().eq("id", idea!.id);
    } else console.log("no signal with a contact in the demo workspace");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
