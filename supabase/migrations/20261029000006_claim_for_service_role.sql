-- With the service key there is no signed-in user, so membership alone would claim nothing.
create or replace function vl_claim_job(kinds text[]) returns setof vl_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update vl_jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id = (
    select id from vl_jobs
    where status = 'queued' and run_at <= now() and kind = any(kinds)
      and (auth.role() = 'service_role' or workspace_id is null or vl_is_member(workspace_id))
    order by run_at
    for update skip locked
    limit 1
  )
  returning j.*;
end;
$$;
grant execute on function vl_claim_job(text[]) to authenticated, service_role;
