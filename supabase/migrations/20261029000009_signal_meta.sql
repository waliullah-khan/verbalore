-- Structured detail on a signal, for example which builder a permit signal is about.
alter table vl_signals add column if not exists meta jsonb not null default '{}';
