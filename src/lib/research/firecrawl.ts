const BASE = "https://api.firecrawl.dev/v2";

export type WebHit = { url: string; title: string; description: string; markdown?: string };

function headers() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export const hasFirecrawl = () => !!process.env.FIRECRAWL_API_KEY;

// Firecrawl answers 200 with success:false for refused calls, so check the body too.
async function post<T>(path: string, body: unknown, timeoutMs = 60_000): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string } & T;
  if (!res.ok || json.success === false) throw new Error(`firecrawl ${path} ${res.status}: ${json.error ?? "failed"}`);
  return json;
}

export async function webSearch(query: string, opts: { limit?: number; tbs?: string; scrape?: boolean; timeoutMs?: number } = {}): Promise<WebHit[]> {
  const body: Record<string, unknown> = { query, limit: opts.limit ?? 8, sources: ["web"] };
  if (opts.tbs) body.tbs = opts.tbs;
  if (opts.scrape) body.scrapeOptions = { formats: ["markdown"], onlyMainContent: true };
  const json = await post<{ data?: { web?: WebHit[] } | WebHit[] }>("/search", body, opts.timeoutMs);
  const data = json.data;
  const hits = Array.isArray(data) ? data : data?.web ?? [];
  return hits.map((h) => ({ url: h.url, title: h.title ?? "", description: h.description ?? "", markdown: h.markdown }));
}

export async function scrapePage(url: string, opts: { changeTracking?: boolean } = {}) {
  const formats: unknown[] = ["markdown"];
  if (opts.changeTracking) formats.push({ type: "changeTracking", modes: ["git-diff"] });
  const json = await post<{ data?: { markdown?: string; metadata?: Record<string, unknown>; changeTracking?: { changeStatus?: string; diff?: { text?: string } } } }>(
    "/scrape",
    { url, formats, onlyMainContent: true }
  );
  return {
    markdown: json.data?.markdown ?? "",
    title: String(json.data?.metadata?.title ?? ""),
    change: json.data?.changeTracking,
  };
}
