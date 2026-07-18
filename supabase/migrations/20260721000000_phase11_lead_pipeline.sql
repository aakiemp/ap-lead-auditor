-- Phase 11: lead pipeline (status, priority, notes, outreach angle,
-- contact/follow-up dates) plus an atomic, trigger-enforced status
-- history. No changes to businesses/websites/audit_jobs/audits/
-- audit_findings/audit_scores/screenshots/searches/search_businesses.
--
-- Design decision (see CLAUDE.md for the full write-up): status-
-- change history is trigger-only, from_status/to_status only, no
-- per-transition note. The general lead_profiles.notes field already
-- gives the operator a place to record *why* a status changed, at
-- the same moment they change it, so a second note-capture path
-- (which would require passing an out-of-band value into the trigger
-- via a transaction-local session setting) was judged unnecessary
-- complexity for this phase. Every status change, through any code
-- path -- the app, a future script, a manual SQL statement -- gets a
-- correct history row automatically; there is no way to change
-- status without it.
--
-- lead_profiles is NOT lazily created. Every business has exactly one
-- lead_profiles row from the moment it exists: this migration
-- backfills one for every existing business, and a new AFTER INSERT
-- trigger on businesses creates one for every future business. A
-- missing row is therefore always an unexpected state, never the
-- normal representation of status = 'new' -- the application may
-- still handle it defensively, but should treat it as abnormal.

-- ---------------------------------------------------------------------
-- lead_profiles
-- ---------------------------------------------------------------------
create table lead_profiles (
  business_id uuid primary key references businesses(id) on delete cascade,
  status text not null default 'new'
    check (status in (
      'new', 'reviewing', 'qualified', 'outreach_ready', 'contacted',
      'replied', 'follow_up', 'won', 'lost', 'not_a_fit'
    )),
  priority text
    check (priority in ('low', 'medium', 'high')),
  notes text,
  outreach_angle text,
  last_contacted_date date,
  next_follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table lead_profiles is
  'One row per business, always -- backfilled for every existing '
  'business by this migration and auto-created for every future one '
  'by businesses_create_lead_profile (see below). Not lazily created; '
  'a missing row is an unexpected state, not the normal '
  'representation of status = new. Status transitions are fully '
  'permissive (any value to any other value) -- this is a manual, '
  'single-operator tool, not an enforced workflow. Every field here '
  'is set only by an explicit operator action; nothing in this '
  'schema or its triggers ever derives status/priority from audit '
  'score, Google Places data, or any other signal.';

comment on column lead_profiles.priority is
  'Entirely manual. Never inferred from audit score, Google rating, '
  'review count, source, website reachability, or finding severity.';

comment on column lead_profiles.notes is
  'Internal only. Never included in Phase 10 outreach output '
  '(plain-text or markdown) -- the outreach DTO does not include '
  'this field, structurally, not by convention alone.';

comment on column lead_profiles.next_follow_up_date is
  'Date only, no time component -- a reminder date, not a scheduled '
  'event. Never required, never used to automatically change status '
  'or send a reminder; the /leads dashboard only ever displays it.';

create trigger set_lead_profiles_updated_at
  before update on lead_profiles
  for each row
  execute function set_updated_at();

create index idx_lead_profiles_status on lead_profiles (status);
create index idx_lead_profiles_priority on lead_profiles (priority);
create index idx_lead_profiles_next_follow_up_date on lead_profiles (next_follow_up_date);

-- ---------------------------------------------------------------------
-- lead_activity — append-only status history. Application code must
-- never UPDATE or DELETE a row here; only lead_profiles_log_status_
-- change (below) ever inserts into this table.
-- ---------------------------------------------------------------------
create table lead_activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  from_status text
    check (from_status is null or from_status in (
      'new', 'reviewing', 'qualified', 'outreach_ready', 'contacted',
      'replied', 'follow_up', 'won', 'lost', 'not_a_fit'
    )),
  to_status text not null
    check (to_status in (
      'new', 'reviewing', 'qualified', 'outreach_ready', 'contacted',
      'replied', 'follow_up', 'won', 'lost', 'not_a_fit'
    )),
  note text,
  created_at timestamptz not null default now()
);

