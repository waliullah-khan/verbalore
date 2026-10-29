import { mkdirSync, writeFileSync } from "node:fs";
import { serviceClient } from "../src/lib/supabase/service";
import { docsForUseCase } from "../src/lib/brain/scope";
import { playbook, profileFor, type UseCaseId } from "../src/lib/usecases";
import type { Script } from "../src/lib/ideas/types";
import { runWriteScript } from "../src/lib/scripts/job";
import { writeScript } from "../src/lib/scripts/writer";
import type { WriterInput } from "../src/lib/scripts/types";
import { TARGETS, words } from "../src/lib/scripts/validate";

// Rewrites every script that is too short to be a script, from the idea's own sources and the workspace's notes.
// Safe to run twice: scripts that are already long enough are skipped. The old text is saved under reference/ first.
// usage: tsx scripts/rewrite-scripts.ts [--dry] [--limit N]
const dry = process.argv.includes("--dry");
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const MIN = 120;

type Row = {
  id: string; workspace_id: string; angle: string; hook: string | null; why_now: string; status: string; use_case: string;
  evidence: { title: string; platform: string; author: string }[] | null; reference: { structure?: { hook?: string; body?: string[]; cta?: string } } | null;
  script: Script | null;
};

const wordsIn = (s: Script | null) => (s?.beats ?? []).reduce((a, b) => a + words(b.text), 0);

async function main() {
  const db = await serviceClient();
  const { data: rows, error } = await db.from("vl_ideas").select("id,workspace_id,angle,hook,why_now,status,use_case,evidence,reference,script").order("created_at");
  if (error) throw error;
  const todo = ((rows ?? []) as Row[]).filter((r) => !r.script?.state && wordsIn(r.script) < MIN).slice(0, limit);
  console.log(`${(rows ?? []).length} ideas, ${todo.length} need a proper script${dry ? " (dry run: nothing will be saved)" : ""}`);

  mkdirSync("reference", { recursive: true });
  const backup = todo.map((r) => ({ id: r.id, status: r.status, hook: r.hook, script: r.script }));
  if (!dry) writeFileSync(`reference/script-backup-${Date.now()}.json`, JSON.stringify(backup, null, 1));

  const { data: workspaces } = await db.from("vl_workspaces").select("id,name,niche,offer,icp");
  const ws = new Map((workspaces ?? []).map((w) => [w.id, w]));
  const { data: docs } = await db.from("vl_brain_docs").select("workspace_id,title,content,use_case");
  const docsOf = (id: string) => (docs ?? []).filter((d) => d.workspace_id === id);

  const report: { id: string; kind: string; before: number; after: number; via: string; beats: number }[] = [];
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const r = todo[next++];
      const before = wordsIn(r.script);
      try {
        if (r.status === "note") {
          const { data: note } = await db.from("vl_video_notes").select("id,signal_id").eq("idea_id", r.id).maybeSingle();
          if (note && !dry) {
            const out = await runWriteScript(db, { kind: "note", ideaId: r.id, noteId: note.id, signalId: note.signal_id });
            report.push({ id: r.id, kind: "note", before, after: Math.round((out.seconds as number) * 2.6), via: String(out.via), beats: Number(out.beats) });
            console.log(`note   ${r.id.slice(0, 8)}  ${before} -> ~${Math.round((out.seconds as number) * 2.6)} words (${out.via})`);
            continue;
          }
        }
        const w = ws.get(r.workspace_id);
        const useCase = (r.use_case || "general") as UseCaseId;
        const profile = w ? profileFor(w as never, useCase) : { offer: "", icp: "", niche: "", topic: "" };
        const pb = playbook(useCase);
        const kind = r.status === "signal" ? "signal" : "idea";
        const brain = docsForUseCase(docsOf(r.workspace_id), useCase).map((d) => `# ${d.title}\n${d.content}`).join("\n\n").slice(0, 4000);
        const old = (r.script?.beats ?? []).map((b) => b.text).join(" ");
        const ref = r.reference?.structure;
        const format = pb.formats.find((f) => f.name.toLowerCase() === (r.script?.method ?? "").toLowerCase()) ?? pb.formats[0];
        const input: WriterInput = {
          kind,
          structure: kind === "signal" ? "Local market update" : format.name,
          structureGuide: kind === "signal" ? "Open with the fact in plain words. Say it comes from city permit records and quote the numbers. Explain what it means for buyers, then for sellers, then one practical thing to do this week, then invite a message." : format.pattern,
          hook: r.hook ?? undefined,
          angle: r.angle,
          // the first script was written from the posts themselves; its facts are the best sources left, with the idea's own titles
          evidence: [old, r.why_now, ...(r.evidence ?? []).map((e) => `${e.title} (${e.platform})`), ref ? [ref.hook, ...(ref.body ?? []), ref.cta].filter(Boolean).join(" ") : ""].filter(Boolean),
          brain, audience: profile.icp, offer: profile.offer,
          place: kind === "signal" ? r.evidence?.[0]?.author : undefined,
          context: kind === "signal" && r.evidence?.[0]?.author ? `Source: ${r.evidence[0].author} city permit records.` : undefined,
          rules: kind === "idea" ? ["Where a source describes someone else's story, tell it as theirs ('one team', 'a buyer'), never as the speaker's."] : undefined,
        };
        const out = await writeScript(input);
        report.push({ id: r.id, kind, before, after: out.words, via: out.via, beats: out.beats });
        console.log(`${kind.padEnd(6)} ${r.id.slice(0, 8)}  ${before} -> ${out.words} words, ${out.beats} beats (${out.via}${out.issues.length ? `, left: ${out.issues.map((i) => i.code).join("/")}` : ""})${out.notes.length ? `  [${out.notes.join("; ")}]` : ""}`);
        if (process.argv.includes("--show")) {
          console.log(`   OLD: ${old}`);
          out.script.beats.forEach((b) => console.log(`   ${b.label.padEnd(12)} ${b.text}`));
        }
        if (!dry) await db.from("vl_ideas").update({ script: out.script, hook: out.script.beats[0].text }).eq("id", r.id);
      } catch (e) {
        console.log(`FAILED ${r.id.slice(0, 8)}: ${(e as Error).message}`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  // what is in the database now
  const { data: after } = await db.from("vl_ideas").select("status,script");
  const sizes = (after ?? []).map((r) => ({ status: r.status as string, w: wordsIn(r.script as Script | null) })).filter((x) => x.w > 0);
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const ideasOnly = sizes.filter((x) => x.status !== "note" && x.status !== "signal").map((x) => x.w);
  console.log(`\nrewritten: ${report.length}. by route: ${JSON.stringify(report.reduce<Record<string, number>>((a, r) => ({ ...a, [r.via]: (a[r.via] ?? 0) + 1 }), {}))}`);
  console.log(`all scripts now: ${sizes.length}, min ${Math.min(...sizes.map((x) => x.w))}, median ${med(sizes.map((x) => x.w))}, max ${Math.max(...sizes.map((x) => x.w))}`);
  console.log(`daily ideas now: ${ideasOnly.length}, min ${Math.min(...ideasOnly)}, median ${med(ideasOnly)}`);
  console.log(`minimum asked of an idea: ${TARGETS.idea.minWords} words`);
}
main().catch((e) => { console.error(e); process.exit(1); });
