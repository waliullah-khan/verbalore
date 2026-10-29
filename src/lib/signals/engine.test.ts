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
