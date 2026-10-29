import type { SupabaseClient } from "@supabase/supabase-js";
import { hasUploadPost, profileName, publish, status } from "../src/lib/publish/uploadpost";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pushes a finished video to the chosen networks. With no Upload-Post key it simulates the
// result so the flow can be shown end to end, and says so in the stored result.
export async function publishVideo(db: SupabaseClient, publishId: string) {
  const { data: job } = await db.from("vl_publish_jobs").select("*").eq("id", publishId).single();
  if (!job) throw new Error("publish job not found");
  const { data: video } = await db.from("vl_videos").select("title,output_path").eq("id", job.video_id).single();
  if (!video?.output_path) throw new Error("video has no rendered file yet");
  const videoUrl = db.storage.from("vl-videos").getPublicUrl(video.output_path).data.publicUrl;
  const caption = (job.captions as { all?: string }).all || video.title;

  await db.from("vl_publish_jobs").update({ status: "publishing" }).eq("id", publishId);

  if (!hasUploadPost()) {
    await sleep(1500);
    const results = Object.fromEntries((job.platforms as string[]).map((p) => [p, { success: true, simulated: true }]));
    await db.from("vl_publish_jobs").update({ status: "simulated", results }).eq("id", publishId);
    return { simulated: true, platforms: job.platforms };
  }

  const requestId = await publish({
    user: profileName(job.workspace_id), videoUrl, title: caption, platforms: job.platforms, scheduledAt: job.scheduled_at,
  });
  await db.from("vl_publish_jobs").update({ request_id: requestId }).eq("id", publishId);

  // poll for up to three minutes; scheduled posts finish later and are reported as scheduled
  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    const s = await status(requestId);
    await db.from("vl_publish_jobs").update({ results: s.results }).eq("id", publishId);
    if (/complete|success|done|scheduled|failed/i.test(s.status)) {
      const failed = Object.values(s.results).some((r) => r.success === false);
      await db.from("vl_publish_jobs").update({ status: failed ? "partial" : /scheduled/i.test(s.status) ? "scheduled" : "published" }).eq("id", publishId);
      return { requestId, status: s.status };
    }
  }
  await db.from("vl_publish_jobs").update({ status: "publishing" }).eq("id", publishId);
  return { requestId, status: "still processing" };
}
