import { findSignals } from "../src/lib/signals/engine";

async function main() {
  const name = process.argv[2] ?? "Clay";
  const t0 = Date.now();
  const found = await findSignals({ id: "x", name, domain: null }, process.argv.slice(3));
  console.log(`${found.length} signals for ${name} in ${Math.round((Date.now() - t0) / 1000)}s`);
  for (const s of found) console.log(`- [${s.kind}] r=${s.relevance} u=${s.urgency} ${s.headline.slice(0, 90)}\n    ${s.url}`);
}
main();
