import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// Used by the worker and the cron route. With a service key it bypasses RLS;
// without one it signs in as a member user (WORKER_EMAIL, falling back to the demo user)
// and works under the same row level security as the app.
export async function serviceClient(): Promise<SupabaseClient> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (serviceKey) {
    cached = createClient(url, serviceKey, { auth: { persistSession: false } });
    return cached;
  }

  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const email = process.env.WORKER_EMAIL || process.env.DEMO_USER_EMAIL;
  const password = process.env.WORKER_PASSWORD || process.env.DEMO_USER_PASSWORD;
  if (!email || !password) throw new Error("Set SUPABASE_SERVICE_KEY or DEMO_USER_EMAIL/DEMO_USER_PASSWORD");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`worker sign-in failed: ${error.message}`);
  cached = client;
  return client;
}
