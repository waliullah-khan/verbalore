import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { supabaseServer } from "@/lib/supabase/server";
import { isInviteToken } from "@/lib/access";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// An approved person's personal link. It signs them in on the server, so it does not depend on
// the email provider or on which addresses Supabase Auth allows as redirects.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const origin = new URL(req.url).origin;
  const fail = () => NextResponse.redirect(`${origin}/login?error=link`);
  if (!isInviteToken(params.token)) return fail();

  const db = await serviceClient();
  const { data: r } = await db
    .from("vl_access_requests")
    .select("email,status,invite_expires_at")
    .eq("invite_token", params.token)
    .maybeSingle();
  if (!r || r.status !== "approved" || !r.invite_expires_at || new Date(r.invite_expires_at) < new Date()) return fail();

  const link = await db.auth.admin.generateLink({ type: "magiclink", email: r.email });
  const hash = link.data?.properties?.hashed_token;
  if (!hash) return fail();

  const { error } = await supabaseServer().auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  return error ? fail() : NextResponse.redirect(`${origin}/ideas`);
}
