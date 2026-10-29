import Link from "next/link";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { adminEmails, cleanLinkedIn, inviteLink, isEmail } from "@/lib/access";
import { esc, sendEmail } from "@/lib/email/resend";

const HOURLY_CAP = 30;

async function requestAccess(formData: FormData) {
  "use server";
  // a hidden field real people never fill in
  if (String(formData.get("company_site") ?? "")) redirect("/login?sent=1");

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const linkedin = cleanLinkedIn(String(formData.get("linkedin") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 400);
  if (!name) redirect("/login?error=name");
  if (!isEmail(email)) redirect("/login?error=email");
  if (!linkedin) redirect("/login?error=linkedin");

  const db = await serviceClient();
  const { count } = await db
    .from("vl_access_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= HOURLY_CAP) redirect("/login?error=busy");

  const { error } = await db.from("vl_access_requests").insert({ email, full_name: name, linkedin_url: linkedin, reason });
  // asking twice with the same address is fine, and looks the same as asking once
  if (error && error.code !== "23505") redirect("/login?error=send");

  if (!error) {
    await Promise.allSettled(
      adminEmails().map((to) =>
        sendEmail({
          to,
          subject: `Access request from ${name}`,
          html: `<p><b>${esc(name)}</b> (${esc(email)}) asked for access.</p><p>${esc(linkedin)}</p>${reason ? `<p>${esc(reason)}</p>` : ""}<p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/access">Review it</a></p>`,
        })
      )
    );
  }
  redirect("/login?sent=1");
}

async function resendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (isEmail(email) && process.env.RESEND_FROM_EMAIL) {
    const db = await serviceClient();
    const { data: r } = await db
      .from("vl_access_requests")
      .select("full_name,invite_token,invite_expires_at,status")
      .ilike("email", email)
      .maybeSingle();
    if (r?.status === "approved" && r.invite_token && r.invite_expires_at && new Date(r.invite_expires_at) > new Date()) {
      await sendEmail({
        to: email,
        subject: "Your Verbalore sign-in link",
        html: `<p>Hi ${esc(r.full_name || "there")},</p><p><a href="${inviteLink(r.invite_token)}">Open Verbalore</a></p>`,
      }).catch(() => undefined);
    }
  }
  // the same answer whether or not the address was approved
  redirect("/login?resent=1");
}

const ERRORS: Record<string, string> = {
  name: "Add your name so we know who is asking.",
  email: "That email address does not look right.",
  linkedin: "Paste the link to your LinkedIn profile, like linkedin.com/in/your-name.",
  busy: "A lot of people are asking right now. Please try again in a little while.",
  send: "That did not go through. Please try again.",
  link: "That sign-in link has expired or is not valid. Ask for a new one.",
  demo: "The demo is not available right now.",
  "no-workspace": "Your account has no workspace yet. Ask for access again.",
};

export default function Login({ searchParams }: { searchParams: { sent?: string; resent?: string; error?: string } }) {
  const canEmail = !!process.env.RESEND_FROM_EMAIL;
  const error = searchParams.error ? ERRORS[searchParams.error] ?? "That did not work. Please try again." : null;

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-[1fr_26rem] md:px-6">
      <section>
        <Link href="/" className="display text-[1.6rem]">Verbalore</Link>
        <p className="eyebrow mt-10">Invite only</p>
        <h1 className="mt-3 text-[2.4rem] md:text-[3.2rem]">Ask for a seat.</h1>
        <p className="muted mt-4 max-w-md text-lg">
          Verbalore is open to a small group while it is being built. Tell us who you are and we will look at every request by hand.
        </p>
        <ul className="muted mt-6 grid max-w-md gap-2">
          <li>Five video ideas a morning, built from what your market is posting.</li>
          <li>A teleprompter, an automatic edit and one-tap posting.</li>
          <li>Buying signals that turn into a personal video note.</li>
        </ul>
      </section>

      <section className="card">
        {searchParams.sent ? (
          <div role="status">
            <h2 className="text-2xl">Request received</h2>
            <p className="muted mt-3">
              Thank you. We will review it and, if approved, send you a personal sign-in link.
              {canEmail ? " Watch your inbox." : " It may take a little while."}
            </p>
            <Link href="/login" className="btn btn-ghost mt-5">Back</Link>
          </div>
        ) : (
          <form action={requestAccess} className="grid gap-4">
            <h2 className="text-2xl">Request access</h2>
            <div>
              <label htmlFor="name" className="label">Your name</label>
              <input id="name" name="name" required maxLength={80} autoComplete="name" className="field" />
            </div>
            <div>
              <label htmlFor="email" className="label">Work email</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="field" />
            </div>
            <div>
              <label htmlFor="linkedin" className="label">LinkedIn profile</label>
              <input id="linkedin" name="linkedin" required inputMode="url" autoComplete="url" placeholder="linkedin.com/in/your-name" className="field" />
            </div>
            <div>
              <label htmlFor="reason" className="label">What would you make videos about? <span className="muted font-normal">(optional)</span></label>
              <textarea id="reason" name="reason" maxLength={400} className="field" />
            </div>
            <input name="company_site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
            {error && <p role="alert" className="text-sm font-bold" style={{ color: "var(--warn)" }}>{error}</p>}
            <button className="btn btn-primary">Request access</button>
          </form>
        )}

        <div className="my-6 border-t" style={{ borderColor: "var(--line)" }} />

        {searchParams.resent && <p role="status" className="muted mb-3 text-sm">If that address is approved, a link is on its way.</p>}
        {canEmail ? (
          <form action={resendLink} className="grid gap-2">
            <label htmlFor="again" className="label">Already approved?</label>
            <div className="flex gap-2">
              <input id="again" name="email" type="email" required placeholder="you@company.com" className="field" />
              <button className="btn btn-ghost">Email my link</button>
            </div>
          </form>
        ) : (
          <p className="muted text-sm"><b>Already approved?</b> Open the personal link you were sent.</p>
        )}

        <Link href="/demo" className="btn btn-ghost mt-5 w-full">Look around the demo first</Link>
      </section>
    </main>
  );
}
