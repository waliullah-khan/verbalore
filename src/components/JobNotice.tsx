import { currentWorkspace } from "@/lib/workspace";
import type { JobKind } from "@/lib/jobs";

// If a background job failed in the last few minutes, say why. Otherwise a refused or failed job just looks like nothing happened.
export default async function JobNotice({ kinds }: { kinds: JobKind[] }) {
  const { db, ws } = await currentWorkspace();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await db
    .from("vl_jobs")
    .select("kind,error,created_at")
    .eq("workspace_id", ws.id)
    .eq("status", "failed")
    .in("kind", kinds)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const failed = data?.[0];
  if (!failed?.error) return null;
  return (
    <p className="card mb-4 text-sm" role="status" style={{ color: "var(--warn)" }}>
      The last attempt did not finish: {failed.error}
    </p>
  );
}
