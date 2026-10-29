import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJson } from "../src/lib/llm";
import { scrapePage, webSearch } from "../src/lib/research/firecrawl";
import { runActor } from "../src/lib/research/apify";
import { addDoc, isPublicHttpUrl } from "../src/lib/brain/ingest";
import { isUseCase, type UseCaseId } from "../src/lib/usecases";
import { isAutoWorkspaceName, linkedinKind, normaliseWebsite } from "../src/lib/access";
import { enqueue } from "../src/lib/jobs";
import type { Job } from "./handlers";

// Builds a new account's brand brain from its company website and LinkedIn, then queues the first ideas.

export type Brain = {
  company: string;
  offer: string;
  icp: string;
  niche: string;
  proof: string[];
  voice: string;
  useCase: UseCaseId;
  competitors: string[];
  watches: string[];
  inferred: string[];
};

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (v: unknown, max: number, each: number) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of Array.isArray(v) ? v : []) {
    const s = clean(item, each);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
    if (out.length >= max) break;
  }
  return out;
};

// The model's answer is checked and trimmed here. Without a company and an offer there is nothing to build a brain from.
export function normalizeBrain(raw: unknown): Brain | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const company = clean(r.company, 80);
  const offer = clean(r.offer, 700);
  if (!company || !offer) return null;
  const useCase = isUseCase(String(r.useCase ?? "")) ? (String(r.useCase) as UseCaseId) : "general";
  return {
    company,
    offer,
    icp: clean(r.icp, 500),
    niche: clean(r.niche, 100),
    proof: list(r.proof, 8, 300),
    voice: clean(r.voice, 600),
    useCase,
    competitors: list(r.competitors, 5, 60),
    watches: list(r.watches, 10, 80),
    inferred: list(r.inferred, 8, 200),
  };
}

// ---- reading the website ----

const KEYWORDS: [RegExp, number][] = [
  [/about|our-story|company|who-we-are/, 10],
  [/customer|case-stud|stories|success/, 8],
  [/product|platform|solution|features|services/, 7],
  [/pricing|plans/, 6],
  [/team|leadership/, 4],
  [/blog|insights|resources/, 3],
  [/faq/, 2],
];

// Chooses the few pages that say the most about a company, from the links on its homepage.
export function pickPages(base: string, links: string[], max = 5): string[] {
  let home: URL;
  try {
    home = new URL(base);
  } catch {
    return [];
  }
  const host = (h: string) => h.replace(/^www\./, "");
  const scored = new Map<string, number>();
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l, home);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || host(u.hostname) !== host(home.hostname)) continue;
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path.split("/").length > 4 || /\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|css|js)$/i.test(path)) continue;
    const score = KEYWORDS.reduce((s, [re, w]) => (re.test(path.toLowerCase()) ? Math.max(s, w) : s), 0);
    if (score > 0 && !scored.has(path)) scored.set(path, score);
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([p]) => new URL(p, home).toString());
}

type Page = { url: string; title: string; text: string };
const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timed out")), ms))]);