comment on table lead_activity is
  'Append-only status-change history, written exclusively by the '
  'lead_profiles_log_status_change trigger -- never directly by '
  'application code. One row per real status change (never for the '
  'initial default/backfilled new state, which is created by INSERT '
  'not UPDATE, and never for a same-value no-op update). note stays '
  'unused as of Phase 11 (trigger-only history has no note-capture '
  'path); the column exists so a later phase can populate it without '
  'a further migration.';

-- Serves both "all activity for one business" and "newest first" in
-- a single index, matching the only query shape this table is read
-- with (a per-business history list, most recent first).
create index idx_lead_activity_business_id_created_at
  on lead_activity (business_id, created_at desc);

alter table lead_profiles enable row level security;
alter table lead_activity enable row level security;

-- ---------------------------------------------------------------------
-- Backfill: exactly one lead_profiles row for every business that
-- already exists. Safe to re-run (ON CONFLICT DO NOTHING) -- never
-- overwrites a row that already exists.
-- ---------------------------------------------------------------------
insert into lead_profiles (business_id, status)
select id, 'new' from businesses
on conflict (business_id) do nothing;

-- ---------------------------------------------------------------------
-- Auto-create a lead_profiles row for every future business. Runs
-- AFTER INSERT so it never interferes with the businesses insert
-- itself; ON CONFLICT DO NOTHING guards against ever double-creating
-- a row (e.g. if a future migration's backfill logic overlaps this).
-- ---------------------------------------------------------------------
create or replace function create_default_lead_profile()
returns trigger
language plpgsql
as $$
begin
  insert into lead_profiles (business_id, status)
  values (new.id, 'new')
  on conflict (business_id) do nothing;
  return new;
end;
$$;

comment on function create_default_lead_profile() is
  'Fires AFTER INSERT on businesses so every business, manual or '
  'Google-Places-imported, gets exactly one lead_profiles row the '
  'moment it exists -- no lazy creation, no missing-row ambiguity.';

create trigger businesses_create_lead_profile
  after insert on businesses
  for each row
  execute function create_default_lead_profile();

-- ---------------------------------------------------------------------
-- Atomic status history: fires only on a genuine status change
-- (OLD.status IS DISTINCT FROM NEW.status, so a same-value re-submit
-- never creates a row), in the exact same transaction as the status
-- UPDATE that triggered it -- there is no code path, application or
-- otherwise, where a status change can be recorded without its
-- history row, or vice versa.
-- ---------------------------------------------------------------------
create or replace function log_lead_status_change()
returns trigger
language plpgsql
as $$
begin
  insert into lead_activity (business_id, from_status, to_status)
  values (new.business_id, old.status, new.status);
  return new;
end;
$$;

comment on function log_lead_status_change() is
  'Fires AFTER UPDATE OF status on lead_profiles, only when the '
  'value actually changed. This is the ONLY code path that ever '
  'writes to lead_activity -- application code performs a plain '
  'UPDATE ... SET status = ... and this trigger guarantees the '
  'history row is written atomically alongside it.';

create trigger lead_profiles_log_status_change
  after update of status on lead_profiles
  for each row
  when (old.status is distinct from new.status)
  execute function log_lead_status_change();

-- ---------------------------------------------------------------------
-- service_role grants, consistent with the Phase 6/8/9.5 pattern:
-- explicit grants on the tables this migration creates, plus
-- re-asserting the default-privileges rule so any table created by
-- still later migrations continues to need no manual fix. The full
-- SELECT/INSERT/UPDATE/DELETE grant on lead_activity matches every
-- other table in this schema -- application code never calling
-- .update()/.delete() on it is enforced by code discipline (and, for
-- inserts, by the trigger being the only writer in practice), not by
-- narrowing SQL-level grants asymmetrically for one table.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on lead_profiles, lead_activity to service_role;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
