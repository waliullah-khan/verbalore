import { daysAgo, rootOf, type Account, type Found } from "./types";

// Reads the applicant tracking systems directly. A company's careers page is a curated view of
// its job board, so the board is the source of truth: it has the full list and the exact publish time.
export type Provider = "greenhouse" | "ashby" | "lever" | "workable" | "recruitee";
export type Board = { provider: Provider; token: string };
export type Job = { title: string; url: string; publishedAt: string | null; team: string };

const UA = { "User-Agent": "Mozilla/5.0 (compatible; Verbalore/0.1)" };
const PROVIDERS: Provider[] = ["ashby", "greenhouse", "lever", "workable", "recruitee"];

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Each system answers in its own shape; this turns them into one.
export function mapJobs(provider: Provider, payload: unknown): Job[] {
  const p = payload as Row | Row[] | null;
  if (!p) return [];
  switch (provider) {
    case "greenhouse":
      return ((p as Row).jobs ?? []).map((j: Row) => ({ title: String(j.title ?? "").trim(), url: j.absolute_url, publishedAt: j.first_published ?? j.updated_at ?? null, team: "" }));
    case "ashby":
      return ((p as Row).jobs ?? []).filter((j: Row) => j.isListed !== false).map((j: Row) => ({ title: String(j.title ?? "").trim(), url: j.jobUrl, publishedAt: j.publishedAt ?? null, team: String(j.team ?? j.department ?? "") }));
    case "lever":
      return (Array.isArray(p) ? p : []).map((j: Row) => ({ title: String(j.text ?? "").trim(), url: j.hostedUrl, publishedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null, team: String(j.categories?.team ?? "") }));
    case "workable":
      return ((p as Row).jobs ?? []).map((j: Row) => ({ title: String(j.title ?? "").trim(), url: j.url ?? j.shortlink, publishedAt: j.published_on ? new Date(j.published_on).toISOString() : null, team: String(j.department ?? "") }));
    case "recruitee":
      return ((p as Row).offers ?? []).map((j: Row) => ({ title: String(j.position ?? j.title ?? "").trim(), url: j.careers_url, publishedAt: j.published_at ?? null, team: String(j.department ?? "") }));
  }
}

const endpoint = (b: Board) =>
  ({
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${b.token}/jobs`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${b.token}`,
    lever: `https://api.lever.co/v0/postings/${b.token}?mode=json`,
    workable: `https://apply.workable.com/api/v1/widget/accounts/${b.token}`,
    recruitee: `https://${b.token}.recruitee.com/api/offers/`,
  })[b.provider];

export const boardUrl = (b: Board) =>
  ({
    greenhouse: `https://boards.greenhouse.io/${b.token}`,
    ashby: `https://jobs.ashbyhq.com/${b.token}`,
    lever: `https://jobs.lever.co/${b.token}`,
    workable: `https://apply.workable.com/${b.token}`,
    recruitee: `https://${b.token}.recruitee.com`,
  })[b.provider];

export async function fetchJobs(board: Board): Promise<Job[]> {
  const res = await fetch(endpoint(board), { headers: UA, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  return mapJobs(board.provider, await res.json().catch(() => null)).filter((j) => j.title && j.url);
}

export function slugCandidates(account: Account): string[] {
  const root = rootOf(account.domain);
  const squashed = account.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const dashed = account.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return Array.from(new Set([root, squashed, dashed, `${squashed}hq`, `${squashed}labs`, `${squashed}inc`].filter((s) => s.length > 1)));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Whose board is this? Greenhouse, Workable and Recruitee say so in their own response.
// Ashby and Lever do not, so those need corroboration from the company itself.
async function boardOwner(b: Board): Promise<string | null> {
  const get = async (url: string) => {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8_000) });
    return res.ok ? ((await res.json().catch(() => null)) as Row | null) : null;
  };
  try {
    if (b.provider === "greenhouse") return String((await get(`https://boards-api.greenhouse.io/v1/boards/${b.token}`))?.name ?? "") || null;
    if (b.provider === "workable") return String((await get(endpoint(b)))?.name ?? "") || null;
    if (b.provider === "recruitee") return String(((await get(endpoint(b)))?.offers ?? [])[0]?.company_name ?? "") || null;
  } catch {
    // unknown owner
  }
  return null;
}

export function sameCompany(owner: string, account: Account): boolean {
  const a = squash(owner);
  const w = squash(account.name);
  return !!a && !!w && (a === w || a.startsWith(w) || w.startsWith(a));
}

// A guessed board is only accepted when it is provably the company's: the system names the owner,
// or the company's own site links to that exact board, or the name is the domain and the system is silent.
export async function plausible(board: Board, account: Account, careers: () => Promise<string>): Promise<boolean> {
  // Two companies can share a name and a slug. If the company's own site points at a different board, this is not theirs.
  const linked = boardFromHtml(await careers());
  if (linked && linked.token.toLowerCase() !== board.token.toLowerCase()) return false;

  const owner = await boardOwner(board);
  if (owner) return sameCompany(owner, account);
  if (linked) return true;
  return board.token === rootOf(account.domain) && !!account.domain;
}

// Last resort when no guessed name works: the careers page links to the system the company uses.
export function boardFromHtml(html: string): Board | null {
  const patterns: [Provider, RegExp][] = [
    ["greenhouse", /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i],
    ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9._-]+)/i],
    ["lever", /jobs\.lever\.co\/([a-z0-9_-]+)/i],
    ["workable", /apply\.workable\.com\/([a-z0-9_-]+)/i],
    ["recruitee", /([a-z0-9-]+)\.recruitee\.com/i],
  ];
  const skip = new Set(["embed", "jobs", "job", "careers", "api", "v1", "boards", "www"]);
  for (const [provider, re] of patterns) {
    const token = html.match(re)?.[1];
    if (token && !skip.has(token.toLowerCase())) return { provider, token };
  }
  return null;
}

