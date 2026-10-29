import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// One click into the seeded demo workspace. The demo user only has access to synthetic data.
export async function GET(req: Request) {
  const db = supabaseServer();
  const { error } = await db.auth.signInWithPassword({
    email: process.env.DEMO_USER_EMAIL!,
    password: process.env.DEMO_USER_PASSWORD!,
  });
  const base = new URL(req.url).origin;
  return NextResponse.redirect(`${base}${error ? "/login?error=demo" : "/ideas"}`);
}
