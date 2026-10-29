export type SignalKind = "funding" | "leadership" | "hiring" | "launch" | "filing" | "change" | "permit" | "market" | "custom";

// Where a signal was found. Everything except "news" is read at the source, which is why it can
// show up before a press story or a social post exists.
export type Source = "news" | "sec" | "jobs" | "site" | "github" | "permits";

export type Account = { id: string; name: string; domain: string | null; meta?: Record<string, unknown> | null };

export type Found = {
  kind: SignalKind;
  source: Source;
  headline: string;
  summary: string;
  url: string;
  relevance: number;
  urgency: number;
  detectedAt: string;
  // what makes this the same signal next time; defaults to the URL
  dedupeKey?: string;
  // structured detail, for example the builder a permit signal is about
  meta?: Record<string, unknown>;
};

export const URGENCY: Record<SignalKind, number> = { funding: 0.9, leadership: 0.85, filing: 0.85, launch: 0.7, change: 0.65, hiring: 0.6, permit: 0.8, market: 0.7, custom: 0.65 };

export const SOURCE_LABEL: Record<Source, string> = { news: "News", sec: "SEC filing", jobs: "Job board", site: "Site change", github: "GitHub", permits: "City permits" };

// Read at the source rather than reported by someone else.
export const isPrimary = (s: string) => s !== "news";

export const DAY = 86_400_000;
export const daysAgo = (iso: string, now = Date.now()) => Math.max(0, (now - Date.parse(iso)) / DAY);
export const rootOf = (domain: string | null) => (domain ?? "").toLowerCase().replace(/^www\./, "").split(".")[0];
