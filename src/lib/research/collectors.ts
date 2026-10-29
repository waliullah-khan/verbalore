import fixtures from "../../../fixtures/research.json";
import { runActor, hasApify } from "./apify";
import { webSearch, hasFirecrawl } from "./firecrawl";
import type { CollectResult, Platform, Post } from "./types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
const iso = (v: unknown) => {
  const t = typeof v === "number" ? (v > 1e12 ? v : v * 1000) : Date.parse(String(v ?? ""));
  return isFinite(t) ? new Date(t).toISOString() : null;
};
const clip = (s: unknown, n = 600) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// Reddit blocks most server IPs on its public JSON, so Apify takes over when that happens.
async function redditViaApify(topic: string): Promise<Post[]> {
  const rows = await runActor<Row>("trudax/reddit-scraper-lite", { searches: [topic], sort: "top", time: "month", maxItems: 10, searchPosts: true, searchComments: false, searchCommunities: false, searchUsers: false }, { limit: 10 });
  return rows
    .filter((r) => r.url)
    .map((r) => ({
      id: `reddit:${r.id ?? r.url}`,
      platform: "reddit" as const,
      url: r.url,
      author: r.username ?? "",
      title: clip(r.title, 160),
      text: clip(r.body),
      engagement: num(r.upVotes) + 2 * num(r.numberOfComments),
      postedAt: iso(r.createdAt),
      kind: "thread" as const,
    }));
}

async function reddit(topic: string): Promise<Post[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=top&t=month&limit=12`;
  const res = await fetch(url, { headers: { "User-Agent": "verbalore/0.1 (research)" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    if (hasApify()) return redditViaApify(topic);
    throw new Error(`reddit ${res.status}`);
  }
  const json = (await res.json()) as { data: { children: { data: Row }[] } };
  return json.data.children.map(({ data: d }) => ({
    id: `reddit:${d.id}`,
    platform: "reddit" as const,
    url: `https://www.reddit.com${d.permalink}`,
    author: d.author,
    title: clip(d.title, 160),
    text: clip(d.selftext),
    engagement: num(d.score) + 2 * num(d.num_comments),
    postedAt: iso(d.created_utc),
    kind: "thread" as const,
  }));
}

