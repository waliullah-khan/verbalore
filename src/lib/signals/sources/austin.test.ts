import { test } from "node:test";
import assert from "node:assert/strict";
import { austinFound, austinPosts, cleanBuilder, dedupeProjects, permitLink, siteName, type AustinData } from "./austin";

const NOW = Date.parse("2026-10-29T12:00:00Z");

const data: AustinData = {
  windowDays: 30,
  newRes: { n: 300, units: 248, priorN: 246 },
  topNewZips: [{ zip: "78704", n: 43, units: 26 }, { zip: "78741", n: 21, units: 21 }],
  demo: { n: 54, priorN: 53 },
  topDemoZips: [{ zip: "78704", n: 13, units: 0 }],
  large: [{ address: "6400 FM 969 RD BLDG 1", units: 176, builder: "Skybeck Construction, LLC", link: "https://abc.austintexas.gov/p/1", description: "New multifamily development.", issued: "2026-10-20T00:00:00.000" }],
  builders: [{ name: "Meritage Homes Corp", n: 11, units: 11 }],
};

test("the portal's applicant marker is not part of a builder's name", () => {
  assert.equal(cleanBuilder("Joseph Design Build**MAIN***"), "Joseph Design Build");
  assert.equal(cleanBuilder("Paradisa Homes, LLC***MAIN***"), "Paradisa Homes, LLC");
  assert.equal(cleanBuilder("**"), null);
});

test("the permit link is read whether it arrives as an object, a JSON string or a URL", () => {
  assert.equal(permitLink({ url: "https://x.gov/p" }), "https://x.gov/p");
  assert.equal(permitLink('{"url":"https://x.gov/p"}'), "https://x.gov/p");
  assert.equal(permitLink("https://x.gov/p"), "https://x.gov/p");
  assert.equal(permitLink(null), null);
  assert.equal(permitLink("not a link"), null);
});

test("several permits at one address are one project, and a building number is not part of the name", () => {
  const p = (address: string, units: number) => ({ address, units, builder: null, link: null, description: "", issued: "" });
  const out = dedupeProjects([p("8801 MC CANN DR", 90), p("8801 MC CANN DR", 90), p("6400 FM 969 RD BLDG 1", 176), p("6400 FM 969 RD BLDG 2", 60)]);
  assert.equal(out.length, 2);
  assert.equal(out[0].units, 176);
  assert.equal(siteName("6400 FM 969 RD BLDG 1"), "6400 FM 969 RD");
  assert.equal(siteName("8801 MC CANN DR"), "8801 MC CANN DR");
});

test("market, project and builder signals are built from the city's numbers", () => {
  const f = austinFound(data, NOW);
  const trend = f.find((x) => x.headline.includes("new-home permits"))!;
  assert.ok(trend.headline.includes("300") && trend.headline.includes("+22%"));
  assert.ok(trend.summary.includes("78704 (43)"));
  const project = f.find((x) => x.headline.includes("176-unit"))!;
  assert.equal(project.headline, "176-unit project permitted at 6400 FM 969 RD");
  assert.equal(project.url, "https://abc.austintexas.gov/p/1");
  assert.equal(project.meta?.builder, "Skybeck Construction, LLC");
  assert.ok(!project.summary.includes(".."));
  const builder = f.find((x) => x.headline.startsWith("Meritage"))!;
  assert.equal(builder.meta?.builder, "Meritage Homes Corp");
  assert.ok(f.every((x) => x.source === "permits"));
});

test("the same signal gets the same key next time, so it is not stored twice", () => {
  const a = austinFound(data, NOW).map((x) => x.dedupeKey);
  const b = austinFound(data, NOW + 86_400_000).map((x) => x.dedupeKey);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test("a quiet month does not invent a signal", () => {
  const quiet: AustinData = { ...data, newRes: { n: 0, units: 0, priorN: 0 }, demo: { n: 0, priorN: 0 }, large: [], builders: [] };
  assert.deepEqual(austinFound(quiet, NOW), []);
});

test("local facts become evidence the Real estate ideas can quote, ranked by size", () => {
  const posts = austinPosts(data, NOW);
  assert.ok(posts.length >= 2);
  assert.ok(posts.every((p) => p.platform === "permits" && p.author === "City of Austin"));
  assert.ok(!posts.some((p) => p.title.startsWith("Meritage")));
  assert.equal(posts.find((p) => p.title.includes("new-home permits"))!.engagement, 300);
});
