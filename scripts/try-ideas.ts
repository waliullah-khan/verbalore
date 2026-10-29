import { serviceClient } from "../src/lib/supabase/service";
import { generateIdeas, saveIdeas } from "../src/lib/ideas/generate";
import { isUseCase } from "../src/lib/usecases";

// usage: tsx scripts/try-ideas.ts [useCase] [save]
async function main() {
  const uc = isUseCase(process.argv[2]) ? process.argv[2] : "gtm";
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("*").eq("is_demo", true).single();
  const t0 = Date.now();
  const { ideas, notes, timings } = await generateIdeas(db, ws, 5, uc);
  console.log(`${ideas.length} ideas in ${Math.round((Date.now() - t0) / 1000)}s`, notes, JSON.stringify(timings));
  for (const i of ideas) {
    console.log(`\n[${i.score}] ${i.script.method} | ${i.script.totalSeconds}s | ref: ${i.reference?.platform} ${i.reference?.viaJev ? "(Jev)" : ""}`);
    console.log("  HOOK:", i.hook);
    i.script.beats.slice(1).forEach((b) => console.log(`  ${b.label}:`, b.text));
    console.log("  WHY:", i.why_now);
  }
  if (process.argv[3] === "save") console.log("\nsaved", (await saveIdeas(db, ws.id, ideas, uc)).length);
}
main().catch((e) => { console.error(e); process.exit(1); });
