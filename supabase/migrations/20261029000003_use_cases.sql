-- Ideas and videos carry the use case they were made for.
alter table vl_ideas add column if not exists use_case text not null default 'general';
alter table vl_videos add column if not exists use_case text not null default 'general';
create index if not exists vl_ideas_use_case on vl_ideas (workspace_id, use_case, day desc);