async function firecrawl<T>(path: string, body: unknown, ms: number): Promise<T> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  const res = await fetch(`https://api.firecrawl.dev/v2${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string } & T;
  if (!res.ok || json.success === false) throw new Error(`firecrawl ${path} ${res.status}: ${json.error ?? "failed"}`);
  return json;
}

async function readWebsite(url: string, log: (m: string) => void): Promise<{ url: string; pages: Page[] } | null> {
  try {
    const home = await firecrawl<{ data?: { markdown?: string; links?: string[]; metadata?: { title?: string } } }>(
      "/scrape", { url, formats: ["markdown", "links"], onlyMainContent: true }, 45_000);
    const pages: Page[] = [{ url, title: clean(home.data?.metadata?.title, 120), text: (home.data?.markdown ?? "").slice(0, 8000) }];
    let links = home.data?.links ?? [];
    let picked = pickPages(url, links);
    if (picked.length < 2) {
      // a homepage that hides its menu: ask for the site's address list instead
      const map = await firecrawl<{ links?: ({ url?: string } | string)[] }>("/map", { url, limit: 60 }, 30_000).catch(() => null);
      links = (map?.links ?? []).map((l) => (typeof l === "string" ? l : l.url ?? ""));
      picked = pickPages(url, links);
    }
    const more = await Promise.allSettled(picked.map((u) => withTimeout(scrapePage(u), 35_000)));
    more.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.markdown.trim()) pages.push({ url: picked[i], title: clean(r.value.title, 120), text: r.value.markdown.slice(0, 5000) });
    });
    log(`website: ${pages.length} page${pages.length === 1 ? "" : "s"} read`);
    return pages.some((p) => p.text.trim().length > 200) ? { url, pages } : null;
  } catch (err) {
    log(`website failed: ${(err as Error).message}`);
    return null;
  }
}

// ---- reading LinkedIn ----

type Li = { kind: "person" | "company"; text: string; companyUrl?: string; website?: string; limited?: boolean };

const s = (v: unknown, max = 600) => clean(v, max);
const first = <T,>(v: unknown): T | undefined => (Array.isArray(v) ? (v[0] as T | undefined) : undefined);

// The profile actor's fields vary a little between versions, so each one is read defensively.
export function linkedinProfileText(raw: Record<string, unknown>): { text: string; companyUrl?: string } {
  const lines: string[] = [];
  const name = [s(raw.firstName, 60), s(raw.lastName, 60)].filter(Boolean).join(" ");
  if (name) lines.push(`Name: ${name}`);
  if (s(raw.headline)) lines.push(`Headline: ${s(raw.headline)}`);
  if (s(raw.about, 1800)) lines.push(`About: ${s(raw.about, 1800)}`);
  const loc = (raw.location as { linkedinText?: string } | undefined)?.linkedinText;
  if (s(loc, 80)) lines.push(`Location: ${s(loc, 80)}`);
  const jobs = (Array.isArray(raw.experience) ? raw.experience : []).slice(0, 5) as Record<string, unknown>[];
  for (const j of jobs) {
    const bit = [s(j.position, 80), s(j.companyName, 80) && `at ${s(j.companyName, 80)}`, s(j.duration, 40)].filter(Boolean).join(" ");
    if (bit) lines.push(`Role: ${bit}${s(j.description, 300) ? ` — ${s(j.description, 300)}` : ""}`);
  }
  const current = first<Record<string, unknown>>(raw.currentPosition) ?? jobs[0];
  const companyUrl = s(current?.companyLinkedinUrl, 200) || undefined;
  return { text: lines.join("\n"), companyUrl: companyUrl && /linkedin\.com\/company\//i.test(companyUrl) ? companyUrl : undefined };
}

export function linkedinCompanyText(raw: Record<string, unknown>): { text: string; website?: string } {
  const lines: string[] = [];
  if (s(raw.name, 100)) lines.push(`Company: ${s(raw.name, 100)}`);
  if (s(raw.tagline, 200)) lines.push(`Tagline: ${s(raw.tagline, 200)}`);
  if (s(raw.description, 1800)) lines.push(`Description: ${s(raw.description, 1800)}`);
  const industries = (Array.isArray(raw.industries) ? raw.industries : []).map((i) => s((i as { name?: string })?.name ?? i, 60)).filter(Boolean);
  if (industries.length) lines.push(`Industry: ${industries.join(", ")}`);
  const specialities = (Array.isArray(raw.specialities) ? raw.specialities : []).map((x) => s(x, 60)).filter(Boolean).slice(0, 12);
  if (specialities.length) lines.push(`Specialities: ${specialities.join(", ")}`);
  const size = s(raw.employeeCountRange ?? raw.employeeCount, 40);
  if (size) lines.push(`Size: ${size}`);
  const website = s(raw.website, 200) || undefined;
  return { text: lines.join("\n"), website };
}

async function readLinkedin(url: string, name: string, log: (m: string) => void): Promise<Li | null> {
  if (!url) return null;
  const kind = linkedinKind(url);
  try {
    if (kind === "company") {
      const [row] = await runActor<Record<string, unknown>>("harvestapi/linkedin-company", { companies: [url] }, { timeoutSecs: 90, limit: 1 });
      const c = row ? linkedinCompanyText(row) : null;
      if (c?.text) { log("linkedin: company page read"); return { kind, text: c.text, website: c.website }; }
    } else {
      const [row] = await runActor<Record<string, unknown>>(
        "harvestapi/linkedin-profile-scraper", { profileScraperMode: "Profile details no email ($4 per 1k)", queries: [url] }, { timeoutSecs: 120, limit: 1 });
      const p = row ? linkedinProfileText(row) : null;
      if (p?.text) {
        let text = p.text;
        let website: string | undefined;
        if (p.companyUrl) {
          // the person's current employer says more about the business than they do
          const [co] = await runActor<Record<string, unknown>>("harvestapi/linkedin-company", { companies: [p.companyUrl] }, { timeoutSecs: 90, limit: 1 }).catch(() => []);
          const c = co ? linkedinCompanyText(co) : null;
          if (c?.text) { text += `\n\nCOMPANY PAGE\n${c.text}`; website = c.website; }
        }
        log("linkedin: profile read");
        return { kind, text, website, companyUrl: p.companyUrl };
      }
    }
  } catch (err) {
    log(`linkedin actor failed: ${(err as Error).message}`);
  }
  // blocked or empty: what search can still say about the page
  try {
    const slug = url.replace(/\/+$/, "").split("/").pop() ?? "";
    const hits = await webSearch(`"${name}" ${slug} linkedin`, { limit: 5, timeoutMs: 30_000 });
    const text = hits.filter((h) => /linkedin\.com/i.test(h.url)).map((h) => `${h.title}. ${h.description}`).join("\n").slice(0, 1500);
    if (text.length > 60) { log("linkedin: limited public information only"); return { kind, text, limited: true }; }
  } catch (err) {
    log(`linkedin search failed: ${(err as Error).message}`);
  }
  return null;
}

// ---- writing the brain ----

const PLAYBOOKS = "real_estate, developers, product_marketing, gtm, c_suite, founders, general";

const SYSTEM = [
  "You build a brand knowledge base for a tool that helps a person make a short video every day. You are given text read from a company website and from LinkedIn.",
  "Use ONLY facts that appear in the SOURCES. Never invent numbers, customers, results, awards or claims. If something is your inference rather than something the sources say, do not state it as fact: list it in `inferred`.",
  "Write plainly, in full sentences, no hype.",
  `Reply with JSON: {"company": "the company name", "offer": "2 to 4 plain sentences on what they do and sell", "icp": "who they sell to, 1 to 3 sentences", "niche": "a 3 to 8 word phrase describing their market that works as a research query", "proof": ["each proof point, result, customer or credential the sources actually state"], "voice": "how their copy sounds: tone, vocabulary, sentence length, habits", "useCase": "one of ${PLAYBOOKS}, the best fit for the kind of videos this person would make", "competitors": ["3 to 5 real companies that compete or sit next to them"], "watches": ["6 to 10 short phrases for events worth watching in their market, such as 'raises a seed round' or 'hires a head of marketing'"], "inferred": ["anything above that the sources do not state outright"]}.`,
].join("\n");

async function writeBrain(sources: string): Promise<Brain | null> {
  const ask = (extra = "") => completeJson<unknown>([{ role: "system", content: SYSTEM + extra }, { role: "user", content: `SOURCES:\n${sources}` }]);
  const first = normalizeBrain(await ask());
  if (first) return first;
  return normalizeBrain(await ask("\nYour last answer was missing the company or offer. Answer again, and fill in both from the sources."));
}

const USE_CASE_LABEL: Record<UseCaseId, string> = {
  real_estate: "Real estate", developers: "Software developers", product_marketing: "Product marketing", gtm: "Go-to-market and sales",
  c_suite: "C-suite", founders: "Founders", general: "General",
};

export function buildDocs(b: Brain, label: string, website: string | null) {
  const head = `Source: ${label}`;
  const inferred = b.inferred.length ? `\n\nInferred, not stated on your pages:\n${b.inferred.map((x) => `- ${x}`).join("\n")}` : "";
  return [
    { title: `About ${b.company}`, use_case: null as UseCaseId | null, content: `${head}\n\n${b.offer}\n\nCategory: ${USE_CASE_LABEL[b.useCase]}${website ? `\nWebsite: ${website}` : ""}${inferred}` },
    { title: "Audience", use_case: null, content: `${head}\n\nWho they sell to: ${b.icp || "Not stated on the pages we read."}\nMarket: ${b.niche || "Not stated."}` },
    {
      title: "Proof and results",
      use_case: null,
      content: `${head}\n\n${b.proof.length ? b.proof.map((x) => `- ${x}`).join("\n") : "No proof points, results or customers were stated on the pages we read. Add yours here so scripts can use them."}`,
    },
    { title: "Voice and style", use_case: null, content: `${head}\n\n${b.voice || "Not enough copy was read to describe their voice. Paste a few past posts into the Brain."}` },
    {
      title: "Competitors and signals",
      use_case: b.useCase,
      content: `${head}\n\nSuggested organizations to keep an eye on (suggested from the market, not taken from your pages, so check them):\n${b.competitors.map((x) => `- ${x}`).join("\n") || "- none suggested"}\n\nEvents to watch for:\n${b.watches.map((x) => `- ${x}`).join("\n")}`,
    },
  ];
}

export const sourceLabel = (site: boolean, li: Li | null, discovered: boolean) =>
  site && li && !li.limited ? `Built from your website${discovered ? " (found through LinkedIn)" : ""} and your LinkedIn.`
  : site && li?.limited ? "Built from your website and limited public LinkedIn information."
  : site ? "Built from your website only."
  : li?.limited ? "Built from limited public LinkedIn information."
  : "Built from your LinkedIn information only.";

// ---- the job ----

export async function onboardWorkspace(db: SupabaseClient, job: Job): Promise<Record<string, unknown>> {
  const workspaceId = job.workspace_id;
  if (!workspaceId) throw new Error("no workspace for this job");
  const tag = `[onboard] ${job.id.slice(0, 8)}`;
  const log = (m: string) => console.log(`${tag} ${m}`);
  // the page shows these steps as they happen, so each one is written onto the job as it starts
  const step = (name: string) => db.from("vl_jobs").update({ result: { step: name } }).eq("id", job.id);

  const [{ data: ws }, { data: profile }] = await Promise.all([
    db.from("vl_workspaces").select("id,name").eq("id", workspaceId).single(),
    db.from("vl_profiles").select("full_name,linkedin_url,website").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!ws) throw new Error("workspace not found");
  const linkedin = String(job.payload.linkedin || profile?.linkedin_url || "");
  let website = normaliseWebsite(String(job.payload.website ?? ""));
  if (website && !isPublicHttpUrl(website)) website = null;

  await step("website");
  let site = website ? await readWebsite(website, log) : null;

  await step("linkedin");
  const li = await readLinkedin(linkedin, profile?.full_name ?? "", log);

  // no website given: the company page on LinkedIn often lists one
  let discovered = false;
  if (!site && li?.website) {
    const found = normaliseWebsite(li.website);
    if (found && isPublicHttpUrl(found)) {
      site = await readWebsite(found, log);
      if (site) { website = found; discovered = true; }
    }
  }
  if (!site && !li) {
    throw new Error(website
      ? "We could not read that website or your LinkedIn page. Check the address and try again."
      : "We could not read your LinkedIn page, and there was no website to use. Add your company website and try again.");
  }

  await step("brain");
  const parts: string[] = [];
  if (site) for (const p of site.pages) parts.push(`WEBSITE PAGE ${p.url}${p.title ? ` (${p.title})` : ""}\n${p.text}`);
  if (li) parts.push(`LINKEDIN ${li.kind === "company" ? "COMPANY PAGE" : "PROFILE"}${li.limited ? " (limited public information)" : ""}\n${li.text}`);
  const brain = await writeBrain(parts.join("\n\n---\n\n").slice(0, 30_000));
  if (!brain) throw new Error("There was not enough on those pages to build a brand brain. Add your company website and try again.");

  const label = sourceLabel(!!site, li, discovered);
  if (isAutoWorkspaceName(ws.name)) await db.from("vl_workspaces").update({ name: brain.company }).eq("id", workspaceId);
  await db.from("vl_workspaces").update({ niche: brain.niche, offer: brain.offer, icp: brain.icp }).eq("id", workspaceId);
  // a retry replaces the earlier attempt instead of piling up beside it
  await db.from("vl_brain_docs").delete().eq("workspace_id", workspaceId).eq("kind", "brand");
  const docs = buildDocs(brain, label, website);
  for (const d of docs) await addDoc(db, workspaceId, { kind: "brand", title: d.title, content: d.content, use_case: d.use_case, source_url: website ?? undefined });

  await step("signals");
  const { data: have } = await db.from("vl_signal_watches").select("phrase").eq("workspace_id", workspaceId);
  const known = new Set((have ?? []).map((w) => String(w.phrase).toLowerCase()));
  const fresh = brain.watches.filter((p) => !known.has(p.toLowerCase()));
  if (fresh.length) await db.from("vl_signal_watches").insert(fresh.map((phrase) => ({ workspace_id: workspaceId, phrase })));

  await step("ideas");
  const ideasJobId = await enqueue(db, workspaceId, "generate_ideas", { count: 5, useCase: brain.useCase });
  await db.from("vl_profiles").update({ website, onboarded_at: new Date().toISOString() }).eq("workspace_id", workspaceId);

  return {
    step: "done", company: brain.company, niche: brain.niche, useCase: brain.useCase, useCaseLabel: USE_CASE_LABEL[brain.useCase],
    source: label, docs: docs.length, watches: fresh.length, ideasJobId, website,
  };
}
