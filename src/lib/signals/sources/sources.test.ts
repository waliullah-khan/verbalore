import { test } from "node:test";
import assert from "node:assert/strict";
import { entityMatches, filingFound } from "./sec";
import { boardFromHtml, jobFound, mapJobs, notOnCareersPage, sameCompany, slugCandidates, type Board, type Job } from "./jobs";
import { meaningfulAdditions } from "./site";
import { orgIsTheCompany, repoFound } from "./github";

const NOW = Date.parse("2026-10-29T12:00:00Z");

test("a filing only counts when the filer is the company itself", () => {
  assert.equal(entityMatches("Supabase, Inc.  (CIK 0001829334)", "Supabase"), true);
  assert.equal(entityMatches("FREEPORT-MCMORAN INC  (FCX)  (CIK 0000831259)", "Ramp"), false);
  assert.equal(entityMatches("Clay Point Investors SPV 14, LP a Series of Clay Point Investors, LP  (CIK 0002)", "Clay"), false);
  assert.equal(entityMatches("Clay Technologies, Inc.", "Clay"), true);
});

test("a Form D becomes a filing signal with a link to the filing", () => {
  const f = filingFound(
    { _source: { ciks: ["0001829334"], display_names: ["Supabase, Inc.  (CIK 0001829334)"], form: "D/A", file_date: "2026-09-22", adsh: "0001829334-26-000003" } },
    { id: "a", name: "Supabase", domain: "supabase.com" },
    NOW
  )!;
  assert.equal(f.source, "sec");
  assert.equal(f.kind, "filing");
  assert.ok(f.headline.includes("Form D") && f.headline.includes("amendment"));
  assert.ok(f.url.includes("/edgar/data/1829334/000182933426000003/"));
  assert.equal(f.dedupeKey, "0001829334-26-000003");
});

test("a filing by someone else is ignored", () => {
  assert.equal(filingFound({ _source: { ciks: ["1"], display_names: ["MongoDB, Inc."], form: "8-K", file_date: "2026-09-29", adsh: "x-1" } }, { id: "a", name: "Vercel", domain: null }, NOW), null);
});

test("every applicant system is mapped to the same job shape", () => {
  assert.deepEqual(mapJobs("ashby", { jobs: [{ title: " Account Executive ", jobUrl: "u1", publishedAt: "2026-10-01", team: "Sales" }, { title: "Hidden", isListed: false, jobUrl: "u2" }] }), [
    { title: "Account Executive", url: "u1", publishedAt: "2026-10-01", team: "Sales" },
  ]);
  assert.equal(mapJobs("greenhouse", { jobs: [{ title: "SDR", absolute_url: "g1", first_published: "2026-10-02" }] })[0].url, "g1");
  assert.equal(mapJobs("lever", [{ text: "VP Sales", hostedUrl: "l1", createdAt: 1_790_000_000_000, categories: { team: "Sales" } }])[0].team, "Sales");
  assert.equal(mapJobs("workable", { jobs: [{ title: "Marketer", url: "w1", published_on: "2026-10-03", department: "Marketing" }] })[0].url, "w1");
  assert.equal(mapJobs("recruitee", { offers: [{ position: "AE", careers_url: "r1" }] })[0].title, "AE");
  assert.deepEqual(mapJobs("ashby", null), []);
});

test("a board is found from a link on the company's own site", () => {
  assert.deepEqual(boardFromHtml('<a href="https://jobs.ashbyhq.com/claylabs">Jobs</a>'), { provider: "ashby", token: "claylabs" });
  assert.deepEqual(boardFromHtml("https://job-boards.greenhouse.io/vercel/jobs/1"), { provider: "greenhouse", token: "vercel" });
  assert.equal(boardFromHtml("<p>no links here</p>"), null);
});

test("two companies with the same name are told apart by whose board it is", () => {
  assert.equal(sameCompany("Clay", { id: "a", name: "Clay", domain: "clay.com" }), true);
  assert.equal(sameCompany("Ramp Network", { id: "a", name: "Ramp", domain: "ramp.com" }), true);
  assert.equal(sameCompany("Verastem", { id: "a", name: "Ramp", domain: "ramp.com" }), false);
});

test("slug guesses start from the domain", () => {
  const s = slugCandidates({ id: "a", name: "Clay Labs", domain: "clay.com" });
  assert.equal(s[0], "clay");
  assert.ok(s.includes("claylabs") && s.includes("clay-labs"));
});

const board: Board = { provider: "ashby", token: "acme" };
const job = (title: string, days = 5): Job => ({ title, url: `https://j/${title.replace(/\W+/g, "-")}`, publishedAt: new Date(NOW - days * 86_400_000).toISOString(), team: "" });

