-- Plain-language signals a workspace wants watched, and the idea a video note is recorded from.
create table if not exists vl_signal_watches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  phrase text not null,
  created_at timestamptz not null default now()
);
alter table vl_signal_watches enable row level security;
drop policy if exists vl_signal_watches_member on vl_signal_watches;
create policy vl_signal_watches_member on vl_signal_watches for all
  using (vl_is_member(workspace_id)) with check (vl_is_member(workspace_id));

alter table vl_video_notes add column if not exists idea_id uuid references vl_ideas(id) on delete set null;
