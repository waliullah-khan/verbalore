const BASE = "https://api.upload-post.com/api";

export const PLATFORMS = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
  { id: "threads", label: "Threads" },
  { id: "pinterest", label: "Pinterest" },
  { id: "bluesky", label: "Bluesky" },
  { id: "reddit", label: "Reddit" },
  { id: "mastodon", label: "Mastodon" },
  { id: "telegram", label: "Telegram" },
  { id: "discord", label: "Discord" },
  { id: "google_business", label: "Google Business" },
  { id: "wordpress", label: "WordPress" },
] as const;

export const hasUploadPost = () => !!process.env.UPLOAD_POST_API_KEY;
export const profileName = (workspaceId: string) => `vl_${workspaceId.replace(/-/g, "").slice(0, 12)}`;

function headers() {
  return { Authorization: `Apikey ${process.env.UPLOAD_POST_API_KEY}` };
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(`upload-post ${res.status}: ${body.message ?? body.error ?? "request failed"}`);
  return body;
}

// A profile holds one customer's connected social accounts.
export async function ensureProfile(username: string) {
  const res = await fetch(`${BASE}/uploadposts/users`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (res.status === 409) return; // already exists
  if (!res.ok && res.status !== 400) await json(res);
}

export async function connectUrl(username: string, redirectUrl: string) {
  await ensureProfile(username);
  const res = await fetch(`${BASE}/uploadposts/users/generate-jwt`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ username, redirect_url: redirectUrl, connect_title: "Connect your accounts to Verbalore", platforms: PLATFORMS.map((p) => p.id) }),
  });
  const body = await json<{ access_url?: string }>(res);
  if (!body.access_url) throw new Error("no connect link returned");
  return body.access_url;
}

export async function connectedPlatforms(username: string): Promise<string[]> {
  const res = await fetch(`${BASE}/uploadposts/users/${encodeURIComponent(username)}`, { headers: headers() });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => ({}))) as { profile?: { social_accounts?: Record<string, unknown> } };
  const accounts = body.profile?.social_accounts ?? {};
  return Object.entries(accounts).filter(([, v]) => !!v && v !== "").map(([k]) => k);
}

export async function publish(input: { user: string; videoUrl: string; title: string; platforms: string[]; scheduledAt?: string | null }) {
  const form = new FormData();
  form.append("user", input.user);
  form.append("video", input.videoUrl);
  form.append("title", input.title.slice(0, 100));
  form.append("description", input.title);
  form.append("async_upload", "true");
  input.platforms.forEach((p) => form.append("platform[]", p));
  if (input.scheduledAt) form.append("scheduled_date", input.scheduledAt);
  const res = await fetch(`${BASE}/upload`, { method: "POST", headers: headers(), body: form, signal: AbortSignal.timeout(60_000) });
  const body = await json<{ request_id?: string; job_id?: string }>(res);
  return body.request_id ?? body.job_id ?? "";
}

export type UploadStatus = { status: string; results: Record<string, { success?: boolean; url?: string; error?: string }> };

export async function status(requestId: string): Promise<UploadStatus> {
  const res = await fetch(`${BASE}/uploadposts/status?request_id=${encodeURIComponent(requestId)}`, { headers: headers() });
  const body = await json<{ status?: string; results?: UploadStatus["results"]; completed?: number; total?: number }>(res);
  return { status: body.status ?? "processing", results: body.results ?? {} };
}

// The connected accounts of a profile with the name each one shows, for example { linkedin: "Priya Raman" }.
export async function connectedAccounts(username: string): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/uploadposts/users/${encodeURIComponent(username)}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return {};
  const body = (await res.json().catch(() => ({}))) as { profile?: { social_accounts?: Record<string, unknown> } };
  const out: Record<string, string> = {};
  for (const [platform, v] of Object.entries(body.profile?.social_accounts ?? {})) {
    if (!v) continue;
    const o = typeof v === "object" ? (v as { display_name?: string; username?: string }) : null;
    out[platform] = (o?.display_name || o?.username || "").trim() || "connected";
  }
  return out;
}
