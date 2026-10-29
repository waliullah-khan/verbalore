import type { Post } from "../../research/types";
import type { Found } from "./types";

// City of Austin "Issued Construction Permits", published on the city's open data portal and updated daily.
// A permit exists months before a listing or a news story, which is what makes it an early signal.
const DATASET = "3syk-w9eu";
const BASE = `https://data.austintexas.gov/resource/${DATASET}.json`;
export const DATASET_URL = "https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu";

export type ZipRow = { zip: string; n: number; units: number };
export type Project = { address: string; units: number; builder: string | null; link: string | null; description: string; issued: string };
export type Builder = { name: string; n: number; units: number };

export type AustinData = {
  windowDays: number;
  newRes: { n: number; units: number; priorN: number };
  topNewZips: ZipRow[];
  demo: { n: number; priorN: number };
  topDemoZips: ZipRow[];
  large: Project[];
  builders: Builder[];
};

const iso = (t: number) => new Date(t).toISOString().slice(0, 19);

async function soql<T = Record<string, string>>(params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams(params);
  const headers: Record<string, string> = process.env.SOCRATA_APP_TOKEN ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN } : {};
  const res = await fetch(`${BASE}?${qs}`, { headers, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`austin permits ${res.status}`);
  return (await res.json()) as T[];
}

const n = (v: unknown) => Number(v) || 0;

// The portal returns the permit link as an object ({ url }), though it is sometimes a plain string.
export function permitLink(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "object") return (raw as { url?: string }).url ?? null;
  const text = String(raw);
  if (text.startsWith("http")) return text;
  try {
    return (JSON.parse(text) as { url?: string } | null)?.url ?? null;
  } catch {
    return null;
  }
}

// "6400 FM 969 RD BLDG 1" is one site; the building number is detail the headline does not need.
export const siteName = (address: string) => address.replace(/\s+(bldg|building)\s+\w+$/i, "").trim();
const sentence = (s: string) => s.trim().replace(/[.\s]+$/, "");

