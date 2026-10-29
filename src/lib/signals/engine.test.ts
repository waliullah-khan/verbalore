import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyHeuristic, isGeneric, mentions, queriesFor, signalHash } from "./engine";

test("classifies the four buying triggers", () => {
  assert.equal(classifyHeuristic("Clay raises $100M Series C"), "funding");
  assert.equal(classifyHeuristic("Ramp appoints new Chief Revenue Officer"), "leadership");
  assert.equal(classifyHeuristic("Linear launches a new insights product"), "launch");
  assert.equal(classifyHeuristic("Vercel is hiring 12 sales roles"), "hiring");
  assert.equal(classifyHeuristic("A quiet Tuesday at the office"), null);
});

test("hash ignores scheme, www, query and trailing slash", () => {
  const a = signalHash("acc1", "funding", "https://www.example.com/news/x/?utm=1");
  const b = signalHash("acc1", "funding", "http://example.com/news/x");
  assert.equal(a, b);
  assert.notEqual(a, signalHash("acc2", "funding", "http://example.com/news/x"));
});

test("a result must mention the company", () => {
  assert.equal(mentions("Clay raises money", "clay"), true);
  assert.equal(mentions("Another startup raises money", "Clay"), false);
  assert.equal(mentions("Ramp reaches $60B on a linear path", "Linear"), true);
  assert.equal(mentions("Claymore Capital raises a fund", "Clay"), false);
});

test("watch phrases become extra queries", () => {
  const q = queriesFor({ id: "1", name: "Attio", domain: null }, ["raised a seed round"]);
  assert.equal(q.length, 5);
  assert.ok(q[4].q.includes("raised a seed round"));
});

test("profile pages and explainers are not signals", () => {
  assert.equal(isGeneric("Clay", "https://tracxn.com/d/companies/clay"), true);
  assert.equal(isGeneric("What Is Clay? How It Works", "https://example.com/a"), true);
  assert.equal(isGeneric("Clay valued at $7.1 billion in new funding round", "https://news.example.com/a"), false);
});

test("review, comparison and database pages are filtered", () => {
  assert.equal(isGeneric("Attio CRM Review: Is It Right for You?", "https://x.com/a"), true);
  assert.equal(isGeneric("Attio vs Startup Fundraising: Honest Comparison", "https://x.com/a"), true);
  assert.equal(isGeneric("Vercel Funding Rounds & Investors", "https://x.com/a"), true);
  assert.equal(isGeneric("Supabase raises $150M in new funding", "https://x.com/a"), false);
});

import { looksLikePerson } from "./engine";

test("a person who shares the company's name is not a signal", () => {
  assert.equal(looksLikePerson("Tractor Beverage Co Appoints Clay Lichterman SVP of Sales", "Clay"), true);
  assert.equal(looksLikePerson("Clay raises $115M Series D", "Clay"), false);
  assert.equal(looksLikePerson("Clay Raises $115M at $7.1B", "Clay"), false);
  assert.equal(looksLikePerson("Clay Launches a new marketplace", "Clay"), false);
});

test("careers and company profile pages are filtered", () => {
  assert.equal(isGeneric("Attio Careers, Perks + Culture", "https://x.com/a"), true);
  assert.equal(isGeneric("Vercel company information, funding & investors", "https://x.com/a"), true);
  assert.equal(isGeneric("Field Marketing Manager", "https://jobs.example.com/linear/1"), false);
});

test("a person with the company's name after a first name is not a signal", () => {
  assert.equal(looksLikePerson("Wesley Clay Appointed CEO of Hannover Re South Africa", "Clay"), true);
  assert.equal(looksLikePerson("Dress for Success Austin Announces Brittany Clay as New Director", "Clay"), true);
  assert.equal(looksLikePerson("Today Clay raised a new round", "Clay"), false);
  assert.equal(looksLikePerson("Introducing Clay's marketplace", "Clay"), false);
  assert.equal(looksLikePerson("Clay raises $115M Series D", "Clay"), false);
});

test("job listings and stat pages are filtered", () => {
  assert.equal(isGeneric("Job openings in Clay, NY for management experience", "https://x.com/a"), true);
  assert.equal(isGeneric("Linear valuation: $1.25bn (2025)", "https://x.com/a"), true);
  assert.equal(isGeneric("How Supabase turned product launches into a content machine", "https://x.com/a"), true);
  assert.equal(isGeneric("Ramp Raises $1.85 Billion at a $60 Billion Valuation", "https://x.com/a"), false);
});