test("a cluster of sales roles and a leadership role each become a signal", () => {
  const jobs = [job("Account Executive"), job("SDR"), job("Marketing Manager"), job("Head of Sales"), job("Backend Engineer")];
  const f = jobFound(board, jobs, NOW);
  assert.ok(f.some((x) => x.headline.startsWith("Hiring 4 go-to-market roles")));
  assert.ok(f.some((x) => x.headline === "Hiring a Head of Sales"));
  assert.ok(f.every((x) => x.source === "jobs"));
});

test("roles on the board but not on the careers page are surfaced only when the page lists jobs", () => {
  const jobs = [job("Account Executive"), job("SDR"), job("Backend Engineer"), job("Head of Growth"), job("Designer")];
  const listing = "<li>Account Executive</li><li>SDR</li><li>Backend Engineer</li><li>Designer</li>";
  assert.deepEqual(notOnCareersPage(jobs, listing).map((j) => j.title), ["Head of Growth"]);
  assert.deepEqual(notOnCareersPage(jobs, "<div id='embed'></div>"), []); // the page does not list jobs, so no claim is made
  assert.deepEqual(notOnCareersPage(jobs.slice(0, 2), listing), []);
  const f = jobFound(board, jobs, NOW, listing);
  assert.ok(f.some((x) => x.headline.includes("not on the careers page")));
});

test("only real additions are kept from a page diff", () => {
  const diff = ["--- a", "+++ b", "-old line here that went away", "+Pricing now starts at $29 per seat for teams", "+Home", "+Log in", "+Pricing now starts at $29 per seat for teams", "+short"].join("\n");
  assert.deepEqual(meaningfulAdditions(diff), ["Pricing now starts at $29 per seat for teams"]);
});

test("a guessed GitHub organisation must point back at the company", () => {
  assert.equal(orgIsTheCompany({ login: "clay", blog: "https://www.clay.com" }, { id: "a", name: "Clay", domain: "clay.com" }), true);
  assert.equal(orgIsTheCompany({ login: "clay", blog: "https://someone-else.dev", name: "Clay Pottery" }, { id: "a", name: "Clay", domain: "clay.com" }), false);
});

test("only recent original repos count as a launch", () => {
  const base = { name: "r", html_url: "https://github.com/o/r", description: "d", archived: false };
  assert.ok(repoFound({ ...base, created_at: new Date(NOW - 10 * 86_400_000).toISOString(), fork: false }, NOW));
  assert.equal(repoFound({ ...base, created_at: new Date(NOW - 10 * 86_400_000).toISOString(), fork: true }, NOW), null);
  assert.equal(repoFound({ ...base, created_at: new Date(NOW - 90 * 86_400_000).toISOString(), fork: false }, NOW), null);
});

import { worthReporting } from "./site";

const home = { path: "", what: "its homepage messaging", kind: "home" as const, urgency: 0.62 };
const pricing = { path: "/pricing", what: "its pricing page", kind: "pricing" as const, urgency: 0.78 };
const diff = (...lines: string[]) => lines.map((l) => `+${l}`).join("\n");

test("the page noise that fooled the first version is rejected", () => {
  // each of these was reported as a "change" before the filters existed
  assert.deepEqual(meaningfulAdditions(diff("Stuck? Troubleshoothttps://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/f/av0/rch/77fa6")), []);
  assert.deepEqual(meaningfulAdditions(diff("didier3:24 PM · andreas3:24 PM")), []);
  assert.deepEqual(meaningfulAdditions(diff("Get Notion freehttps://www.notion.com/signup?from=marketing&pathname=%2F")), []);
  assert.deepEqual(meaningfulAdditions(diff("US corporate payments processed by Ramp:0123456789.0123456789012345678901234567890123456789%0.9569009%")), []);
  assert.deepEqual(meaningfulAdditions(diff("⎿ search-call-recordings-by-metadata")), []);
  assert.deepEqual(meaningfulAdditions(diff("Chili Deanonymization Iframe")), []);
});

test("a pricing change must actually mention pricing", () => {
  assert.equal(worthReporting(pricing, meaningfulAdditions(diff("The Pro plan now costs $29 per seat per month, billed annually"))), true);
  assert.equal(worthReporting(pricing, meaningfulAdditions(diff("Our customers love working with our friendly support team"))), false);
});

test("a homepage needs two real lines, so one rotating example is not a change", () => {
  const one = meaningfulAdditions(diff("Create a vendor onboarding tracker that flags incomplete submissions for review"));
  assert.equal(worthReporting(home, one), false);
  const two = meaningfulAdditions(diff("Build internal tools in minutes with the new AI assistant", "Now available for every team on the Business plan"));
  assert.equal(worthReporting(home, two), true);
});

test("a profile repo is not a launch", () => {
  const base = { html_url: "https://github.com/o/.github", description: "", created_at: new Date(NOW - 5 * 86_400_000).toISOString(), fork: false, archived: false };
  assert.equal(repoFound({ ...base, name: ".github" }, NOW), null);
  assert.ok(repoFound({ ...base, name: "real-project" }, NOW));
});
