import { test } from "node:test";
import assert from "node:assert/strict";
import { badges, boss, BOSS_HP, hitPower, hitsOf, slainEver, type Activity } from "./game";

const DAY = 86_400_000;
const noon = (d: number) => d * DAY + 12 * 3_600_000;
const none: Activity = { videoTimes: [], templates: [], renderMs: [], published: 0, notesSent: 0, noteViews: 0, ideas: 0, accounts: 0 };

test("a hit is the idea's strength times the streak multiplier for that day", () => {
  assert.equal(hitPower("common", 1), 100);
  assert.equal(hitPower("epic", 1), 180);
  assert.equal(hitPower("rare", 14), 270);
  const hits = hitsOf({ ...none, videoTimes: [noon(1), noon(2)], videoScores: [90, 90] });
  assert.deepEqual(hits.map((h) => h.dmg), [180, Math.round(180 * (1 + 1 / 13))]);
});

test("the boss only counts the last seven days and shows what is left", () => {
  const a = { ...none, videoTimes: [noon(80), noon(99), noon(100)], videoScores: [90, 10, 10] };
  const b = boss(a, noon(100));
  assert.equal(b.hits.length, 2);
  assert.equal(b.dealt, 100 + Math.round(100 * (1 + 1 / 13)));
  assert.equal(b.left, BOSS_HP - b.dealt);
  assert.equal(b.slain, false);
  assert.equal(b.killedAt, null);
});

test("enough strong videos in a week slay it, and the kill is remembered as one moment", () => {
  const days = [1, 2, 3, 4, 5];
  const a = { ...none, videoTimes: days.map(noon), videoScores: days.map(() => 95) };
  const b = boss(a, noon(5));
  assert.equal(b.slain, true);
  assert.equal(b.left, 0);
  assert.ok(b.killedAt && days.map(noon).includes(b.killedAt));
  assert.equal(slainEver(a), true);
  assert.equal(badges(a, noon(5)).find((x) => x.id === "page-turner")!.have, 1);
});

test("weak or sparse videos never slay it", () => {
  const a = { ...none, videoTimes: [noon(1), noon(20), noon(40)], videoScores: [95, 95, 95] };
  assert.equal(slainEver(a), false);
  assert.equal(boss(none).slain, false);
  assert.equal(badges(none).find((x) => x.id === "page-turner")!.have, 0);
});
