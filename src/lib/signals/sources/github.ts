import { daysAgo, rootOf, type Account, type Found } from "./types";

const headers = (): Record<string, string> => ({
  "User-Agent": "verbalore-research",
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

type Org = { login: string; name?: string | null; blog?: string | null };
type Repo = { name: string; html_url: string; description: string | null; created_at: string; fork: boolean; archived: boolean };

// A guessed organisation is only accepted when it points back at the company's own website.
export function orgIsTheCompany(org: Org, account: Account): boolean {
  const root = rootOf(account.domain);
  const blog = (org.blog ?? "").toLowerCase();
  if (root && blog.includes(root)) return true;
  return !!org.name && org.name.toLowerCase().replace(/[^a-z0-9]/g, "") === account.name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function repoFound(repo: Repo, now = Date.now()): Found | null {
  // ".github" is an organisation profile, not a project
  if (repo.fork || repo.archived || repo.name.startsWith(".") || daysAgo(repo.created_at, now) > 45) return null;
  return {
    kind: "launch",
    source: "github",
    headline: `Opened a new public repo: ${repo.name}`,
    summary: (repo.description ?? "A new open source project from the company's engineering team.").slice(0, 200),
    url: repo.html_url,
    relevance: 0.7,
    urgency: 0.62,
    detectedAt: repo.created_at,
    dedupeKey: repo.html_url,
  };
}

export async function githubSignals(account: Account): Promise<Found[]> {
  const root = rootOf(account.domain);
  const name = account.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const slug of Array.from(new Set([root, name].filter(Boolean)))) {
    const res = await fetch(`https://api.github.com/orgs/${slug}`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) continue;
    if (!orgIsTheCompany((await res.json()) as Org, account)) continue;
    const repos = await fetch(`https://api.github.com/orgs/${slug}/repos?sort=created&direction=desc&per_page=6&type=public`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    if (!repos.ok) return [];
    return ((await repos.json()) as Repo[]).map((r) => repoFound(r)).filter((f): f is Found => !!f).slice(0, 2);
  }
  return [];
}
