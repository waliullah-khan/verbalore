const fs = require("fs");
let s = fs.readFileSync("src/lib/signals/engine.ts", "utf8");
const swap = (a, b) => { if (!s.includes(a)) throw new Error("missing: " + a.slice(0, 60)); s = s.split(a).join(b); };

swap("|\bcareers\b|perks \+ culture|jobs & culture/i;", "|\bcareers\b|perks \+ culture|jobs & culture|job openings?|a story from|valuation:/i;");
swap("/^(what is|what's|how (much|to|does)|who is|guide|pricing|about)\b|", "/^(what is|what's|how|who is|guide|pricing|about)\b|");

swap(
  "export function looksLikePerson(title: string, name: string): boolean {",
  `const NOT_A_FIRST_NAME = new Set(["today", "why", "how", "meet", "inside", "introducing", "the", "new", "with", "and", "at", "by", "for", "from", "after", "as", "on", "in", "of", "to", "says", "why", "when", "what", "about", "watch", "read", "join", "is"]);
export function looksLikePerson(title: string, name: string): boolean {
  const before = title.match(new RegExp("\\b([A-Z][a-z]+)\\s+" + escapeRe(name) + "\\b"));
  if (before && !NOT_A_FIRST_NAME.has(before[1].toLowerCase()) && classifyHeuristic(before[1]) === null) return true;`
);
fs.writeFileSync("src/lib/signals/engine.ts", s);

let t = fs.readFileSync("src/lib/signals/engine.test.ts", "utf8");
t += `
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
});
`;
fs.writeFileSync("src/lib/signals/engine.test.ts", t);
console.log("ok");
