-- People ask for access from the login page; an admin approves or denies each one.
-- RLS is on with no policies, so only the server (service role) can read or write this table.
create table if not exists vl_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  linkedin_url text not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  invite_token text unique,
  invite_expires_at timestamptz,
  user_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index if not exists vl_access_requests_email_key on vl_access_requests (lower(email));
create index if not exists vl_access_requests_status_idx on vl_access_requests (status, created_at desc);

alter table vl_access_requests enable row level security;
