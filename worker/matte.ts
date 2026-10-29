import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminWorkspace } from "./admin";

// Cuts the speaker out of a recording so the edit can put graphics behind and around them (the cutout layout).
// The result is a VP9 WebM with alpha, cached beside the recording as `<recording.path>.alpha.webm`.
// Every failure returns "none:<reason>" and the render carries on with the stage + deck layout, so this never breaks an edit.

const run = promisify(execFile);

const BUCKET = "vl-recordings";
const API = "https://api.replicate.com/v1";
// arielreplicate/robust_video_matting: about a minute of GPU for a 30 s clip, a fraction of a cent
export const RVM_VERSION = "73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac";
export const MAX_SECONDS = 60;
export const POLL_TIMEOUT_MS = 240_000;
export const MATTE_FILE_REL = "assets/matte.webm";

export const cachedPath = (recordingPath: string) => `${recordingPath}.alpha.webm`;

// --- pure pieces (tested) ---

export type MatteInput = { cached: boolean; hasToken: boolean; secs: number; usedToday: number; dailyLimit: number; admin: boolean };
export type MatteChoice = { use: "cached" } | { use: "fresh" } | { use: "skip"; reason: string };

export function decideMatte(i: MatteInput): MatteChoice {
  if (i.cached) return { use: "cached" };
  if (!i.hasToken) return { use: "skip", reason: "no-token" };
  if (!(i.secs > 0)) return { use: "skip", reason: "no-duration" };
  if (i.secs > MAX_SECONDS) return { use: "skip", reason: "too-long" };
  if (!i.admin && i.usedToday >= i.dailyLimit) return { use: "skip", reason: "daily-limit" };
  return { use: "fresh" };
}

// MATTE_DAILY_LIMIT: unset or invalid means 10 a day per workspace; 0 turns fresh mattes off for everyone but admins
export function dailyLimit(raw = process.env.MATTE_DAILY_LIMIT): number {
  if (raw === undefined || raw.trim() === "") return 10;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 10;
}

export function redact(text: string, token?: string): string {
  return token ? text.split(token).join("***") : text;
}

// the mask is a grayscale video with the clip's own frame count; it becomes the alpha channel of the clip
export function mergeArgs(clip: string, mask: string, out: string): string[] {
  return [
    "-y", "-loglevel", "error", "-i", clip, "-i", mask,
    "-filter_complex", "[1:v]format=gray,scale=720:1280[m];[0:v]scale=720:1280[v];[v][m]alphamerge",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-crf", "26", "-b:v", "0",
    "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", out,
  ];
}

export type Deps = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export const realDeps: Deps = {
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); }, { once: true });
    }),
};

type Prediction = { id?: string; status?: string; output?: unknown; error?: string | null; urls?: { get?: string; cancel?: string } };

function outputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  return undefined;
}

// Creates the prediction and waits for it, backing off from 3 s to 10 s. Throws a short reason on any failure.
export async function runPrediction(
  token: string,
  input: Record<string, unknown>,
  deps: Deps,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? POLL_TIMEOUT_MS;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const start = deps.now();

  const created = await deps.fetch(`${API}/predictions`, {
    method: "POST",
    headers: { ...headers, Prefer: "wait=20" },
    body: JSON.stringify({ version: RVM_VERSION, input }),
    signal: opts.signal,
  });
  if (!created.ok) throw new Error(`replicate create ${created.status}`);
  let p = (await created.json()) as Prediction;
  if (!p.id) throw new Error("replicate returned no id");
  const getUrl = p.urls?.get ?? `${API}/predictions/${p.id}`;

  const cancel = async () => {
    try {
      await deps.fetch(p.urls?.cancel ?? `${API}/predictions/${p.id}/cancel`, { method: "POST", headers });
    } catch {
      // best effort: it stops the spend, nothing else depends on it
    }
  };

  let delay = 3000;
  let transient = 0;
  for (;;) {
    if (p.status === "succeeded") {
      const url = outputUrl(p.output);
      if (!url) throw new Error("replicate returned no output");
      return url;
    }
    if (p.status === "failed" || p.status === "canceled") throw new Error(`replicate ${p.status}: ${String(p.error ?? "").slice(0, 160)}`);
    if (opts.signal?.aborted) { await cancel(); throw new Error("aborted"); }
    if (deps.now() - start > timeoutMs) { await cancel(); throw new Error("timeout"); }
    try {
      await deps.sleep(delay, opts.signal);
    } catch {
      await cancel();
      throw new Error("aborted");
    }
    delay = Math.min(Math.round(delay * 1.5), 10_000);

    const res = await deps.fetch(getUrl, { headers, signal: opts.signal });
    if (!res.ok) {
      // a busy API or a rate limit is worth waiting out a few times; anything else is final
      if ((res.status === 429 || res.status >= 500) && ++transient <= 5) continue;
      throw new Error(`replicate poll ${res.status}`);
    }
    transient = 0;
    p = (await res.json()) as Prediction;
  }
}

