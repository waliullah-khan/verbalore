import type { SupabaseClient } from "@supabase/supabase-js";
import { generateIdeas, saveIdeas } from "../src/lib/ideas/generate";
import { isUseCase } from "../src/lib/usecases";
import { scanWorkspace } from "../src/lib/signals/engine";
import { publishVideo } from "./publish";
import { renderVideo } from "./render";

export type Job = { id: string; workspace_id: string | null; kind: string; payload: Record<string, any>; attempts: number }; // eslint-disable-line @typescript-eslint/no-explicit-any

type Handler = (db: SupabaseClient, job: Job) => Promise<Record<string, unknown>>;

export const handlers: Record<string, Handler> = {
  async generate_ideas(db, job) {
    const { data: ws } = await db.from("vl_workspaces").select("*").eq("id", job.workspace_id).single();
    if (!ws) throw new Error("workspace not found");
    const useCase = isUseCase(job.payload.useCase) ? job.payload.useCase : "general";
    const { ideas, notes } = await generateIdeas(db, ws, job.payload.count ?? 5, useCase);
    await saveIdeas(db, ws.id, ideas, useCase);
    return { ideas: ideas.length, useCase, notes };
  },

  async render_video(db, job) {
    return renderVideo(db, job.payload.videoId);
  },

  async scan_signals(db, job) {
    return scanWorkspace(db, job.workspace_id as string, job.payload.accountIds);
  },

  async publish_video(db, job) {
    return publishVideo(db, job.payload.publishId);
  },
};

export const RENDER_KINDS = ["render_video", "render_note"];
export const GENERAL_KINDS = Object.keys(handlers).filter((k) => !RENDER_KINDS.includes(k));
