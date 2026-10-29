import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentWorkspace } from "@/lib/workspace";
import { requireAdmin } from "@/lib/admin";
import { isAdmin } from "@/lib/access";
import { videoLimit } from "@/lib/allowance";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Profile = { user_id: string; workspace_id: string | null; full_name: string; email: string; linkedin_url: string; website: string | null; onboarded_at: string | null; created_at: string };

// Turning an account off bans the user, so a session that is already open stops working too.
async function setOff(formData: FormData) {
  "use server";
  const db = await requireAdmin();
  const id = String(formData.get("id"));
  const { data: target } = await db.auth.admin.getUserById(id);
  if (isAdmin(target.user?.email)) return;
  await db.auth.admin.updateUserById(id, { ban_duration: formData.get("off") === "yes" ? "876000h" : "none" });
  revalidatePath("/admin/access");
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

export default async function Accounts() {
  const { user } = await currentWorkspace();
  if (!isAdmin(user.email)) notFound();

  const db = await requireAdmin();
  const { data } = await db.from("vl_profiles").select("*").order("created_at", { ascending: false }).limit(300);
  const people = (data ?? []) as Profile[];

  const [{ data: users }, { data: videos }] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    people.length
      ? db.from("vl_videos").select("workspace_id,status,output_path").in("workspace_id", people.map((p) => p.workspace_id).filter(Boolean) as string[])
      : Promise.resolve({ data: [] as { workspace_id: string; status: string; output_path: string | null }[] }),
  ]);
  const off = new Set((users?.users ?? []).filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).map((u) => u.id));
  // a video that failed before it made a file does not use a slot, the same rule the allowance uses
  const used = new Map<string, number>();
  for (const v of videos ?? []) if (v.status !== "failed" || v.output_path) used.set(v.workspace_id, (used.get(v.workspace_id) ?? 0) + 1);
  const limit = videoLimit();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-[2rem]">Accounts</h1>
        <p className="muted mt-1">
          {people.length} {people.length === 1 ? "account" : "accounts"} signed up. Anyone can sign up, and each account can make {limit} videos. Turn one off if it is being misused.
        </p>
      </div>

      {people.length ? (
        <ul className="grid gap-3">
          {people.map((p) => {
            const n = p.workspace_id ? used.get(p.workspace_id) ?? 0 : 0;
            const isOff = off.has(p.user_id);
            return (
              <li key={p.user_id} className="card grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xl">{p.full_name || p.email}</h3>
                    <p className="muted text-sm">{p.email} · joined {when(p.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="chip" style={isOff ? { color: "var(--warn)" } : { background: "var(--ok-soft)", color: "var(--ok)" }}>{isOff ? "turned off" : "active"}</span>
                    <span className="chip">{p.onboarded_at ? "brand brain built" : "not set up yet"}</span>
                    <span className="chip mono">{n} of {limit} videos</span>
                  </div>
                </div>
                <p className="text-sm">
                  {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4">{shortUrl(p.linkedin_url)}</a>}
                  {p.website && <> · <a href={p.website} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4">{shortUrl(p.website)}</a></>}
                  {!p.website && <span className="muted"> · no company website</span>}
                </p>
                <form action={setOff} className="flex gap-2">
                  <input type="hidden" name="id" value={p.user_id} />
                  <input type="hidden" name="off" value={isOff ? "no" : "yes"} />
                  <button className={isOff ? "btn btn-primary" : "btn btn-danger"}>{isOff ? "Turn account back on" : "Turn account off"}</button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card muted">Nobody has signed up yet.</p>
      )}
    </div>
  );
}
