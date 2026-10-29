import { scrapePage, hasFirecrawl } from "../../research/firecrawl";
import { jevDecide } from "../../jev";
import type { Account, Found } from "./types";

type Page = { path: string; what: string; kind: "pricing" | "home" | "blog"; urgency: number };

const PAGES: Page[] = [
  { path: "/pricing", what: "its pricing page", kind: "pricing", urgency: 0.78 },
  { path: "", what: "its homepage messaging", kind: "home", urgency: 0.62 },
  { path: "/blog", what: "its blog", kind: "blog", urgency: 0.5 },
];

// Pages change constantly for reasons nobody cares about: counters, timestamps, rotating examples, bot checks,
// button labels and tracking links. A line has to look like a sentence a person wrote to count as a change.
const NOISE = /(https?:\/\/|www\.|cloudflare|turnstile|challenge|captcha|cookie|©|all rights reserved|\d{1,2}:\d{2}\s?(am|pm)?|\d{7,}|0123456789|\.example\b|iframe|deanonymi|⎿|→)/i;
const BUTTON = /^(get|try|start|sign|log|book|request|contact|learn|read|see|watch|join|view|download|menu|home)\b.{0,30}$/i;
const PRICE = /(\$|€|£|\d+\s?%|per (seat|user|month|year|member)|\/(mo|month|seat|user)|\bplans?\b|pricing|\bfree\b|enterprise|starter|billed)/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const letterRatio = (s: string) => (s.match(/[a-z]/gi)?.length ?? 0) / Math.max(1, s.length);

export function meaningfulAdditions(diff: string, max = 3): string[] {
  const out: string[] = [];
  for (const raw of diff.split("\n")) {
    if (!raw.startsWith("+") || raw.startsWith("+++")) continue;
    const line = raw.slice(1).replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
    if (line.length < 20 || line.length > 220 || words(line) < 4 || letterRatio(line) < 0.7) continue;
    if (NOISE.test(line) || BUTTON.test(line) || out.includes(line)) continue;
    out.push(line);
    if (out.length === max) break;
  }
  return out;
}

// What counts as enough evidence depends on the page: a pricing change must mention pricing.
export function worthReporting(page: Page, lines: string[]): boolean {
  if (page.kind === "pricing") return lines.some((l) => PRICE.test(l));
  return lines.length >= 2;
}

export function changeFound(page: Page, url: string, additions: string[], now = Date.now()): Found | null {
  if (!worthReporting(page, additions)) return null;
  const day = new Date(now).toISOString().slice(0, 10);
  return {
    kind: "change",
    source: "site",
    headline: `Changed ${page.what}`,
    summary: `New on the page: ${additions.join(" · ")}`.slice(0, 280),
    url,
    relevance: 0.78,
    urgency: page.urgency,
    detectedAt: new Date(now).toISOString(),
    dedupeKey: `${url}#${day}`,
  };
}

// Jev has the last word: is this a deliberate change or page noise? Without Jev the filters above stand alone.
async function isRealChange(account: Account, page: Page, lines: string[]): Promise<boolean> {
  const r = await jevDecide(
    { company: account.name, page: page.what, addedLines: lines },
    {
      verdict: {
        type: "choice",
        instructions: `These lines were added to ${page.what} of ${account.name}. Is this a deliberate change a salesperson would care about?`,
        criteria: {
          real: "A deliberate content change: new or changed pricing or plans, new positioning, a new product, feature or announcement",
          noise: "Incidental page content: counters, timestamps, chat or code demos, rotating examples, button labels, links, bot checks or cookie text",
        },
      },
    },
    8000
  );
  const a = r?.answers.verdict;
  return !a || a.type !== "choice" || a.confidence < 0.6 || a.choice === "real";
}

// Firecrawl remembers each page between scans and reports what changed. The first scan only sets the
// baseline, so changes show up from the second scan on.
export async function siteSignals(account: Account): Promise<{ found: Found[]; baselined: number }> {
  if (!hasFirecrawl() || !account.domain) return { found: [], baselined: 0 };
  const host = account.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const found: Found[] = [];
  let baselined = 0;
  await Promise.all(
    PAGES.map(async (p) => {
      const url = `https://${host}${p.path}`;
      try {
        const { change } = await scrapePage(url, { changeTracking: true });
        if (!change || change.changeStatus === "new") baselined++;
        else if (change.changeStatus === "changed") {
          const f = changeFound(p, url, meaningfulAdditions(change.diff?.text ?? ""));
          if (f && (await isRealChange(account, p, meaningfulAdditions(change.diff?.text ?? "")))) found.push(f);
        }
      } catch {
        // a page that does not exist is not a signal
      }
    })
  );
  return { found, baselined };
}
