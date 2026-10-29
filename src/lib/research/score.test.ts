import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePosts, dedupe, balance } from "./score";
import type { Post } from "./types";

const base = (over: Partial<Post>): Post => ({
  id: "x", platform: "reddit", url: "https://a.com/1", author: "a", title: "t", text: "", engagement: 10,
  postedAt: new Date().toISOString(), kind: "post", ...over,
});

test("scores within each platform before mixing", () => {
  const posts = [
    base({ id: "r1", platform: "reddit", engagement: 5000 }),
    base({ id: "r2", platform: "reddit", engagement: 10 }),
    base({ id: "t1", platform: "tiktok", engagement: 2_000_000 }),
    base({ id: "t2", platform: "tiktok", engagement: 1000 }),
  ];
  const scored = scorePosts(posts);
  const top = scored.filter((p) => p.id === "r1" || p.id === "t1").map((p) => p.score!);
  assert.ok(Math.abs(top[0] - top[1]) < 0.01);
});

test("newer posts beat older ones at equal engagement", () => {
  const now = Date.now();
  const [a, b] = scorePosts(
    [
      base({ id: "old", engagement: 100, postedAt: new Date(now - 40 * 86_400_000).toISOString() }),
      base({ id: "new", engagement: 100, postedAt: new Date(now - 1 * 86_400_000).toISOString(), url: "https://a.com/2" }),
    ],
    now
  );
  assert.equal(a.id, "new");
  assert.equal(b.id, "old");
});

test("dedupe ignores query strings and trailing slashes", () => {
  const out = dedupe([base({ url: "https://a.com/1/?utm=1" }), base({ url: "https://a.com/1" })]);
  assert.equal(out.length, 1);
});

test("balance caps each platform", () => {
  const posts = Array.from({ length: 10 }, (_, i) => base({ id: String(i), url: `https://a.com/${i}` }));
  assert.equal(balance(posts, 3, 24).length, 3);
});
