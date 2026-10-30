import { PLATFORMS } from "./uploadpost";

export type StudioPlatform = { id: string; name: string; limit: number; title?: boolean };

// The five the design shows first. Every other platform appears once an account on it is connected.
export const MAIN_PLATFORMS: StudioPlatform[] = [
  { id: "linkedin", name: "LinkedIn", limit: 3000 },
  { id: "youtube", name: "YouTube Shorts", limit: 100, title: true },
  { id: "instagram", name: "Instagram Reels", limit: 2200 },
  { id: "facebook", name: "Facebook", limit: 2200 },
  { id: "tiktok", name: "TikTok", limit: 2200 },
];

const OTHER_LIMITS: Record<string, number> = {
  x: 280, threads: 500, bluesky: 300, pinterest: 500, reddit: 300, mastodon: 500,
  telegram: 4096, discord: 2000, google_business: 1500, wordpress: 5000,
};

export function platformsFor(connected: string[]): StudioPlatform[] {
  const main = new Set(MAIN_PLATFORMS.map((p) => p.id));
  const extra = PLATFORMS.filter((p) => !main.has(p.id) && connected.includes(p.id)).map((p) => ({
    id: p.id,
    name: p.label as string,
    limit: OTHER_LIMITS[p.id] ?? 2200,
  }));
  return [...MAIN_PLATFORMS, ...extra];
}

export const platformName = (id: string) =>
  MAIN_PLATFORMS.find((p) => p.id === id)?.name ?? PLATFORMS.find((p) => p.id === id)?.label ?? id;
