import { serviceClient } from "../src/lib/supabase/service";
import { generateIdeas, saveIdeas } from "../src/lib/ideas/generate";

async function main() {
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("*").eq("is_demo", true).single();
  const t0 = Date.now();
  const { ideas, notes } = await generateIdeas(db, ws, 5);
  console.log(`${ideas.length} ideas in ${Math.round((Date.now() - t0) / 1000)}s`, notes);
  for (const i of ideas) console.log("-", i.score, i.hook.slice(0, 100), "|", i.reference?.platform, i.reference?.viaJev);
  if (process.argv[2] === "save") console.log("saved", (await saveIdeas(db, ws.id, ideas)).length);
}
main().catch((e) => { console.error(e); process.exit(1); });