async function careersHtml(domain: string | null): Promise<string> {
  const host = (domain ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) return "";
  // companies split this across pages (Clay links its board from /jobs but not /careers), so read them all
  const pages = await Promise.all(
    [`https://${host}/careers`, `https://careers.${host}`, `https://${host}/jobs`].map(async (page) => {
      try {
        const res = await fetch(page, { headers: UA, signal: AbortSignal.timeout(8_000) });
        return res.ok ? (await res.text()).slice(0, 800_000) : "";
      } catch {
        return "";
      }
    })
  );
  return pages.join("\n");
}

export async function discoverBoard(account: Account): Promise<Board | null> {
  const saved = account.meta?.jobBoard as Board | undefined;
  if (saved?.provider && saved.token) return saved;

  let html: Promise<string> | null = null;
  const careers = () => (html ??= careersHtml(account.domain));

  // 1. ask the applicant systems directly, every system at once, for each likely name in turn
  for (const token of slugCandidates(account)) {
    const hits = await Promise.all(PROVIDERS.map(async (provider) => ({ provider, token, n: (await fetchJobs({ provider, token }).catch(() => [])).length })));
    for (const h of hits.filter((x) => x.n > 0).sort((a, b) => b.n - a.n)) {
      if (await plausible({ provider: h.provider, token: h.token }, account, careers)) return { provider: h.provider, token: h.token };
    }
  }
  // 2. only then, look for the link on the company's own careers page
  const linked = boardFromHtml(await careers());
  if (linked && (await fetchJobs(linked)).length) return linked;
  return null;
}

const GTM = /\b(sales|account executive|account manager|sdr|bdr|revenue|growth|marketing|demand gen|customer success|partnerships?|go-to-market|gtm|business development|solutions engineer|sales engineer)\b/i;
const LEADER = /\b(head of|vp|vice president|chief|cro|cmo|director|general manager)\b/i;

export const isGtm = (j: Job) => GTM.test(j.title) || GTM.test(j.team);
export const isLeader = (title: string) => LEADER.test(title);

const plain = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ").toLowerCase().replace(/\s+/g, " ");

// Roles that are on the board but missing from the company's own careers page. That only means something
// when the page lists jobs in its HTML at all, so it is judged by how many of the board's titles it shows.
export function notOnCareersPage(jobs: Job[], html: string): Job[] {
  if (!html || jobs.length < 4) return [];
  const page = plain(html);
  const shown = (j: Job) => page.includes(plain(j.title));
  const coverage = jobs.filter(shown).length / jobs.length;
  return coverage >= 0.5 ? jobs.filter((j) => !shown(j)) : [];
}

export function jobFound(board: Board, jobs: Job[], now = Date.now(), careers = ""): Found[] {
  const gtm = jobs.filter(isGtm);
  const recent = gtm.filter((j) => j.publishedAt && daysAgo(j.publishedAt, now) <= 21);
  const out: Found[] = [];
  const week = Math.floor(now / (7 * 86_400_000));

  if (gtm.length >= 3) {
    out.push({
      kind: "hiring",
      source: "jobs",
      headline: `Hiring ${gtm.length} go-to-market roles`,
      summary: `Open now: ${gtm.slice(0, 3).map((j) => j.title).join("; ")}.${recent.length ? ` ${recent.length} posted in the last three weeks.` : ""} ${jobs.length} open roles in total, read from the job board.`,
      url: boardUrl(board),
      relevance: 0.85,
      urgency: recent.length >= 2 ? 0.75 : 0.6,
      detectedAt: new Date(now).toISOString(),
      dedupeKey: `jobs-${board.token}-w${week}`,
    });
  }
  for (const j of gtm.filter((x) => isLeader(x.title)).slice(0, 2)) {
    out.push({
      kind: "hiring",
      source: "jobs",
      headline: `Hiring a ${j.title}`,
      summary: "A senior go-to-market hire usually comes with a new plan and new tooling.",
      url: j.url,
      relevance: 0.88,
      urgency: 0.82,
      detectedAt: j.publishedAt && isFinite(Date.parse(j.publishedAt)) ? new Date(j.publishedAt).toISOString() : new Date(now).toISOString(),
      dedupeKey: j.url,
    });
  }
  const hidden = notOnCareersPage(jobs, careers).filter(isGtm);
  if (hidden.length) {
    out.push({
      kind: "hiring",
      source: "jobs",
      headline: `${hidden.length} go-to-market role${hidden.length > 1 ? "s are" : " is"} on the job board but not on the careers page`,
      summary: `${hidden.slice(0, 3).map((j) => j.title).join("; ")}. Found by reading the applicant system directly, so it is not visible from the company's own site.`,
      url: boardUrl(board),
      relevance: 0.86,
      urgency: 0.8,
      detectedAt: new Date(now).toISOString(),
      dedupeKey: `hidden-${board.token}-${hidden.map((h) => h.url).sort().join("|").length}-w${week}`,
    });
  }
  return out;
}

export async function jobSignals(account: Account): Promise<{ found: Found[]; board: Board | null }> {
  const board = await discoverBoard(account);
  if (!board) return { found: [], board: null };
  const [jobs, careers] = await Promise.all([fetchJobs(board), careersHtml(account.domain)]);
  return { found: jobFound(board, jobs, Date.now(), careers), board };
}