async function hn(topic: string): Promise<Post[]> {
  const since = Math.floor(Date.now() / 1000) - 30 * 86_400;
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=10`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`hn ${res.status}`);
  const json = (await res.json()) as { hits: Row[] };
  return json.hits.map((h) => ({
    id: `hn:${h.objectID}`,
    platform: "hn" as const,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    author: h.author,
    title: clip(h.title, 160),
    text: "",
    engagement: num(h.points) + 2 * num(h.num_comments),
    postedAt: iso(h.created_at),
    kind: "thread" as const,
  }));
}

async function youtube(topic: string): Promise<Post[]> {
  const rows = await runActor<Row>("streamers/youtube-scraper", { searchQueries: [topic], maxResults: 8, maxResultsShorts: 0, maxResultStreams: 0 }, { limit: 8 });
  return rows.map((r) => ({
    id: `youtube:${r.id}`,
    platform: "youtube" as const,
    url: r.url,
    author: r.channelName ?? "",
    title: clip(r.title, 160),
    text: clip(r.text ?? r.description, 400),
    engagement: num(r.viewCount) / 20 + num(r.likes) + 3 * num(r.commentsCount),
    postedAt: iso(r.date),
    kind: "video" as const,
  }));
}

async function tiktok(topic: string): Promise<Post[]> {
  const rows = await runActor<Row>("clockworks/tiktok-scraper", { searchQueries: [topic], resultsPerPage: 8, searchSection: "/video" }, { limit: 8 });
  return rows.map((r) => ({
    id: `tiktok:${r.id}`,
    platform: "tiktok" as const,
    url: r.webVideoUrl,
    author: r.authorMeta?.name ?? "",
    title: clip(r.text, 160),
    text: clip(r.text),
    engagement: num(r.diggCount) + 2 * num(r.commentCount) + 3 * num(r.shareCount),
    postedAt: iso(r.createTimeISO ?? r.createTime),
    kind: "video" as const,
  }));
}

async function instagram(topic: string): Promise<Post[]> {
  const tag = topic.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rows = await runActor<Row>("apify/instagram-hashtag-scraper", { hashtags: [tag], resultsType: "posts", resultsLimit: 8 }, { limit: 8 });
  return rows.map((r) => ({
    id: `instagram:${r.id}`,
    platform: "instagram" as const,
    url: r.url,
    author: r.ownerUsername ?? "",
    title: clip(r.caption, 160),
    text: clip(r.caption),
    engagement: num(r.likesCount) + 2 * num(r.commentsCount) + num(r.videoPlayCount) / 20,
    postedAt: iso(r.timestamp),
    kind: r.type === "Video" ? ("video" as const) : ("post" as const),
  }));
}

async function linkedin(topic: string): Promise<Post[]> {
  const rows = await runActor<Row>("harvestapi/linkedin-post-search", { searchQueries: [topic], maxPosts: 8, sortBy: "relevance" }, { limit: 8 });
  return rows.map((r) => ({
    id: `linkedin:${r.id ?? r.linkedinUrl}`,
    platform: "linkedin" as const,
    url: r.linkedinUrl ?? r.url,
    author: r.author?.name ?? "",
    title: clip(r.content, 160),
    text: clip(r.content),
    engagement: num(r.engagement?.likes) + 3 * num(r.engagement?.comments) + 2 * num(r.engagement?.shares),
    postedAt: iso(r.postedAt?.timestamp ?? r.postedAt),
    kind: "post" as const,
  }));
}

// Facebook has no open search, so this goes through web search and has no engagement counts.
async function facebook(topic: string): Promise<Post[]> {
  const hits = await webSearch(`site:facebook.com ${topic}`, { limit: 6, tbs: "qdr:m" });
  return hits.map((h, i) => ({
    id: `facebook:${h.url}`,
    platform: "facebook" as const,
    url: h.url,
    author: "",
    title: clip(h.title, 160),
    text: clip(h.description),
    engagement: 10 - i,
    postedAt: null,
    kind: "post" as const,
  }));
}

const collectors: Record<string, { run: (t: string) => Promise<Post[]>; needs: "apify" | "firecrawl" | null }> = {
  reddit: { run: reddit, needs: null },
  hn: { run: hn, needs: null },
  youtube: { run: youtube, needs: "apify" },
  tiktok: { run: tiktok, needs: "apify" },
  instagram: { run: instagram, needs: "apify" },
  linkedin: { run: linkedin, needs: "apify" },
  facebook: { run: facebook, needs: "firecrawl" },
};

function fixtureFor(platform: Platform): Post[] {
  return (fixtures.posts as Post[]).filter((p) => p.platform === platform).map((p) => ({ ...p, synthetic: true }));
}

export async function collect(platform: Platform, topic: string): Promise<CollectResult> {
  const c = collectors[platform];
  const ready = c && (c.needs === null || (c.needs === "apify" ? hasApify() : hasFirecrawl()));
  if (ready) {
    try {
      const posts = (await c.run(topic)).filter((p) => p.url);
      if (posts.length) return { platform, posts, usedFixture: false };
    } catch (err) {
      return { platform, posts: fixtureFor(platform), usedFixture: true, error: (err as Error).message };
    }
  }
  return { platform, posts: fixtureFor(platform), usedFixture: true };
}

export const PLATFORMS: Platform[] = ["reddit", "hn", "youtube", "tiktok", "instagram", "linkedin", "facebook"];

export async function collectAll(topic: string, platforms: Platform[] = PLATFORMS) {
  return Promise.all(platforms.map((p) => collect(p, topic)));
}
