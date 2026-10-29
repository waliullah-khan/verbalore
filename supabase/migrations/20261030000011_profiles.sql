-- One row per self-serve account: who signed up, their LinkedIn and company website, and whether the brand brain is built.
-- RLS is on and a person can read only their own row. Every write goes through the server (service role).
create table if not exists vl_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid references vl_workspaces (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  linkedin_url text not null default '',
  website text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists vl_profiles_created_idx on vl_profiles (created_at desc);
create unique index if not exists vl_profiles_email_key on vl_profiles (lower(email));

alter table vl_profiles enable row level security;

drop policy if exists vl_profiles_self_read on vl_profiles;
create policy vl_profiles_self_read on vl_profiles for select using (auth.uid() = user_id);
