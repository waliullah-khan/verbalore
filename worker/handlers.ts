import type { SupabaseClient } from "@supabase/supabase-js";
import { generateIdeas, saveIdeas } from "../src/lib/ideas/generate";
import { isUseCase } from "../src/lib/usecases";
import { scanWorkspace } from "../src/lib/signals/engine";
import { publishVideo } from "./publish";
import { prepareVideo } from "./prepare";
import { finalizeVideo } from "./finalize";
import { runWriteScript } from "../src/lib/scripts/job";
import { onboardWorkspace } from "./onboard";

export type Job = { id: string; workspace_id: string | null; kind: string; payload: Record<string, any>; attempts: number }; // eslint-disable-line @typescript-eslint/no-explicit-any

type Handler = (db: SupabaseClient, job: Job) => Promise<Record<string, unknown>>;

export const handlers: Record<string, Handler> = {
  async generate_ideas(db, job) {
    const { data: ws } = await db.from("vl_workspaces").select("*").eq("id", job.workspace_id).single();
    if (!ws) throw new Error("workspace not found");
    const useCase = isUseCase(job.payload.useCase) ? job.payload.useCase : "general";
    const { ideas, notes, timings } = await generateIdeas(db, ws, job.payload.count ?? 5, useCase);
    await saveIdeas(db, ws.id, ideas, useCase);
    return { ideas: ideas.length, useCase, notes, timings };
  },

  // an edit is made in two stages: this one prepares it (plan, words, cut-out) and queues render_final, which renders it
  async render_video(db, job) {
    return prepareVideo(db, job.payload.videoId, job.payload.pool ?? null);
  },

  async render_final(db, job) {
    return finalizeVideo(db, job.payload.videoId);
  },

  async scan_signals(db, job) {
    return scanWorkspace(db, job.workspace_id as string, job.payload.accountIds);
  },

  async publish_video(db, job) {
    return publishVideo(db, job.payload.publishId);
  },

  async write_script(db, job) {
    return runWriteScript(db, job.payload as Parameters<typeof runWriteScript>[1]);
  },

  async onboard_workspace(db, job) {
    return onboardWorkspace(db, job);
  },
};

// Which lane runs what: preparing is mostly waiting on other services (many at once), rendering needs the CPU.
export const PREPARE_KINDS = ["render_video"];
export const FINAL_KINDS = ["render_final"];
export const RENDER_KINDS = [...PREPARE_KINDS, "render_note", ...FINAL_KINDS];
export const GENERAL_KINDS = Object.keys(handlers).filter((k) => !RENDER_KINDS.includes(k));
