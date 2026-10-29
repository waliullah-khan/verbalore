-- Several workers (and several loops in each) take jobs from this queue at once, so claiming has to be fair and safe.
--
-- Fair: a job from a workspace with fewer jobs already running in the same lane goes first, then the oldest job.
--       One person queueing five edits cannot make the sixth person wait for all of them.
-- Safe: FOR UPDATE ... SKIP LOCKED means two claimers never get the same row.
-- Pool: an optional tag in the job payload. Jobs with no tag are claimed by normal workers; a tagged job is only
--       claimed by a worker that asks for that tag, which keeps load tests and new-version trials off the live queue.
drop function if exists vl_claim_job(text[]);

create or replace function vl_claim_job(kinds text[], pool text default null) returns setof vl_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update vl_jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id = (
    select q.id from vl_jobs q
    where q.status = 'queued' and q.run_at <= now() and q.kind = any(kinds)
      and (q.payload->>'pool') is not distinct from pool
      and (auth.role() = 'service_role' or q.workspace_id is null or vl_is_member(q.workspace_id))
    order by
      (select count(*) from vl_jobs r
        where r.status = 'running' and r.kind = any(kinds) and r.workspace_id is not distinct from q.workspace_id),
      q.run_at
    for update of q skip locked
    limit 1
  )
  returning j.*;
end;
$$;
grant execute on function vl_claim_job(text[], text) to authenticated, service_role;

create index if not exists vl_jobs_lane_idx on vl_jobs (status, kind, workspace_id);

-- A worker that dies mid-job leaves it 'running' for ever. Any worker can run this once a minute: a job whose lease is
-- older than 15 minutes goes back in the queue, and after three tries it fails with a reason the person can read.
create or replace function vl_sweep_stuck_jobs(lease interval default interval '15 minutes', max_attempts integer default 3)
returns table(job_id uuid, job_kind text, job_workspace uuid, job_payload jsonb, was_requeued boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role only';
  end if;
  return query
  with stuck as (
    select j.id from vl_jobs j
    where j.status = 'running' and j.locked_at < now() - lease
    for update skip locked
  ), upd as (
    update vl_jobs j set
      status = case when j.attempts < max_attempts then 'queued' else 'failed' end,
      locked_at = case when j.attempts < max_attempts then null else j.locked_at end,
      error = case when j.attempts < max_attempts then j.error
                   else 'The editor stopped before this finished, and it was tried ' || j.attempts || ' times.' end
    from stuck where j.id = stuck.id
    returning j.id, j.kind, j.workspace_id, j.payload, j.status
  )
  select upd.id, upd.kind, upd.workspace_id, upd.payload, (upd.status = 'queued') from upd;
end;
$$;
revoke all on function vl_sweep_stuck_jobs(interval, integer) from public;
grant execute on function vl_sweep_stuck_jobs(interval, integer) to service_role;

-- How many other people's jobs are ahead of this video in its lane, for 'Waiting for a free editor, 2 ahead of you'.
-- It only returns counts, and only to members of the video's workspace.
create or replace function vl_queue_position(p_video uuid)
returns table(stage text, ahead integer)
language plpgsql stable security definer set search_path = public as $$
declare
  ws uuid;
  mine_id uuid;
  mine_kind text;
  mine_status text;
  mine_at timestamptz;
begin
  select v.workspace_id into ws from vl_videos v where v.id = p_video;
  if ws is null then return; end if;
  if not (auth.role() = 'service_role' or vl_is_member(ws)) then return; end if;

  select j.id, j.kind, j.status, j.created_at into mine_id, mine_kind, mine_status, mine_at
  from vl_jobs j
  where j.kind in ('render_video', 'render_final') and j.status in ('queued', 'running')
    and j.payload->>'videoId' = p_video::text
  order by j.created_at desc limit 1;
  if mine_id is null then return; end if;

  return query select
    case when mine_status = 'running' then 'working' else 'waiting' end,
    (select count(*)::integer from vl_jobs o
      where o.kind = mine_kind and o.status = 'queued' and o.workspace_id is distinct from ws and o.created_at < mine_at);
end;
$$;
grant execute on function vl_queue_position(uuid) to authenticated, service_role;
