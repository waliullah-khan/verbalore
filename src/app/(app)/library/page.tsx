import { revalidatePath } from "next/cache";
import AutoRefresh from "@/components/AutoRefresh";
import JobNotice from "@/components/JobNotice";
import { enqueue } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { PLATFORMS, hasUploadPost } from "@/lib/publish/uploadpost";
import { THEMES, type ThemeId } from "@/lib/usecases";

async function post(formData: FormData) {
  "use server";
  const { db, ws } = await currentWorkspace();
  const videoId = String(formData.get("video"));
  const platforms = formData.getAll("platform").map(String);
  if (!platforms.length) return;
  const when = String(formData.get("when") ?? "");
  const { data: pub, error } = await db
    .from("vl_publish_jobs")
    .insert({
      workspace_id: ws.id,
      video_id: videoId,
      platforms,
      captions: { all: String(formData.get("caption") ?? "").trim() },
      scheduled_at: when ? new Date(when).toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  await enqueue(db, ws.id, "publish_video", { publishId: pub.id });
  revalidatePath("/library");
}

async function rerender(formData: FormData) {
  "use server";
  const { db, ws } = await currentWorkspace();
  const videoId = String(formData.get("video"));
  const template = String(formData.get("template"));
  await db.from("vl_videos").update({ status: "queued", template, error: null }).eq("id", videoId);
  await enqueue(db, ws.id, "render_video", { videoId });
  revalidatePath("/library");
}

const statusLabel: Record<string, string> = {
  queued: "Waiting for the editor", processing: "Editing", ready: "Ready", failed: "Failed",
  publishing: "Posting", published: "Posted", scheduled: "Scheduled", simulated: "Simulated", partial: "Partly posted",
};

export default async function Library() {
  const { db, ws } = await currentWorkspace();
  const { data: videos } = await db.from("vl_videos").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false });
  const { data: pubs } = await db.from("vl_publish_jobs").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false });
  const busy =
    (videos ?? []).some((v) => v.status === "queued" || v.status === "processing") ||
    (pubs ?? []).some((p) => p.status === "queued" || p.status === "publishing");
  const live = hasUploadPost();

  return (
    <div>
      <AutoRefresh active={busy} />
      <JobNotice kinds={["render_video", "publish_video"]} />
      <p className="eyebrow">Library</p>
      <h1 className="mt-1 text-4xl">Your videos</h1>
      <p className="muted mt-2 max-w-xl">Finished edits, ready to post. A 45 second video renders in about two minutes.</p>
      {!live && <p className="chip mt-3">Posting is simulated until an Upload-Post key is set</p>}

      <div className="mt-8 grid gap-5">
        {(videos ?? []).map((v) => {
          const url = v.output_path ? db.storage.from("vl-videos").getPublicUrl(v.output_path).data.publicUrl : null;
          const mine = (pubs ?? []).filter((p) => p.video_id === v.id);
          const themes = Object.keys(THEMES) as ThemeId[];
          return (
            <article key={v.id} className="card grid gap-5 md:grid-cols-[220px_1fr]">
              <div className="aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-2xl bg-black">
                {url ? <video src={url} controls playsInline preload="metadata" className="h-full w-full object-cover" /> : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white/70">
                    {v.status === "failed" ? "Edit failed" : "Editing…"}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-4">
                <div>
                  <h2 className="text-xl leading-snug">{v.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="chip">{statusLabel[v.status] ?? v.status}</span>
                    <span className="chip">{THEMES[v.template as ThemeId]?.label ?? v.template}</span>
                    {v.render_ms && <span className="chip">edited in {Math.round(v.render_ms / 1000)}s</span>}
                  </div>
                  {v.error && <p className="mt-2 text-sm" style={{ color: "var(--warn)" }}>{v.error}</p>}
                </div>

                {v.status === "ready" && (
                  <>
                    <details className="rounded-xl border" style={{ borderColor: "var(--line)" }}>
                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Post it</summary>
                      <form action={post} className="space-y-3 px-4 pb-4">
                        <input type="hidden" name="video" value={v.id} />
                        <textarea name="caption" defaultValue={v.title} rows={2} className="field" />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                          {PLATFORMS.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="platform" value={p.id} defaultChecked={["tiktok", "instagram", "linkedin", "youtube"].includes(p.id)} /> {p.label}
                            </label>
                          ))}
                        </div>
                        <label className="block text-sm">Schedule (optional)
                          <input type="datetime-local" name="when" className="field mt-1" />
                        </label>
                        <button className="btn btn-primary">Post to selected</button>
                      </form>
                    </details>

                    <form action={rerender} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="video" value={v.id} />
                      <select name="template" defaultValue={v.template} className="field w-auto">
                        {themes.map((t) => <option key={t} value={t}>{THEMES[t].label}</option>)}
                      </select>
                      <button className="btn btn-ghost">Re-edit in this style</button>
                    </form>
                  </>
                )}

                {mine.map((p) => (
                  <div key={p.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--paper-2)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip">{statusLabel[p.status] ?? p.status}</span>
                      {p.scheduled_at && <span className="muted">for {new Date(p.scheduled_at).toLocaleString()}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(p.platforms as string[]).map((pl) => {
                        const r = (p.results as Record<string, { success?: boolean; url?: string }> | null)?.[pl];
                        return (
                          <span key={pl} className="chip">
                            {pl} {r?.success ? "✓" : r?.success === false ? "✗" : "…"}
                            {r?.url && <a href={r.url} target="_blank" rel="noreferrer" className="ml-1 underline">view</a>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        {!videos?.length && (
          <div className="card text-center">
            <p className="display text-xl">Nothing here yet</p>
            <p className="muted mt-1 text-sm">Pick an idea on the Today page and record it. The edit lands here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
