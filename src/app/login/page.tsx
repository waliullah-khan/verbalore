import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=email");
  const db = supabaseServer();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  redirect(error ? "/login?error=send" : "/login?sent=1");
}

export default function Login({ searchParams }: { searchParams: { sent?: string; error?: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <Link href="/" className="display mb-8 text-xl">Verbalore</Link>
      <div className="card">
        <h1 className="text-2xl">Sign in</h1>
        {searchParams.sent ? (
          <p className="muted mt-3 text-sm">Check your inbox for the sign-in link.</p>
        ) : (
          <form action={sendLink} className="mt-4 space-y-3">
            <input name="email" type="email" required placeholder="you@company.com" className="field" />
            <button className="btn btn-primary w-full">Email me a link</button>
          </form>
        )}
        {searchParams.error && <p className="mt-3 text-sm" style={{ color: "var(--warn)" }}>That did not work. Try again, or use the demo.</p>}
        <div className="my-5 border-t" style={{ borderColor: "var(--line)" }} />
        <Link href="/demo" className="btn btn-ghost w-full">Open the demo workspace</Link>
      </div>
    </main>
  );
}
