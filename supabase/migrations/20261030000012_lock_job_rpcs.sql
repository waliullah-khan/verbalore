-- Job queue functions are for the worker (service role) and, for claiming, a member working on their own workspace.
-- A signed-out caller has no business with either, and nobody but the worker needs to sweep stuck jobs.
-- vl_get_note and vl_log_note_view stay public on purpose: they power the private share links.
revoke execute on function public.vl_claim_job(text[], text) from public, anon;
grant execute on function public.vl_claim_job(text[], text) to authenticated, service_role;

revoke execute on function public.vl_sweep_stuck_jobs(interval, integer) from public, anon, authenticated;
grant execute on function public.vl_sweep_stuck_jobs(interval, integer) to service_role;
