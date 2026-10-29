import { hasFirecrawl, webSearch } from "../research/firecrawl";

export type OrgEntry = { name: string; domain: string | null };

const DOMAIN = /^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#]\S*)?$/i;
const TRAILING_DOMAIN = /^(.*?)[\s,|;\t]+((?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?)$/i;

const host = (s: string) => s.match(DOMAIN)?.[1]?.toLowerCase() ?? null;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// One organisation per line. Accepts "Ramp", "Ramp, ramp.com", "Ramp | https://ramp.com" or just "ramp.com".
export function parseOrgList(text: string, max = 25): OrgEntry[] {
  const seen = new Set<string>();
  const out: OrgEntry[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.trim().replace(/^[-*•\d.)\s]+(?=\S)/, (m) => (/^\d+\.\s/.test(m) || /^[-*•]\s/.test(m) ? "" : m));
    if (!line) continue;

    let name = line;
    let domain: string | null = null;
    const bare = host(line);
    if (bare) {
      domain = bare;
      name = titleCase(bare.split(".")[0]);
    } else {
      const m = line.match(TRAILING_DOMAIN);
      if (m && host(m[2])) {
        domain = host(m[2]);
        name = m[1].replace(/[,|;\s]+$/, "").trim();
      }
    }
    name = name.slice(0, 80).trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, domain });
    if (out.length >= max) break;
  }
  return out;
}

const NOT_A_HOMEPAGE = /(linkedin|wikipedia|crunchbase|facebook|twitter|x\.com|instagram|youtube|reddit|glassdoor|indeed|bloomberg|zoominfo|pitchbook|tracxn|g2\.com|capterra|trustpilot|github\.com|medium\.com|techcrunch|forbes)/i;

export function pickHomepage(name: string, hits: { url: string; title: string }[]): string | null {
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const h of hits) {
    const d = host(h.url);
    if (!d || NOT_A_HOMEPAGE.test(d)) continue;
    if (squash(d).includes(squash(name)) || squash(h.title).includes(squash(name))) return d;
  }
  return null;
}

// When only a name is given, find the website so the primary sources (careers, filings, site) can be read.
export async function resolveDomain(name: string): Promise<string | null> {
  if (!hasFirecrawl()) return null;
  try {
    return pickHomepage(name, await webSearch(`${name} official website`, { limit: 6, timeoutMs: 20_000 }));
  } catch {
    return null;
  }
}
