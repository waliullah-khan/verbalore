import Link from "next/link";
import { notFound } from "next/navigation";
import PostView from "@/components/studio/PostView";
import { currentWorkspace } from "@/lib/workspace";
import { connectedAccounts, hasUploadPost, profileName } from "@/lib/publish/uploadpost";
import { platformsFor } from "@/lib/publish/platforms";
import { defaultCaptions } from "@/lib/publish/captions";
import type { Contact, PlatformCard } from "../../types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PostVideo({ params }: { params: { id: string } }) {
  const { db, ws } = await currentWorkspace();
  const { data: v } = await db.from("vl_videos").select("id,idea_id,title,status,template,output_path,duration_s").eq("id", params.id).eq("workspace_id", ws.id).maybeSingle();
  if (!v) notFound();

  if (v.status !== "ready" || !v.output_path) {
    return (
      <section className="screen" data-screen="post">
        <div className="card" style={{ display: "grid", gap: ".75rem", justifyItems: "start" }}>
          <h3>This video is not ready yet</h3>
          <p className="muted">{v.status === "failed" ? "The edit did not finish. Open it in the editor to try again." : "It is still being edited. You can post it as soon as it is done."}</p>
          <Link className="btn primary" href={`/library/${v.id}/edit`}>Open in the editor</Link>
        </div>
      </section>
    );
  }

  const live = hasUploadPost();
  // the demo only simulates posting, so its platforms count as connected; anywhere else only real accounts do
  const accounts = !ws.is_demo && live ? await connectedAccounts(profileName(ws.id)) : {};
  const list = platformsFor(Object.keys(accounts));
  const platforms: PlatformCard[] = list.map((p) => ({
    id: p.id,
    name: p.name,
    limit: p.limit,
    title: !!p.title,
    connected: ws.is_demo || p.id in accounts,
    account: ws.is_demo ? "Demo account, posting is simulated" : accounts[p.id] ?? "",
  }));

  const { data: idea } = v.idea_id ? await db.from("vl_ideas").select("script").eq("id", v.idea_id).maybeSingle() : { data: null };
  const captions = defaultCaptions(String(v.title), idea?.script ?? null, list);

  const { data: rows } = await db.from("vl_crm_contacts").select("id,name,title,email,account:vl_crm_accounts(name)").eq("workspace_id", ws.id).order("name").limit(200);
  const contacts: Contact[] = (rows ?? []).map((c) => {
    const a = (Array.isArray(c.account) ? c.account[0] : c.account) as { name: string } | null;
    return { id: c.id as string, name: String(c.name), title: String(c.title ?? ""), account: a?.name ?? "", email: String(c.email ?? "") };
  });

  return (
    <PostView
      video={{
        id: v.id as string,
        title: String(v.title),
        template: String(v.template),
        duration: Number(v.duration_s ?? 0),
        url: db.storage.from("vl-videos").getPublicUrl(v.output_path as string).data.publicUrl,
        ideaId: (v.idea_id as string | null) ?? null,
      }}
      platforms={platforms}
      captions={captions}
      contacts={contacts}
      demo={ws.is_demo}
      canPost={ws.is_demo || live}
    />
  );
}
