import { collect } from "../src/lib/research/collectors";
import type { Platform } from "../src/lib/research/types";

async function main() {
  const topic = process.argv[2] ?? "video prospecting";
  const platforms = (process.argv[3] ?? "hn,reddit").split(",") as Platform[];
  for (const p of platforms) {
    const t0 = Date.now();
    const r = await collect(p, topic);
    console.log(p, r.usedFixture ? "FIXTURE" : "LIVE", r.posts.length, `${Date.now() - t0}ms`, r.error ?? "");
    console.log("  ", r.posts[0]?.title?.slice(0, 90), "|", r.posts[0]?.engagement);
  }
}
main();
