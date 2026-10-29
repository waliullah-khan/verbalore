import type { SupabaseClient } from "@supabase/supabase-js";
import type { Scene, Word } from "./plan";

// An edit is made in two stages that can run on different machines: "prepare" (download, normalise, transcribe, plan,
// cut out the speaker; mostly waiting on other services) and "render" (headless Chrome; the part that needs the CPU).
// Whatever the render needs travels between them through this work area in the private recordings bucket.
export const WORK_BUCKET = "vl-recordings";
export const workDir = (videoId: string) => `_work/${videoId}`;
export const WORK_FILES = ["prepared.json", "talk.mp4", "matte.webm"] as const;

export type Prepared = {
  v: 1;
  secs: number;
  words: Word[];
  via: string;
  planVia: string;
  scenes: Scene[];
  theme: string;
  matte: { label: string; ms: number; from: "cache" | "work" | "none" };
  timings: Record<string, number>;
  prepMs: number;
  preparedAt: number;
};

export async function putWork(db: SupabaseClient, videoId: string, name: (typeof WORK_FILES)[number], body: Buffer | string, contentType: string) {
  const data = typeof body === "string" ? Buffer.from(body) : body;
  const res = await db.storage.from(WORK_BUCKET).upload(`${workDir(videoId)}/${name}`, data, { contentType, upsert: true });
  if (res.error) throw new Error(`could not save ${name} for the render: ${res.error.message}`);
}

export async function getWork(db: SupabaseClient, videoId: string, name: (typeof WORK_FILES)[number]): Promise<Buffer | null> {
  const res = await db.storage.from(WORK_BUCKET).download(`${workDir(videoId)}/${name}`);
  if (res.error || !res.data) return null;
  return Buffer.from(await res.data.arrayBuffer());
}

export async function clearWork(db: SupabaseClient, videoId: string) {
  await db.storage.from(WORK_BUCKET).remove(WORK_FILES.map((n) => `${workDir(videoId)}/${n}`)).catch(() => undefined);
}
