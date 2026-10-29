import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { isExpired } from "@/lib/capture";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // Next would otherwise cache the Supabase reads

// The phone reads the script from here, and the desktop polls it to see when a take has arrived.
// The token is the only credential, so nothing beyond this one session is ever returned.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const db = await serviceClient();
  const { data: s } = await db
    .from("vl_capture_sessions")
    .select("status,path,duration_s,expires_at,idea:vl_ideas(angle,script)")
    .eq("token", params.token)
    .maybeSingle();
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (isExpired(s)) return NextResponse.json({ error: "expired" }, { status: 410 });

  const idea = s.idea as unknown as { angle: string; script: { beats: { label: string; text: string }[] } } | null;
  let previewUrl: string | null = null;
  if (s.status === "uploaded" && s.path) {
    const signed = await db.storage.from("vl-recordings").createSignedUrl(s.path, 3600);
    previewUrl = signed.data?.signedUrl ?? null;
  }
  return NextResponse.json({
    status: s.status,
    title: idea?.angle ?? "",
    beats: idea?.script.beats ?? [],
    path: s.status === "uploaded" ? s.path : null,
    durationS: s.duration_s,
    previewUrl,
  });
}
