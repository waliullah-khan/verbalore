-- Public share page and storage access without the service key.

-- the claim function runs as definer, so scope it to the caller's workspaces
create or replace function vl_claim_job(kinds text[]) returns setof vl_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update vl_jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id = (
    select id from vl_jobs
    where status = 'queued' and run_at <= now() and kind = any(kinds)
      and (workspace_id is null or vl_is_member(workspace_id))
    order by run_at
    for update skip locked
    limit 1
  )
  returning j.*;
end;
$$;

grant execute on function vl_claim_job(text[]) to authenticated;

-- a note is readable by anyone holding its token
create or replace function vl_get_note(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', n.id,
    'script', n.script,
    'video_path', v.output_path,
    'workspace', w.name,
    'contact', c.name
  )
  from vl_video_notes n
  join vl_workspaces w on w.id = n.workspace_id
  left join vl_videos v on v.id = n.video_id
  left join vl_crm_contacts c on c.id = n.contact_id
  where n.token = p_token and n.status in ('ready', 'sent');
$$;

create or replace function vl_log_note_view(p_token text, p_ua text) returns void
language sql security definer set search_path = public as $$
  insert into vl_note_views (note_id, user_agent)
  select id, p_ua from vl_video_notes where token = p_token;
$$;

grant execute on function vl_get_note(text) to anon, authenticated;
grant execute on function vl_log_note_view(text, text) to anon, authenticated;

-- members upload recordings and finished videos under their workspace folder
drop policy if exists vl_storage_rec_insert on storage.objects;
create policy vl_storage_rec_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('vl-recordings', 'vl-videos')
    and vl_is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists vl_storage_rec_select on storage.objects;
create policy vl_storage_rec_select on storage.objects for select to authenticated
  using (bucket_id in ('vl-recordings', 'vl-videos')
    and vl_is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists vl_storage_rec_update on storage.objects;
create policy vl_storage_rec_update on storage.objects for update to authenticated
  using (bucket_id in ('vl-recordings', 'vl-videos')
    and vl_is_member(((storage.foldername(name))[1])::uuid));
