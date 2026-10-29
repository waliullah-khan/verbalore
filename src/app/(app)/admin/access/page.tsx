import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentWorkspace } from "@/lib/workspace";
import { requireAdmin } from "@/lib/admin";
import { approveRequest, denyRequest, inviteLink, isAdmin, type AccessRequest } from "@/lib/access";
import { esc, sendEmail } from "@/lib/email/resend";
import CopyLink from "@/components/CopyLink";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function approve(formData: FormData) {
  "use server";
  const db = await requireAdmin();
  const result = await approveRequest(db, String(formData.get("id")));
  // the person is emailed only when a sender has been chosen; otherwise the link below is sent by hand
  if ("link" in result && process.env.RESEND_FROM_EMAIL) {
    const { data: r } = await db.from("vl_access_requests").select("email,full_name").eq("id", String(formData.get("id"))).single();
    if (r) {
      await sendEmail({
        to: r.email,
        subject: "You are in: your Verbalore sign-in link",
        html: `<p>Hi ${esc(r.full_name || "there")},</p><p>Your request was approved.</p><p><a href="${result.link}">Open Verbalore</a></p>`,
      }).catch(() => undefined);
    }
  }
  revalidatePath("/admin/access");
}

async function deny(formData: FormData) {
  "use server";
  const db = await requireAdmin();
  await denyRequest(db, String(formData.get("id")));
  revalidatePath("/admin/access");
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Request({ r }: { r: AccessRequest }) {
  const live = r.status === "approved" && r.invite_token && r.invite_expires_at && new Date(r.invite_expires_at) > new Date();
  return (
    <li className="card grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xl">{r.full_name || r.email}</h3>
          <p className="muted text-sm">{r.email} · asked {when(r.created_at)}</p>
        </div>
        <span
          className="chip"
          style={r.status === "approved" ? { background: "var(--ok-soft)", color: "var(--ok)" } : r.status === "denied" ? { color: "var(--warn)" } : { background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {r.status}
        </span>
      </div>
      {r.linkedin_url && (
        <p>
          <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4">{r.linkedin_url.replace(/^https:\/\/(www\.)?/, "")}</a>
        </p>
      )}
      {r.reason && <p className="muted">&ldquo;{r.reason}&rdquo;</p>}

      {live && (
        <div className="grid gap-1.5">
          <p className="label">Their personal sign-in link {process.env.RESEND_FROM_EMAIL ? "(also emailed)" : "(send it to them yourself)"}</p>
          <CopyLink value={inviteLink(r.invite_token as string)} />
          <p className="muted text-xs">Works until {when(r.invite_expires_at as string)}.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {r.status !== "approved" && (
          <form action={approve}>
            <input type="hidden" name="id" value={r.id} />
            <button className="btn btn-primary">{r.status === "denied" ? "Approve after all" : "Approve"}</button>
          </form>
        )}
        {r.status === "approved" && (
          <form action={approve}>
            <input type="hidden" name="id" value={r.id} />
            <button className="btn btn-ghost">New link</button>
          </form>
        )}
        {r.status !== "denied" && (
          <form action={deny}>
            <input type="hidden" name="id" value={r.id} />
            <button className="btn btn-danger">{r.status === "approved" ? "Remove access" : "Deny"}</button>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function AccessRequests() {
  const { user } = await currentWorkspace();
  if (!isAdmin(user.email)) notFound();

  const db = await requireAdmin();
  const { data } = await db.from("vl_access_requests").select("*").order("created_at", { ascending: false }).limit(200);
  const all = (data ?? []) as AccessRequest[];
  const pending = all.filter((r) => r.status === "pending");
  const decided = all.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-[2rem]">Access requests</h1>
        <p className="muted mt-1">Approving makes an account and a workspace, and gives you a personal link to send them.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl">Waiting for you <span className="muted mono text-base">{pending.length}</span></h2>
        {pending.length ? (
          <ul className="grid gap-3">{pending.map((r) => <Request key={r.id} r={r} />)}</ul>
        ) : (
          <p className="card muted">Nobody is waiting.</p>
        )}
      </section>

      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl">Decided</h2>
          <ul className="grid gap-3">{decided.map((r) => <Request key={r.id} r={r} />)}</ul>
        </section>
      )}
    </div>
  );
}
