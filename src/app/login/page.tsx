import Link from "next/link";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { supabaseServer } from "@/lib/supabase/server";
import { autoWorkspaceName, isEmail, validateSignup } from "@/lib/access";
import SubmitButton from "@/components/studio/SubmitButton";
import PasswordField from "./PasswordField";
import "./login.css";

const HOURLY_CAP = 30;
// the most accounts this build will ever have; set SIGNUP_LIMIT to change it
const SIGNUP_LIMIT = Number(process.env.SIGNUP_LIMIT) || 50;

async function signupsFull() {
  const db = await serviceClient();
  const { count } = await db.from("vl_profiles").select("user_id", { count: "exact", head: true });
  return (count ?? 0) >= SIGNUP_LIMIT;
}

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!isEmail(email) || !password) redirect("/login?error=creds");

  const auth = supabaseServer();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/login?error=${/banned/i.test(error?.message ?? "") ? "off" : "creds"}`);

  // a new account goes to the welcome page until its brand brain exists
  const { data: profile } = await auth.from("vl_profiles").select("onboarded_at").eq("user_id", data.user.id).maybeSingle();
  redirect(profile && !profile.onboarded_at ? "/welcome" : "/home");
}

async function signUp(formData: FormData) {
  "use server";
  // a hidden field real people never fill in
  if (String(formData.get("company_site") ?? "")) redirect("/login");

  const checked = validateSignup({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    linkedin: String(formData.get("linkedin") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!checked.ok) redirect(`/login?mode=signup&error=${checked.error}`);
  const { name, email, linkedin, password } = checked.value;

  if (await signupsFull()) redirect("/login?mode=signup&error=full");
  const db = await serviceClient();
  const { count } = await db
    .from("vl_profiles")
    .select("user_id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= HOURLY_CAP) redirect("/login?mode=signup&error=busy");

  const made = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, linkedin } });
  if (made.error || !made.data.user) {
    redirect(`/login?mode=signup&error=${/already|registered|exists/i.test(made.error?.message ?? "") ? "exists" : "send"}`);
  }
  const user = made.data.user;

  // the workspace, its owner and the profile are made together; if any step fails the account is removed again
  let ok = true;
  try {
    const ws = await db.from("vl_workspaces").insert({ name: autoWorkspaceName(name), owner_id: user.id }).select("id").single();
    if (ws.error) throw ws.error;
    const member = await db.from("vl_members").insert({ workspace_id: ws.data.id, user_id: user.id, role: "owner" });
    if (member.error) throw member.error;
    const profile = await db.from("vl_profiles").insert({ user_id: user.id, workspace_id: ws.data.id, full_name: name, email, linkedin_url: linkedin });
    if (profile.error) throw profile.error;
  } catch {
    ok = false;
    await db.auth.admin.deleteUser(user.id);
  }
  if (!ok) redirect("/login?mode=signup&error=send");

  const { error } = await supabaseServer().auth.signInWithPassword({ email, password });
  redirect(error ? "/login?error=creds" : "/welcome");
}

const ERRORS: Record<string, string> = {
  name: "Add your name so we know who you are.",
  email: "That email address does not look right.",
  linkedin: "Paste the link to your LinkedIn profile, like linkedin.com/in/your-name.",
  password: "Use at least 8 characters, and something that is not easy to guess.",
  exists: "That email already has an account. Log in instead.",
  full: "Sign-ups are full for now. If you already have an account, log in.",
  busy: "A lot of people are signing up right now. Please try again in a little while.",
  send: "That did not go through. Please try again.",
  creds: "That email and password do not match.",
  off: "This account has been turned off.",
  link: "That sign-in link has expired or is not valid.",
  demo: "The demo is not available right now.",
  "no-workspace": "Your account has no workspace yet. Sign up again to make one.",
};

export default async function Login({ searchParams }: { searchParams: { mode?: string; error?: string } }) {
  const signup = searchParams.mode === "signup";
  const full = signup && (await signupsFull());
  const error = searchParams.error ? ERRORS[searchParams.error] ?? "That did not work. Please try again." : null;

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-[1fr_26rem] md:px-6">
      <section>
        <Link href="/" className="display text-[1.6rem]">Verbalore</Link>
        <p className="eyebrow mt-10">{signup ? "Free to start" : "Welcome back"}</p>
        <h1 className="mt-3 text-[2.4rem] md:text-[3.2rem]">{signup ? "Make your first video today." : "Pick up where you left off."}</h1>
        <p className="muted mt-4 max-w-md text-lg">
          {signup
            ? "Tell us who you are and where you work. Verbalore reads your website and LinkedIn, learns your business, and has ideas and scripts ready for you."
            : "Your ideas, recordings and edited videos are waiting."}
        </p>
        <ul className="muted mt-6 grid max-w-md gap-2">
          <li>A brand brain built from your own website and LinkedIn.</li>
          <li>Full scripts you can read straight off the teleprompter.</li>
          <li>Up to 5 edited videos on your account.</li>
        </ul>
      </section>

      <section className="card">
        <nav className="authtabs" aria-label="Log in or sign up">
          <Link href="/login" aria-current={signup ? undefined : "page"}>Log in</Link>
          <Link href="/login?mode=signup" aria-current={signup ? "page" : undefined}>Sign up</Link>
        </nav>

        {signup && full ? (
          <p role="status" className="text-sm font-bold">{ERRORS.full}</p>
        ) : signup ? (
          <form action={signUp} className="grid gap-4">
            <div>
              <label htmlFor="name" className="label">Your name</label>
              <input id="name" name="name" required maxLength={80} autoComplete="name" className="lf" />
            </div>
            <div>
              <label htmlFor="email" className="label">Work email</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="lf" />
            </div>
            <div>
              <label htmlFor="linkedin" className="label">LinkedIn profile</label>
              <input id="linkedin" name="linkedin" required inputMode="url" autoComplete="url" placeholder="linkedin.com/in/your-name" className="lf" />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <PasswordField autoComplete="new-password" />
              <p className="muted mt-1 text-xs">At least 8 characters.</p>
            </div>
            <input name="company_site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            {error && <p role="alert" className="text-sm font-bold" style={{ color: "var(--warn)" }}>{error}</p>}
            <SubmitButton className="btn btn-primary" busy="Making your account…">Create my account</SubmitButton>
          </form>
        ) : (
          <form action={signIn} className="grid gap-4">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="lf" />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <PasswordField autoComplete="current-password" />
            </div>
            {error && <p role="alert" className="text-sm font-bold" style={{ color: "var(--warn)" }}>{error}</p>}
            <SubmitButton className="btn btn-primary" busy="Logging you in…">Log in</SubmitButton>
          </form>
        )}

        <div className="my-6 border-t" style={{ borderColor: "var(--line)" }} />
        <Link href="/demo" className="btn btn-ghost w-full">Look around the demo first</Link>
      </section>
    </main>
  );
}
