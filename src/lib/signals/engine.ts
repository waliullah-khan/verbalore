import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runActor, hasApify } from "../research/apify";
import { webSearch, hasFirecrawl } from "../research/firecrawl";
import { jevDecide } from "../jev";

export type SignalKind = "funding" | "leadership" | "hiring" | "launch" | "custom";

export type Account = { id: string; name: string; domain: string | null };
type Hit = { title: string; snippet: string; url: string; date: string | null };
export type Found = { kind: SignalKind; headline: string; summary: string; url: string; relevance: number; urgency: number; detectedAt: string };

const URGENCY: Record<SignalKind, number> = { funding: 0.9, leadership: 0.85, launch: 0.7, hiring: 0.6, custom: 0.65 };

const RULES: [SignalKind, RegExp][] = [
  ["funding", /\b(raises?|raised|funding|series [a-f]\b|seed round|valuation|investment round|secures \$)/i],
  ["leadership", /\b(appoints?|names? (a )?new|joins as|promoted to|new (ceo|cto|cro|cmo|cfo|coo|vp|chief|head of)|steps down)/i],
  ["launch", /\b(launch(es|ed)?|unveils?|introduces?|announces?|releases?|rolls out|ships)\b/i],
  ["hiring", /\b(hiring|is hiring|open roles?|job openings?|expands (its )?team|careers)\b/i],
];

export function classifyHeuristic(text: string): SignalKind | null {
  for (const [kind, re] of RULES) if (re.test(text)) return kind;
  return null;
}

