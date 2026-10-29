import type { Post } from "./types";

const DAY = 86_400_000;

// Engagement means different things on each network, so a post is scored against the
// other posts from its own platform before platforms are mixed.
export function scorePosts(posts: Post[], now = Date.now()): Post[] {
  const byPlatform = new Map<string, Post[]>();
  for (const p of posts) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);

  const out: Post[] = [];
  for (const group of Array.from(byPlatform.values())) {
    const logs = group.map((p) => Math.log1p(Math.max(0, p.engagement)));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    group.forEach((p, i) => {
      const eng = hi === lo ? 0.5 : (logs[i] - lo) / (hi - lo);
      const ageDays = p.postedAt ? Math.max(0, (now - Date.parse(p.postedAt)) / DAY) : 14;
      const recency = Math.exp(-ageDays / 14);
      out.push({ ...p, score: Number((0.7 * eng + 0.3 * recency).toFixed(4)) });
    });
  }
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function dedupe(posts: Post[]): Post[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    const key = p.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Keep the strongest posts but never let one platform crowd the rest out.
export function balance(posts: Post[], perPlatform = 4, total = 24): Post[] {
  const counts = new Map<string, number>();
  const picked: Post[] = [];
  for (const p of posts) {
    const n = counts.get(p.platform) ?? 0;
    if (n >= perPlatform) continue;
    counts.set(p.platform, n + 1);
    picked.push(p);
    if (picked.length >= total) break;
  }
  return picked;
}