// --- the step the render calls ---

export type MatteResult = { file?: string; label: string; ms: number };

export type MatteArgs = {
  db: SupabaseClient;
  recordingPath: string;
  normalisedPath: string; // the 720x1280 clip the edit is built from
  dest: string; // where the matte should be written for the composition
  workspaceId: string;
  videoId: string;
  secs: number;
  log?: (msg: string) => void;
  signal?: AbortSignal;
};

async function freshToday(db: SupabaseClient, workspaceId: string, videoId: string): Promise<number> {
  const { count } = await db
    .from("vl_videos")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("id", videoId)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
    .or("transcript->>matte.eq.fresh,transcript->>matte.eq.pending");
  return count ?? 0;
}

// claim the slot before the slow work, so edits running at the same moment count each other
async function markPending(db: SupabaseClient, videoId: string) {
  const { data } = await db.from("vl_videos").select("transcript").eq("id", videoId).maybeSingle();
  await db.from("vl_videos").update({ transcript: { ...((data?.transcript as Record<string, unknown> | null) ?? {}), matte: "pending" } }).eq("id", videoId);
}

export async function mergeMatte(clip: string, mask: string, out: string) {
  await run("ffmpeg", mergeArgs(clip, mask, out), { maxBuffer: 10 * 1024 * 1024 });
}

export async function ensureMatte(a: MatteArgs): Promise<MatteResult> {
  const t0 = Date.now();
  const log = a.log ?? (() => {});
  const token = process.env.REPLICATE_API_TOKEN;
  const done = (file: string | undefined, label: string): MatteResult => ({ file, label, ms: Date.now() - t0 });
  const maskFile = `${a.dest}.mask.mp4`;
  let temp: string | undefined;
  try {
    // a local file wins, for testing without any storage or API
    const override = process.env.MATTE_FILE;
    if (override) {
      await writeFile(a.dest, await readFile(override));
      return done(MATTE_FILE_REL, "override");
    }

    const got = await a.db.storage.from(BUCKET).download(cachedPath(a.recordingPath));
    if (!got.error && got.data) {
      await writeFile(a.dest, Buffer.from(await got.data.arrayBuffer()));
      return done(MATTE_FILE_REL, "cached");
    }

    const admin = await isAdminWorkspace(a.db, a.workspaceId);
    const used = token && !admin ? await freshToday(a.db, a.workspaceId, a.videoId) : 0;
    const choice = decideMatte({ cached: false, hasToken: !!token, secs: a.secs, usedToday: used, dailyLimit: dailyLimit(), admin });
    if (choice.use !== "fresh") {
      const reason = choice.use === "skip" ? choice.reason : "unexpected";
      log(`no cutout: ${reason}`);
      return done(undefined, `none:${reason}`);
    }

    await markPending(a.db, a.videoId);
    temp = `_matte-tmp/${randomUUID()}.mp4`;
    const up = await a.db.storage.from(BUCKET).upload(temp, await readFile(a.normalisedPath), { contentType: "video/mp4" });
    if (up.error) throw new Error(`temp upload: ${up.error.message}`);
    const signed = await a.db.storage.from(BUCKET).createSignedUrl(temp, 900);
    if (signed.error || !signed.data?.signedUrl) throw new Error("could not sign the clip");

    const url = await runPrediction(token as string, { input_video: signed.data.signedUrl, output_type: "alpha-mask" }, realDeps, { signal: a.signal });
    const res = await fetch(url, { signal: a.signal });
    if (!res.ok) throw new Error(`mask download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 1000) throw new Error("mask was empty");
    await writeFile(maskFile, bytes);
    await mergeMatte(a.normalisedPath, maskFile, a.dest);

    // kept beside the recording, so editing again costs nothing
    const store = await a.db.storage.from(BUCKET).upload(cachedPath(a.recordingPath), await readFile(a.dest), { contentType: "video/webm", upsert: true });
    if (store.error) log(`could not cache the cutout: ${store.error.message}`);
    return done(MATTE_FILE_REL, "fresh");
  } catch (err) {
    const reason = redact((err as Error).message ?? "error", token).slice(0, 120);
    log(`no cutout: ${reason}`);
    return done(undefined, `none:${reason === "aborted" ? "aborted" : "error"}`);
  } finally {
    await rm(maskFile, { force: true }).catch(() => {});
    if (temp) await a.db.storage.from(BUCKET).remove([temp]).catch(() => {});
  }
}
