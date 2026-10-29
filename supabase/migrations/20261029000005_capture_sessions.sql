-- A capture session lets a phone record into a desktop Studio session without signing in.
-- The token is the capability: unguessable, single purpose, and it expires.
create table if not exists vl_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  idea_id uuid not null references vl_ideas(id) on delete cascade,
  note_id uuid references vl_video_notes(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'waiting',
  path text,
  duration_s numeric,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);
create index if not exists vl_capture_ws on vl_capture_sessions (workspace_id, created_at desc);
alter table vl_capture_sessions enable row level security;
drop policy if exists vl_capture_sessions_member on vl_capture_sessions;
create policy vl_capture_sessions_member on vl_capture_sessions for all
  using (vl_is_member(workspace_id)) with check (vl_is_member(workspace_id));
