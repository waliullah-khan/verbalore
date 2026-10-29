// Apify fills the gaps Firecrawl leaves: logged-in-only networks and engagement counts.
const BASE = "https://api.apify.com/v2";

export const hasApify = () => !!process.env.APIFY_TOKEN;

// Runs an actor and returns its dataset items. The sync endpoint waits up to five minutes.
export async function runActor<T = Record<string, unknown>>(
  actor: string,
  input: Record<string, unknown>,
  opts: { timeoutSecs?: number; limit?: number } = {}
): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  const id = actor.replace("/", "~");
  const qs = new URLSearchParams({ token, timeout: String(opts.timeoutSecs ?? 90), format: "json", clean: "true" });
  if (opts.limit) qs.set("limit", String(opts.limit));
  const res = await fetch(`${BASE}/acts/${id}/run-sync-get-dataset-items?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((opts.timeoutSecs ?? 90) * 1000 + 15_000),
  });
  if (!res.ok) throw new Error(`apify ${actor} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const items = (await res.json()) as T[];
  return Array.isArray(items) ? items : [];
}
