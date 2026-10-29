-- Where each signal was found, and no duplicate organisations in one workspace.
alter table vl_signals add column if not exists source text not null default 'news';
create unique index if not exists vl_crm_accounts_unique_name on vl_crm_accounts (workspace_id, lower(name));
