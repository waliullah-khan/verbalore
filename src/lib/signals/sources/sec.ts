import { URGENCY, daysAgo, type Account, type Found } from "./types";

// EDGAR asks every client to identify itself. Set SEC_USER_AGENT to your own name and email.
const UA = () => process.env.SEC_USER_AGENT ?? "Verbalore research tool verbalore-demo@example.com";

const SUFFIX = new Set(["inc", "llc", "corp", "corporation", "co", "company", "ltd", "limited", "labs", "lab", "technologies", "technology", "holdings", "pbc", "plc", "lp", "the"]);
const words = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);

// Full-text search also matches filings that merely mention the name, so a hit only counts when the
// filer itself is the company: its name, then at most corporate suffixes.
export function entityMatches(displayName: string, accountName: string): boolean {
  const e = words(displayName);
  const a = words(accountName);
  if (!a.length || e.slice(0, a.length).join(" ") !== a.join(" ")) return false;
  return e.slice(a.length).every((w) => SUFFIX.has(w));
}

type Hit = { _source: { ciks?: string[]; display_names?: string[]; form?: string; file_date?: string; adsh?: string } };

const WHAT: Record<string, { headline: string; note: string; base: number }> = {
  D: { headline: "Filed a Form D with the SEC", note: "A Form D is how a private company reports raising money, often before any announcement.", base: 0.95 },
  S1: { headline: "Filed an S-1 with the SEC", note: "An S-1 is the registration for going public.", base: 0.9 },
  K8: { headline: "Filed an 8-K with the SEC", note: "An 8-K reports a material event. Items 5.02 (executive change) and 1.01 (major agreement) are the ones to read.", base: 0.65 },
};

const family = (form: string) => (form.startsWith("D") ? "D" : form.startsWith("S-1") ? "S1" : form.startsWith("8-K") ? "K8" : null);

export function filingFound(hit: Hit, account: Account, now = Date.now()): Found | null {
  const s = hit._source;
  const form = s.form ?? "";
  const fam = family(form);
  const name = (s.display_names ?? []).find((n) => entityMatches(n, account.name));
  if (!fam || !name || !s.file_date || !s.adsh) return null;
  const cik = Number((s.ciks ?? [])[0] ?? 0);
  const age = daysAgo(s.file_date, now);
  const w = WHAT[fam];
  return {
    kind: "filing",
    source: "sec",
    headline: `${w.headline}${form.endsWith("/A") ? " (amendment)" : ""}`,
    summary: `Filed ${s.file_date}. ${w.note}`,
    url: `https://www.sec.gov/Archives/edgar/data/${cik}/${s.adsh.replace(/-/g, "")}/${s.adsh}-index.htm`,
    relevance: 0.92,
    urgency: Number((Math.min(w.base, URGENCY.filing + 0.1) * (age <= 30 ? 1 : age <= 60 ? 0.92 : 0.82)).toFixed(2)),
    detectedAt: new Date(`${s.file_date}T12:00:00Z`).toISOString(),
    dedupeKey: s.adsh,
  };
}

export async function secSignals(account: Account, now = Date.now()): Promise<Found[]> {
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const url =
    "https://efts.sec.gov/LATEST/search-index?q=" + encodeURIComponent(`"${account.name}"`) +
    `&forms=D,8-K,S-1&dateRange=custom&startdt=${iso(now - 120 * 86_400_000)}&enddt=${iso(now)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA() }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`sec ${res.status}`);
  const json = (await res.json()) as { hits?: { hits?: Hit[] } };
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const h of json.hits?.hits ?? []) {
    const f = filingFound(h, account, now);
    if (f && !seen.has(f.dedupeKey!)) {
      seen.add(f.dedupeKey!);
      out.push(f);
    }
  }
  return out.sort((a, b) => b.urgency - a.urgency).slice(0, 3);
}
