import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrgList, pickHomepage } from "./orgs";

test("names, domains and mixed lines are all understood", () => {
  const out = parseOrgList("Ramp, ramp.com\nLinear\nhttps://www.attio.com/about\nClay Labs | https://clay.com\nvercel.com");
  assert.deepEqual(out, [
    { name: "Ramp", domain: "ramp.com" },
    { name: "Linear", domain: null },
    { name: "Attio", domain: "attio.com" },
    { name: "Clay Labs", domain: "clay.com" },
    { name: "Vercel", domain: "vercel.com" },
  ]);
});

test("a company name that merely contains a dot-word is not split wrongly", () => {
  assert.deepEqual(parseOrgList("Acme Inc"), [{ name: "Acme Inc", domain: null }]);
  assert.deepEqual(parseOrgList("Dot.com Holdings, dotcom.io"), [{ name: "Dot.com Holdings", domain: "dotcom.io" }]);
});

test("blank lines, bullets and repeats are tidied", () => {
  const out = parseOrgList("\n- Ramp\n* ramp\n1. Linear\n\n");
  assert.deepEqual(out.map((o) => o.name), ["Ramp", "Linear"]);
});

test("the list is capped", () => {
  const many = Array.from({ length: 40 }, (_, i) => `Company${i}`).join("\n");
  assert.equal(parseOrgList(many).length, 25);
});

test("the homepage is the first non-directory result that is about the company", () => {
  const hits = [
    { url: "https://www.linkedin.com/company/ramp", title: "Ramp | LinkedIn" },
    { url: "https://en.wikipedia.org/wiki/Ramp", title: "Ramp" },
    { url: "https://ramp.com/", title: "Ramp: Corporate cards and spend management" },
  ];
  assert.equal(pickHomepage("Ramp", hits), "ramp.com");
  assert.equal(pickHomepage("Ramp", [{ url: "https://news.example.com/a", title: "Unrelated story" }]), null);
});