// Profile pages, explainers and listings are about a company, not a change at it.
const GENERIC_HOST = /(tracxn\.com|crunchbase\.com\/organization|zoominfo\.com\/c\/|owler\.com|pitchbook\.com\/profiles|linkedin\.com\/company|wikipedia\.org|g2\.com|capterra\.com|trustpilot\.com)/i;
const GENERIC_TITLE = /^(what is|what's|how (much|to|does)|guide|pricing|review|alternatives?|about)\b/i;

export function isGeneric(title: string, url: string): boolean {
  return title.trim().length < 12 || GENERIC_TITLE.test(title.trim()) || GENERIC_HOST.test(url);
}

export function mentions(text: string, name: string): boolean {
  return text.toLowerCase().includes(name.toLowerCase());
}

export function signalHash(accountId: string, kind: string, url: string): string {
  const norm = url.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  return createHash("sha256").update(`${accountId}|${kind}|${norm}`).digest("hex").slice(0, 32);
}

// Queries are written from the signal types a salesperson acts on.
export function queriesFor(account: Account, watches: string[]): { q: string; kind: SignalKind | null }[] {
  const n = `"${account.name}"`;
  return [
    { q: `${n} raises funding round`, kind: "funding" },
    { q: `${n} appoints new chief OR VP OR head of`, kind: "leadership" },
    { q: `${n} launches new product OR feature`, kind: "launch" },
    { q: `${n} hiring sales OR marketing OR revenue`, kind: "hiring" },
    ...watches.map((w) => ({ q: `${n} ${w}`, kind: "custom" as const })),
  ];
}

async function search(q: string): Promise<Hit[]> {
  if (hasFirecrawl()) {
    const hits = await webSearch(q, { limit: 5, tbs: "qdr:m" });
    return hits.map((h) => ({ title: h.title, snippet: h.description, url: h.url, date: null }));
  }
  if (hasApify()) {
    type Row = { organicResults?: { title?: string; url?: string; description?: string; date?: string }[] };
    const rows = await runActor<Row>("apify/google-search-scraper", { queries: q, resultsPerPage: 5, maxPagesPerQuery: 1, countryCode: "us", languageCode: "en", quickDateRange: "m1" }, { timeoutSecs: 60 });
    return rows.flatMap((r) => r.organicResults ?? []).filter((r) => r.url).map((r) => ({ title: r.title ?? "", snippet: r.description ?? "", url: r.url!, date: r.date ?? null }));
  }
  return [];
}

async function jevKinds(account: Account, hits: Hit[]): Promise<Map<number, { kind: SignalKind | "none"; confidence: number; about: boolean }>> {
  const out = new Map<number, { kind: SignalKind | "none"; confidence: number; about: boolean }>();
  const questions: Record<string, never> = {};
  hits.forEach((_, i) => {
    Object.assign(questions, {
      [`k${i}`]: {
        type: "choice",
        instructions: `What sales trigger does this search result describe for the company ${account.name}?`,
        criteria: {
          funding: "The company raised money or announced a funding round",
          leadership: "The company hired, appointed or lost a senior executive",
          launch: "The company launched a product, feature or major announcement",
          hiring: "The company is hiring or expanding a team",
          none: "None of these, or the result is not about this company",
        },
      },
      [`a${i}`]: {
        type: "choice",
        instructions: `Is this result mainly about the company ${account.name} itself, and recent?`,
        criteria: { about: "It reports news about this exact company", other: "It is about another company, a generic page, or old news" },
      },
    });
  });
  const result = await jevDecide({ company: account.name, results: hits.map((h, i) => ({ id: i, title: h.title, text: h.snippet.slice(0, 300) })) }, questions, 10_000);
  if (!result) return out;
  hits.forEach((_, i) => {
    const k = result.answers[`k${i}`];
    const a = result.answers[`a${i}`];
    if (k?.type === "choice" && a?.type === "choice") out.set(i, { kind: k.choice as SignalKind | "none", confidence: k.confidence, about: a.choice === "about" && a.confidence >= 0.5 });
  });
  return out;
}

export async function findSignals(account: Account, watches: string[]): Promise<Found[]> {
  const found: Found[] = [];
  const seen = new Set<string>();
  for (const { q, kind: hint } of queriesFor(account, watches)) {
    let hits: Hit[] = [];
    try {
      hits = (await search(q)).slice(0, 4);
    } catch {
      continue;
    }
    hits = hits.filter((h) => !seen.has(h.url) && !isGeneric(h.title, h.url) && mentions(`${h.title} ${h.snippet}`, account.name));
    hits.forEach((h) => seen.add(h.url));
    if (!hits.length) continue;

    const jev = await jevKinds(account, hits);
    hits.forEach((h, i) => {
      const text = `${h.title}. ${h.snippet}`;
      const j = jev.get(i);
      let kind: SignalKind | null;
      let relevance: number;
      if (j) {
        if (j.kind === "none" || !j.about) return;
        kind = j.kind as SignalKind;
        relevance = Math.min(0.99, 0.55 + 0.4 * j.confidence);
      } else {
        kind = hint === "custom" ? "custom" : classifyHeuristic(text) ?? hint;
        if (!kind) return;
        relevance = 0.5 + (hint && kind === hint ? 0.2 : 0) + (mentions(h.title, account.name) ? 0.15 : 0);
      }
      found.push({
        kind,
        headline: h.title.replace(/\s*[-|–].*$/, "").slice(0, 140) || h.title.slice(0, 140),
        summary: h.snippet.slice(0, 280),
        url: h.url,
        relevance: Number(relevance.toFixed(2)),
        urgency: URGENCY[kind],
        detectedAt: h.date && isFinite(Date.parse(h.date)) ? new Date(h.date).toISOString() : new Date().toISOString(),
      });
    });
  }
  return found.sort((a, b) => b.relevance * b.urgency - a.relevance * a.urgency).slice(0, 6);
}

export async function scanWorkspace(db: SupabaseClient, workspaceId: string, only?: string[]) {
  const [{ data: accounts }, { data: watches }] = await Promise.all([
    db.from("vl_crm_accounts").select("id,name,domain").eq("workspace_id", workspaceId),
    db.from("vl_signal_watches").select("phrase").eq("workspace_id", workspaceId),
  ]);
  const phrases = (watches ?? []).map((w) => w.phrase as string);
  let inserted = 0;
  let scanned = 0;
  for (const account of (accounts ?? []).filter((a) => !only || only.includes(a.id))) {
    const signals = await findSignals(account, phrases);
    scanned++;
    if (signals.length) {
      const rows = signals.map((s) => ({
        workspace_id: workspaceId,
        account_id: account.id,
        kind: s.kind,
        headline: s.headline,
        summary: s.summary,
        evidence_url: s.url,
        detected_at: s.detectedAt,
        relevance: s.relevance,
        urgency: s.urgency,
        hash: signalHash(account.id, s.kind, s.url),
        status: "new",
      }));
      const { data } = await db.from("vl_signals").upsert(rows, { onConflict: "workspace_id,hash", ignoreDuplicates: true }).select("id");
      inserted += data?.length ?? 0;
    }
    await db.from("vl_crm_accounts").update({ last_scanned_at: new Date().toISOString() }).eq("id", account.id);
  }
  return { scanned, inserted };
}
