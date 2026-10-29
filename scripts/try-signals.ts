import { scanAccount } from "../src/lib/signals/engine";
import { primarySignals } from "../src/lib/signals/sources";

// usage: tsx scripts/try-signals.ts "Supabase" supabase.com [primary]
// "primary" skips the news search and runs only the sources that read the record directly.
async function main() {
  const [name = "Clay", domain = "", mode] = process.argv.slice(2);
  const account = { id: "x", name, domain: domain || null };
  const t0 = Date.now();
  const r = mode === "primary" ? await primarySignals(account) : await scanAccount(account, []);
  console.log(`${r.found.length} signals for ${name} in ${Math.round((Date.now() - t0) / 1000)}s | board: ${JSON.stringify(r.board)} | notes: ${JSON.stringify(r.notes)}`);
  for (const s of r.found) console.log(`- [${s.source}/${s.kind}] r=${s.relevance} u=${s.urgency} ${s.headline.slice(0, 80)}\n    ${s.summary.slice(0, 150)}\n    ${s.url}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
