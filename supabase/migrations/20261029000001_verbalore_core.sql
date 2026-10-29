-- Verbalore core schema. Every table is prefixed vl_ so it can share a project.

create extension if not exists vector;

create table if not exists vl_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  niche text not null default '',
  offer text not null default '',
  icp text not null default '',
  brand jsonb not null default '{"accent":"#c2410c","paper":"#f3ead9","ink":"#14110f"}',
  digest_email text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists vl_members (
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  primary key (workspace_id, user_id)
);

create or replace function vl_is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vl_members where workspace_id = ws and user_id = auth.uid());
$$;

create table if not exists vl_brain_docs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  kind text not null default 'note',
  title text not null,
  source_url text,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists vl_brain_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references vl_brain_docs(id) on delete cascade,
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  content text not null,
  embedding vector(1536)
);

create table if not exists vl_voice_profiles (
  workspace_id uuid primary key references vl_workspaces(id) on delete cascade,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists vl_ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  day date not null default current_date,
  angle text not null,
  hook text not null,
  why_now text not null default '',
  score numeric not null default 0,
  status text not null default 'new',
  evidence jsonb not null default '[]',
  reference jsonb,
  structure jsonb,
  script jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vl_ideas_ws_day on vl_ideas (workspace_id, day desc, score desc);

create table if not exists vl_recordings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  idea_id uuid references vl_ideas(id) on delete set null,
  note_id uuid,
  path text not null,
  duration_s numeric,
  status text not null default 'uploaded',
  created_at timestamptz not null default now()
);

create table if not exists vl_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  idea_id uuid references vl_ideas(id) on delete set null,
  recording_id uuid references vl_recordings(id) on delete set null,
  title text not null default 'Untitled',
  status text not null default 'queued',
  template text not null default 'editorial',
  scene_plan jsonb,
  transcript jsonb,
  output_path text,
  duration_s numeric,
  render_ms integer,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists vl_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  video_id uuid not null references vl_videos(id) on delete cascade,
  platforms text[] not null,
  captions jsonb not null default '{}',
  scheduled_at timestamptz,
  status text not null default 'queued',
  request_id text,
  results jsonb,
  created_at timestamptz not null default now()
);

create table if not exists vl_crm_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  external_id text,
  name text not null,
  domain text,
  industry text,
  size text,
  stage text,
  source text not null default 'fixture',
  meta jsonb not null default '{}',
  last_scanned_at timestamptz
);

create table if not exists vl_crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  account_id uuid references vl_crm_accounts(id) on delete cascade,
  name text not null,
  title text,
  email text,
  linkedin_url text,
  meta jsonb not null default '{}'
);

create table if not exists vl_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  account_id uuid not null references vl_crm_accounts(id) on delete cascade,
  kind text not null,
  headline text not null,
  summary text not null default '',
  evidence_url text,
  detected_at timestamptz not null default now(),
  relevance numeric not null default 0,
  urgency numeric not null default 0,
  hash text not null,
  status text not null default 'new',
  unique (workspace_id, hash)
);

create table if not exists vl_video_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references vl_workspaces(id) on delete cascade,
  signal_id uuid references vl_signals(id) on delete set null,
  contact_id uuid references vl_crm_contacts(id) on delete set null,
  script jsonb,
  video_id uuid references vl_videos(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  status text not null default 'draft',
  sent_to text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vl_note_views (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references vl_video_notes(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  user_agent text
);

create table if not exists vl_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references vl_workspaces(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued',
  attempts integer not null default 0,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists vl_jobs_queue on vl_jobs (status, run_at);

create table if not exists vl_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references vl_workspaces(id) on delete cascade,
  provider text not null,
  units numeric not null default 1,
  cost_usd numeric not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- claim one queued job; the worker calls this with the service key
create or replace function vl_claim_job(kinds text[]) returns setof vl_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update vl_jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id = (
    select id from vl_jobs
    where status = 'queued' and run_at <= now() and kind = any(kinds)
    order by run_at
    for update skip locked
    limit 1
  )
  returning j.*;
end;
$$;

-- row level security: members of a workspace see and edit that workspace
do $$
declare t text;
begin
  foreach t in array array[
    'vl_brain_docs','vl_brain_chunks','vl_voice_profiles','vl_ideas','vl_recordings',
    'vl_videos','vl_publish_jobs','vl_crm_accounts','vl_crm_contacts','vl_signals',
    'vl_video_notes','vl_jobs','vl_usage'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_member', t);
    execute format(
      'create policy %I on %I for all using (vl_is_member(workspace_id)) with check (vl_is_member(workspace_id))',
      t || '_member', t);
  end loop;
end $$;

alter table vl_workspaces enable row level security;
drop policy if exists vl_workspaces_member on vl_workspaces;
create policy vl_workspaces_member on vl_workspaces for all
  using (vl_is_member(id) or owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table vl_members enable row level security;
drop policy if exists vl_members_self on vl_members;
create policy vl_members_self on vl_members for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table vl_note_views enable row level security;
drop policy if exists vl_note_views_member on vl_note_views;
create policy vl_note_views_member on vl_note_views for select
  using (exists (select 1 from vl_video_notes n where n.id = note_id and vl_is_member(n.workspace_id)));

-- storage: recordings stay private, finished videos are public by unguessable path
insert into storage.buckets (id, name, public) values ('vl-recordings', 'vl-recordings', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('vl-videos', 'vl-videos', true)
  on conflict (id) do nothing;
