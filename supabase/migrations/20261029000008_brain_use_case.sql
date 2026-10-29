-- A brain document can apply to every use case (null) or to one of them.
alter table vl_brain_docs add column if not exists use_case text;
