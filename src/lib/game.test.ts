import { test } from "node:test";
import assert from "node:assert/strict";
import { badges, level, multiplier, streaks, thisWeek, xpOf, type Activity } from "./game";

const DAY = 86_400_000;
const noon = (d: number) => d * DAY + 12 * 3_600_000;
const none: Activity = { videoTimes: [], templates: [], renderMs: [], published: 0, notesSent: 0, noteViews: 0, ideas: 0, accounts: 0 };

test("a streak counts consecutive days and survives until today ends", () => {
  const now = noon(100);
  assert.deepEqual(streaks([noon(98), noon(99), noon(100)], now), { current: 3, longest: 3, postedToday: true });
  assert.equal(streaks([noon(97), noon(98), noon(99)], now).current, 3); // today not posted yet
  assert.equal(streaks([noon(90), noon(91)], now).current, 0); // broken
  assert.equal(streaks([noon(90), noon(91), noon(92), noon(95)], now).longest, 3);
  assert.equal(streaks([noon(100), noon(100) + 1000], now).current, 1); // two videos in a day are one day
  assert.equal(streaks([], now).current, 0);
});

test("the multiplier climbs from 1 to 2 over two weeks and holds", () => {
  assert.equal(multiplier(1), 1);
  assert.equal(multiplier(14), 2);
  assert.equal(multiplier(60), 2);
});

test("experience comes only from real events", () => {
  assert.equal(xpOf(none), 0);
  assert.equal(xpOf({ ...none, videoTimes: [noon(1)] }), 100);
  assert.equal(xpOf({ ...none, videoTimes: [noon(1), noon(2)] }), 100 + Math.round(100 * multiplier(2)));
  assert.equal(xpOf({ ...none, videoTimes: [noon(1), noon(1) + 5, noon(1) + 9] }), 160); // extra videos pay a little
  assert.equal(xpOf({ ...none, published: 2, notesSent: 1, noteViews: 1 }), 40 + 40 + 25);
});

test("levels advance with experience", () => {
  assert.equal(level(0).n, 1);
  assert.equal(level(260).n, 2);
  assert.ok(level(300).frac > 0 && level(300).frac < 1);
});

test("badges unlock from counts and show progress when locked", () => {
  const a: Activity = { ...none, videoTimes: [noon(1), noon(2), noon(3)], templates: ["kinetic", "editorial", "product"], renderMs: [90_000, 400_000, 0] };
  const b = Object.fromEntries(badges(a, noon(3)).map((x) => [x.id, x]));
  assert.ok(b.spark.have >= b.spark.need);
  assert.ok(b["first-take"].have >= 1);
  assert.ok(b["clean-cut"].have >= 1);
  assert.equal(b.collector.have, 3);
  assert.ok(b.collector.have < b.collector.need);
  assert.ok(b.kindling.have < b.kindling.need);
  assert.equal(b.sniper.have, 0);
});

test("the week count covers the last seven days only", () => {
  assert.equal(thisWeek([noon(100), noon(95), noon(90)], noon(100)), 2);
});
