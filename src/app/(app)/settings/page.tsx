import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentWorkspace } from "@/lib/workspace";
import { connectUrl, connectedPlatforms, hasUploadPost, profileName } from "@/lib/publish/uploadpost";
import { sendDigest } from "@/lib/email/digest";
import { hasResend } from "@/lib/email/resend";

async function saveProfile(formData: FormData) {
  "use server";
  const { db, ws } = await currentWorkspace();
  await db
    .from("vl_workspaces")
    .update({
      niche: String(formData.get("niche") ?? "").trim(),
      offer: String(formData.get("offer") ?? "").trim(),
      icp: String(formData.get("icp") ?? "").trim(),
      digest_email: String(formData.get("digest_email") ?? "").trim() || null,
    })
    .eq("id", ws.id);
  revalidatePath("/settings");
}

async function connectSocial() {
  "use server";
  const { ws } = await currentWorkspace();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  redirect(await connectUrl(profileName(ws.id), `${base}/settings`));
}

async function digestNow() {
  "use server";
  const { db, ws, user } = await currentWorkspace();
  if (ws.is_demo && process.env.ALLOW_DEMO_EMAIL !== "true") redirect(`/settings?digest=${encodeURIComponent("email is turned off in the public demo")}`);
  const r = await sendDigest(db, ws, user.email ?? undefined);
  redirect(`/settings?digest=${r.sent ? (r.simulated ? "simulated" : "sent") : encodeURIComponent(r.reason)}`);
}

const ready = (ok: boolean) => (
  <span className="chip" style={ok ? { background: "var(--accent-soft)", color: "var(--ok)" } : undefined}>{ok ? "connected" : "not set"}</span>
);

export default async function Settings({ searchParams }: { searchParams: { digest?: string } }) {
  const { ws } = await currentWorkspace();
  const connected = hasUploadPost() ? await connectedPlatforms(profileName(ws.id)) : [];

  const services: [string, boolean, string][] = [
    ["OpenRouter (writer model)", !!process.env.OPENROUTER_API_KEY, "Writes scripts and plans scenes"],
    ["TypeSafe Jev", !!process.env.TYPESAFE_API_KEY, "Picks references and filters signals"],
    ["Firecrawl", !!process.env.FIRECRAWL_API_KEY, "Web search and page reading"],
    ["Apify", !!process.env.APIFY_TOKEN, "LinkedIn, Instagram, TikTok, YouTube, Reddit"],
    ["Cartesia", !!process.env.CARTESIA_API_KEY, "Word-level captions from speech"],
    ["Resend", hasResend(), "Daily digest and video note emails"],
    ["Upload-Post", hasUploadPost(), "Posting to 15 platforms"],
    ["HubSpot", !!process.env.HUBSPOT_TOKEN, "Live CRM. The demo uses a sample CRM"],
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="mt-1 text-4xl">Workspace</h1>
      </div>

      <form action={saveProfile} className="card space-y-3">
        <p className="eyebrow">What you do</p>
        <label className="block text-sm">Niche<input name="niche" defaultValue={ws.niche} className="field mt-1" /></label>
        <label className="block text-sm">Offer<textarea name="offer" defaultValue={ws.offer} rows={2} className="field mt-1" /></label>
        <label className="block text-sm">Audience<input name="icp" defaultValue={ws.icp} className="field mt-1" /></label>
        <label className="block text-sm">Send my daily ideas to<input name="digest_email" type="email" defaultValue={ws.digest_email ?? ""} className="field mt-1" /></label>
        <div className="flex flex-wrap gap-3"><button className="btn btn-primary">Save</button></div>
      </form>

      <section className="card space-y-3">
        <p className="eyebrow">Daily email</p>
        <p className="muted text-sm">Every morning, five ideas land in your inbox with a button that opens the teleprompter.</p>
        <form action={digestNow}><button className="btn btn-ghost">Send today&apos;s email now</button></form>
        {searchParams.digest && (
          <p className="text-sm" style={{ color: searchParams.digest === "sent" || searchParams.digest === "simulated" ? "var(--ok)" : "var(--warn)" }}>
            {searchParams.digest === "sent" ? "Sent." : searchParams.digest === "simulated" ? "Built and marked sent (simulated, no email key)." : `Not sent: ${searchParams.digest}.`}
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <p className="eyebrow">Social accounts</p>
        <p className="muted text-sm">Connect the accounts you post to. Posting goes through Upload-Post to up to 15 platforms.</p>
        <form action={connectSocial}><button className="btn btn-ghost" disabled={!hasUploadPost()}>Connect accounts</button></form>
        {connected.length > 0 && <div className="flex flex-wrap gap-2">{connected.map((c) => <span key={c} className="chip">{c}</span>)}</div>}
        {!hasUploadPost() && <p className="muted text-xs">Set UPLOAD_POST_API_KEY to enable.</p>}
      </section>

      <section className="card">
        <p className="eyebrow">Connections</p>
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
          {services.map(([name, ok, what]) => (
            <li key={name} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div><p className="font-medium">{name}</p><p className="muted">{what}</p></div>
              {ready(ok)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
