import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDocs, linkedinCompanyText, linkedinProfileText, normalizeBrain, pickPages, sourceLabel } from "./onboard";

const raw = {
  company: "  Acme   Robotics ",
  offer: "Acme builds warehouse robots. They rent them by the month.",
  icp: "Operations leaders at mid-size warehouses.",
  niche: "warehouse automation robots",
  proof: ["Cut picking time by 31% at one customer", "cut picking time by 31% at one customer", "", "Used by 40 sites"],
  voice: "Plain, direct, short sentences.",
  useCase: "gtm",
  competitors: ["Locus Robotics", "6 River Systems"],
  watches: ["raises a funding round", "opens a new warehouse", "raises a funding round"],
  inferred: ["They probably sell mostly in North America"],
};

test("the writer's answer is trimmed, de-duplicated and capped", () => {
  const b = normalizeBrain(raw);
  assert.ok(b);
  assert.equal(b.company, "Acme Robotics");
  assert.equal(b.useCase, "gtm");
  assert.deepEqual(b.proof, ["Cut picking time by 31% at one customer", "Used by 40 sites"]);
  assert.deepEqual(b.watches, ["raises a funding round", "opens a new warehouse"]);
  assert.equal(normalizeBrain({ ...raw, watches: Array.from({ length: 30 }, (_, i) => `event ${i}`) })!.watches.length, 10);
});

test("a use case that is not one of the seven becomes general", () => {
  assert.equal(normalizeBrain({ ...raw, useCase: "astrology" })!.useCase, "general");
  assert.equal(normalizeBrain({ ...raw, useCase: undefined })!.useCase, "general");
});

test("without a company and an offer there is nothing to build from", () => {
  assert.equal(normalizeBrain({ ...raw, company: "" }), null);
  assert.equal(normalizeBrain({ ...raw, offer: "   " }), null);
  assert.equal(normalizeBrain(null), null);
  assert.equal(normalizeBrain("a string"), null);
});

test("the pages worth reading are chosen from a homepage's links", () => {
  const links = [
    "https://acme.com/", "https://www.acme.com/about", "/pricing", "https://acme.com/customers/case-study-1", "https://acme.com/blog",
    "https://acme.com/logo.png", "https://other.com/about", "mailto:hi@acme.com", "#top", "https://acme.com/a/b/c/d/e/about", "https://acme.com/careers",
  ];
  const picked = pickPages("https://acme.com", links, 5);
  assert.deepEqual(picked, ["https://acme.com/about", "https://acme.com/customers/case-study-1", "https://acme.com/pricing", "https://acme.com/blog"]);
  assert.deepEqual(pickPages("https://acme.com", links, 2).length, 2);
  assert.deepEqual(pickPages("not a url", links), []);
});

test("a LinkedIn profile becomes plain text and points at the current employer", () => {
  const p = linkedinProfileText({
    firstName: "Ada", lastName: "Lovelace", headline: "Founder at Acme", about: "I build robots.",
    location: { linkedinText: "Austin, Texas" },
    experience: [{ position: "Founder", companyName: "Acme", duration: "3 yrs", description: "Runs the company", companyLinkedinUrl: "https://www.linkedin.com/company/acme" }],
    currentPosition: [{ companyName: "Acme", companyLinkedinUrl: "https://www.linkedin.com/company/acme" }],
  });
  assert.match(p.text, /Name: Ada Lovelace/);
  assert.match(p.text, /Headline: Founder at Acme/);
  assert.match(p.text, /Role: Founder at Acme 3 yrs/);
  assert.equal(p.companyUrl, "https://www.linkedin.com/company/acme");
  // an unexpected shape reads as empty instead of throwing
  assert.deepEqual(linkedinProfileText({}), { text: "", companyUrl: undefined });
  assert.equal(linkedinProfileText({ currentPosition: [{ companyLinkedinUrl: "https://evil.com/x" }] }).companyUrl, undefined);
});

test("a LinkedIn company page keeps its website for later", () => {
  const c = linkedinCompanyText({ name: "Acme", tagline: "Robots", description: "We make robots.", industries: [{ name: "Robotics" }], specialities: ["AMR", "WMS"], website: "https://acme.com" });
  assert.match(c.text, /Company: Acme/);
  assert.match(c.text, /Industry: Robotics/);
  assert.match(c.text, /Specialities: AMR, WMS/);
  assert.equal(c.website, "https://acme.com");
});

test("the documents say where they came from and what was only inferred", () => {
  const b = normalizeBrain(raw)!;
  const docs = buildDocs(b, "Built from your website only.", "https://acme.com");
  assert.deepEqual(docs.map((d) => d.title), ["About Acme Robotics", "Audience", "Proof and results", "Voice and style", "Competitors and signals"]);
  assert.ok(docs.every((d) => d.content.startsWith("Source: Built from your website only.")));
  assert.match(docs[0].content, /Inferred, not stated on your pages/);
  assert.match(docs[0].content, /Website: https:\/\/acme.com/);
  // the generator looks for a document titled like this to find a proof point
  assert.match(docs[2].title, /proof|results/i);
  assert.equal(docs[4].use_case, "gtm");
  assert.equal(docs[0].use_case, null);
  const bare = buildDocs({ ...b, proof: [] }, "x", null);
  assert.match(bare[2].content, /No proof points/);
});

test("the source label is exact about what was read", () => {
  const li = { kind: "person" as const, text: "x" };
  assert.equal(sourceLabel(true, li, false), "Built from your website and your LinkedIn.");
  assert.equal(sourceLabel(true, null, false), "Built from your website only.");
  assert.equal(sourceLabel(false, { ...li, limited: true }, false), "Built from limited public LinkedIn information.");
  assert.equal(sourceLabel(false, li, false), "Built from your LinkedIn information only.");
  assert.match(sourceLabel(true, li, true), /found through LinkedIn/);
});