// "Joseph Design Build**MAIN***" is how the portal marks a primary applicant; the marker is not part of the name.
export function cleanBuilder(raw: string): string | null {
  const name = raw.replace(/\*+\s*MAIN\s*\*+/gi, "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  return name.length >= 3 ? name : null;
}

const NEW_HOME = "permittype='BP' AND work_class='New' AND permit_class_mapped='Residential'";
const TEARDOWN = "permittype='BP' AND work_class='Demolition' AND permit_class_mapped='Residential'";

export async function loadAustin(now = Date.now(), windowDays = 30): Promise<AustinData> {
  const since = iso(now - windowDays * 86_400_000);
  const prior = iso(now - 2 * windowDays * 86_400_000);
  const cur = `issue_date > '${since}'`;
  const before = `issue_date > '${prior}' AND issue_date <= '${since}'`;
  const count = (where: string) => soql({ $select: "count(*) as n, sum(housing_units) as units", $where: where });
  const byZip = (where: string) => soql({ $select: "original_zip, count(*) as n, sum(housing_units) as units", $where: where, $group: "original_zip", $order: "n desc", $limit: "5" });

  const [newCur, newPrior, zips, demoCur, demoPrior, demoZips, large, builders] = await Promise.all([
    count(`${cur} AND ${NEW_HOME}`),
    count(`${before} AND ${NEW_HOME}`),
    byZip(`${cur} AND ${NEW_HOME}`),
    count(`${cur} AND ${TEARDOWN}`),
    count(`${before} AND ${TEARDOWN}`),
    byZip(`${cur} AND ${TEARDOWN}`),
    soql({
      $select: "permit_location, housing_units, applicant_org, link, description, issue_date",
      $where: `${cur} AND permittype='BP' AND work_class='New' AND housing_units >= 20`,
      $order: "housing_units desc",
      $limit: "20",
    }),
    soql({
      $select: "applicant_org, count(*) as n, sum(housing_units) as units",
      $where: `${cur} AND ${NEW_HOME} AND applicant_org IS NOT NULL`,
      $group: "applicant_org",
      $order: "n desc",
      $limit: "8",
    }),
  ]);

  const zip = (r: Record<string, string>): ZipRow => ({ zip: r.original_zip, n: n(r.n), units: n(r.units) });
  return {
    windowDays,
    newRes: { n: n(newCur[0]?.n), units: n(newCur[0]?.units), priorN: n(newPrior[0]?.n) },
    topNewZips: zips.filter((r) => r.original_zip).map(zip),
    demo: { n: n(demoCur[0]?.n), priorN: n(demoPrior[0]?.n) },
    topDemoZips: demoZips.filter((r) => r.original_zip).map(zip),
    large: dedupeProjects(
      large.map((r) => ({
        address: r.permit_location ?? "",
        units: n(r.housing_units),
        builder: r.applicant_org ? cleanBuilder(r.applicant_org) : null,
        link: permitLink(r.link),
        description: (r.description ?? "").replace(/\s+/g, " ").trim(),
        issued: r.issue_date ?? "",
      }))
    ),
    builders: builders.flatMap((r) => {
      const name = r.applicant_org ? cleanBuilder(r.applicant_org) : null;
      return name ? [{ name, n: n(r.n), units: n(r.units) }] : [];
    }),
  };
}

// One development often has several permits (one per building), so projects are collapsed by address.
export function dedupeProjects(projects: Project[]): Project[] {
  const byAddress = new Map<string, Project>();
  for (const p of projects) {
    if (!p.address) continue;
    const key = p.address.toLowerCase().replace(/\s+bldg.*$/i, "");
    const seen = byAddress.get(key);
    if (!seen || p.units > seen.units) byAddress.set(key, { ...p, units: Math.max(p.units, seen?.units ?? 0) });
  }
  return Array.from(byAddress.values()).sort((a, b) => b.units - a.units);
}

const zipList = (rows: ZipRow[]) => rows.slice(0, 3).map((r) => `${r.zip} (${r.n})`).join(", ");
const pct = (cur: number, prior: number) => (prior > 0 ? Math.round(((cur - prior) / prior) * 100) : null);
const signed = (p: number) => `${p >= 0 ? "+" : ""}${p}%`;
const week = (now: number) => Math.floor(now / (7 * 86_400_000));
const SOURCE_NOTE = "From the City of Austin permit records.";

export function austinFound(d: AustinData, now = Date.now()): Found[] {
  const out: Found[] = [];
  const base = { source: "permits" as const, relevance: 0.9, detectedAt: new Date(now).toISOString() };

  if (d.newRes.n > 0) {
    const p = pct(d.newRes.n, d.newRes.priorN);
    out.push({
      ...base,
      kind: "market",
      headline: `Austin issued ${d.newRes.n} new-home permits in ${d.windowDays} days${p === null ? "" : ` (${signed(p)} on the month before)`}`,
      summary: `${d.newRes.units} housing units. Most active ZIP codes: ${zipList(d.topNewZips)}. ${SOURCE_NOTE}`,
      url: DATASET_URL,
      urgency: 0.72,
      dedupeKey: `austin-new-homes-w${week(now)}`,
    });
  }
  if (d.demo.n > 0) {
    const p = pct(d.demo.n, d.demo.priorN);
    out.push({
      ...base,
      kind: "market",
      headline: `${d.demo.n} homes approved for demolition in Austin this month${p === null ? "" : ` (${signed(p)})`}`,
      summary: `Teardowns usually become new builds. Most in ${zipList(d.topDemoZips)}. ${SOURCE_NOTE}`,
      url: DATASET_URL,
      urgency: 0.68,
      dedupeKey: `austin-teardowns-w${week(now)}`,
    });
  }
  for (const p of d.large.slice(0, 3)) {
    out.push({
      ...base,
      kind: "permit",
      headline: `${p.units}-unit project permitted at ${siteName(p.address)}`,
      summary: `${p.builder ? `${sentence(p.builder)}. ` : ""}${p.description.slice(0, 180)}`.trim(),
      url: p.link ?? DATASET_URL,
      urgency: 0.85,
      detectedAt: p.issued ? new Date(`${p.issued.slice(0, 10)}T12:00:00Z`).toISOString() : base.detectedAt,
      dedupeKey: `austin-project-${p.address.toLowerCase()}`,
      meta: p.builder ? { builder: p.builder } : undefined,
    });
  }
  for (const b of d.builders.slice(0, 3)) {
    out.push({
      ...base,
      kind: "permit",
      headline: `${b.name} pulled ${b.n} new-home permits in Austin`,
      summary: `${b.units} housing units in ${d.windowDays} days. Builders buy land, borrow and sell homes, so they are active buyers of agent and lending services. ${SOURCE_NOTE}`,
      url: DATASET_URL,
      urgency: 0.7,
      dedupeKey: `austin-builder-${b.name.toLowerCase()}-w${week(now)}`,
      meta: { builder: b.name },
    });
  }
  return out;
}

// The same facts as evidence for the Real estate ideas, so scripts can quote real local numbers.
export function austinPosts(d: AustinData, now = Date.now()): Post[] {
  // how big the underlying fact is, so the strongest ones rank first
  const weight = (f: Found) =>
    f.dedupeKey?.startsWith("austin-new-homes") ? d.newRes.n : f.dedupeKey?.startsWith("austin-teardowns") ? d.demo.n : Number(f.headline.match(/^(\d+)-unit/)?.[1] ?? 0);

  return austinFound(d, now)
    .filter((f) => f.kind === "market" || f.dedupeKey?.startsWith("austin-project-"))
    .map((f, i) => ({
      id: `permits:${f.dedupeKey ?? i}`,
      platform: "permits" as const,
      url: f.url,
      author: "City of Austin",
      title: f.headline,
      text: f.summary,
      engagement: weight(f),
      postedAt: f.detectedAt,
      kind: "article" as const,
    }));
}

export async function austinSignals(now = Date.now()): Promise<Found[]> {
  return austinFound(await loadAustin(now), now);
}
