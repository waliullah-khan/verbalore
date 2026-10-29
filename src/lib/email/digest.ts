import type { SupabaseClient } from "@supabase/supabase-js";
import { esc, sendEmail } from "./resend";
import { playbook } from "../usecases";
import type { Idea } from "../ideas/types";

type Row = Idea & { id: string; use_case: string; day: string };

export async function topIdeas(db: SupabaseClient, workspaceId: string, n = 5): Promise<Row[]> {
  const { data } = await db.from("vl_ideas").select("*").eq("workspace_id", workspaceId).neq("status", "note").order("created_at", { ascending: false }).limit(40);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return [];
  const day = rows[0].day;
  return rows.filter((r) => r.day === day).sort((a, b) => b.score - a.score).slice(0, n);
}

export function digestHtml(workspace: string, ideas: Row[], base: string): string {
  const cards = ideas
    .map(
      (i) => `
      <tr><td style="padding:16px 0;border-top:1px solid #ded3bd">
        <div style="font:600 12px Arial;letter-spacing:.12em;text-transform:uppercase;color:#c2410c">${esc(playbook(i.use_case).label)} · ${i.script.totalSeconds}s</div>
        <div style="font:600 20px Georgia,serif;color:#14110f;margin:6px 0">${esc(i.hook)}</div>
        <div style="font:14px Arial;color:#5b5348;margin-bottom:10px">${esc(i.why_now)}</div>
        <a href="${base}/ideas/${i.id}" style="display:inline-block;background:#c2410c;color:#fff;font:600 14px Arial;padding:10px 18px;border-radius:999px;text-decoration:none">Make this video</a>
      </td></tr>`
    )
    .join("");
  return `<div style="max-width:560px;margin:0 auto;padding:24px;background:#f6f1e7">
    <div style="font:700 22px Georgia,serif;color:#14110f">Verbalore</div>
    <div style="font:14px Arial;color:#5b5348;margin:4px 0 12px">Today's ideas for ${esc(workspace)}. Pick one and the script is ready on the teleprompter.</div>
    <table width="100%" cellpadding="0" cellspacing="0">${cards}</table></div>`;
}

export async function sendDigest(db: SupabaseClient, ws: { id: string; name: string; digest_email: string | null }, fallbackTo?: string) {
  const to = ws.digest_email ?? fallbackTo;
  if (!to) return { sent: false as const, reason: "no address" };
  const ideas = await topIdeas(db, ws.id);
  if (!ideas.length) return { sent: false as const, reason: "no ideas yet" };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await sendEmail({ to, subject: `${ideas.length} video ideas for today`, html: digestHtml(ws.name, ideas, base) });
  return { sent: true as const, simulated: res.simulated, ideas: ideas.length, to };
}
