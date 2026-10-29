import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { extOf, isExpired } from "@/lib/capture";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // Next would otherwise cache the Supabase reads

// Two steps, so the video never passes through this server:
//   sign  -> a one-time upload URL for a path inside this session's own folder
//   done  -> mark the take as received once the phone has finished uploading
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = (await req.json().catch(() => ({}))) as { step?: string; ext?: string; path?: string; durationS?: number };
  const db = await serviceClient();
  const { data: s } = await db.from("vl_capture_sessions").select("id,workspace_id,idea_id,expires_at,status").eq("token", params.token).maybeSingle();
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (isExpired(s)) return NextResponse.json({ error: "expired" }, { status: 410 });

  const folder = `${s.workspace_id}/${s.idea_id}/`;

  if (body.step === "sign") {
    const path = `${folder}phone-${Date.now()}.${extOf(body.ext)}`;
    const { data, error } = await db.storage.from("vl-recordings").createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: error?.message ?? "could not sign" }, { status: 500 });
    await db.from("vl_capture_sessions").update({ status: "uploading" }).eq("id", s.id);
    return NextResponse.json({ path, token: data.token });
  }

  if (body.step === "done") {
    const path = String(body.path ?? "");
    if (!path.startsWith(folder + "phone-")) return NextResponse.json({ error: "bad path" }, { status: 400 });
    await db
      .from("vl_capture_sessions")
      .update({ status: "uploaded", path, duration_s: Math.max(0, Number(body.durationS) || 0) })
      .eq("id", s.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown step" }, { status: 400 });
}
