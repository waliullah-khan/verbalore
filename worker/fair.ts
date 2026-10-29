// The ordering rule the queue uses when a worker asks for its next job (the SQL function vl_claim_job is the real thing;
// this is the same rule in plain code, so it can be tested and read). Among jobs of the lane that are waiting:
// the workspace with the fewest jobs already running in that lane goes first, then the oldest job.
export type QueuedJob = { id: string; workspace: string | null; kind: string; runAt: number; pool?: string | null };
export type RunningJob = { workspace: string | null; kind: string };

export function pickNext(queued: QueuedJob[], running: RunningJob[], kinds: string[], pool: string | null = null): QueuedJob | null {
  const busy = (ws: string | null) => running.filter((r) => kinds.includes(r.kind) && r.workspace === ws).length;
  const eligible = queued.filter((q) => kinds.includes(q.kind) && (q.pool ?? null) === pool);
  eligible.sort((a, b) => busy(a.workspace) - busy(b.workspace) || a.runAt - b.runAt);
  return eligible[0] ?? null;
}
