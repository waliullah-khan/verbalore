export type Platform = "reddit" | "hn" | "youtube" | "tiktok" | "instagram" | "linkedin" | "facebook" | "web";

export type Post = {
  id: string;
  platform: Platform;
  url: string;
  author: string;
  title: string;
  text: string;
  engagement: number; // likes + comments + views weighted by the collector
  postedAt: string | null;
  kind: "video" | "post" | "thread" | "ad" | "article";
  synthetic?: boolean; // true when it comes from fixtures, never shown as real
  score?: number;
};

export type CollectResult = { platform: Platform; posts: Post[]; error?: string; usedFixture: boolean };
