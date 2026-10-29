import { austinFound, austinPosts, loadAustin } from "../src/lib/signals/sources/austin";

async function main() {
  const t0 = Date.now();
  const d = await loadAustin();
  console.log(`loaded in ${Date.now() - t0}ms: ${d.newRes.n} new homes (prior ${d.newRes.priorN}), ${d.demo.n} teardowns (prior ${d.demo.priorN}), ${d.large.length} large projects, ${d.builders.length} builders`);
  for (const f of austinFound(d)) console.log(`- [${f.kind}] u=${f.urgency} ${f.headline}\n    ${f.summary.slice(0, 170)}\n    ${f.url}${f.meta ? "  meta=" + JSON.stringify(f.meta) : ""}`);
  console.log(`\n${austinPosts(d).length} evidence posts for the Real estate ideas`);
}
main().catch((e) => { console.error(e); process.exit(1); });
