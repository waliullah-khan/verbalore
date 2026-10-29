import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { enqueue } from "@/lib/jobs";
import { sendDigest } from "@/lib/email/digest";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // Next would otherwise cache the Supabase reads
export const maxDuration = 60;

// Vercel Cron calls this with the CRON_SECRET as a bearer token.
//   /api/cron/generate  queues fresh ideas for every workspace
//   /api/cron/digest    emails each workspace its top ideas
export async function GET(req: Request, { params }: { params: { task: string } }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await serviceClient();
  const { data: workspaces } = await db.from("vl_workspaces").select("id,name,digest_email,is_demo");
  const out: Record<string, unknown>[] = [];

  for (const ws of workspaces ?? []) {
    if (params.task === "generate") {
      await enqueue(db, ws.id, "generate_ideas", { count: 5, useCase: ws.is_demo ? "gtm" : "general" });
      out.push({ workspace: ws.id, queued: true });
    } else if (params.task === "digest") {
      out.push({ workspace: ws.id, ...(await sendDigest(db, ws)) });
    }
  }
  if (params.task !== "generate" && params.task !== "digest") return NextResponse.json({ error: "unknown task" }, { status: 404 });
  return NextResponse.json({ ok: true, results: out });
}
