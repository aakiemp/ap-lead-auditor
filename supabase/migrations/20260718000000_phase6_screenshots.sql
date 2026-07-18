-- Phase 6: screenshots table + private Storage bucket for homepage
-- screenshot capture (mobile + desktop, both full-page).
--
-- RLS: enabled with NO policies, matching every other table (see the
-- Phase 2 migration's header comment for the full rationale). Deny-all
-- for anon/authenticated; the server-only service-role client bypasses
-- RLS and is the only way this table is ever read or written.

create table screenshots (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  device_type text not null check (device_type in ('mobile', 'desktop')),
  page_url text not null,
  storage_path text not null,
  viewport_width int not null,
  viewport_height int not null,
  full_page boolean not null default true,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint screenshots_audit_device_unique unique (audit_id, device_type)
);

comment on table screenshots is
  'One row per successfully captured device-type screenshot for an '
  'audit. A missing row means that device type was not captured -- '
  'failed attempts are never persisted (Phase 6). The unique '
  'constraint on (audit_id, device_type) is both the one-screenshot- '
  'per-device-per-audit rule and the duplicate-capture guard.';

-- Foreign key index not already covered by the unique constraint above
-- (which indexes audit_id as its leftmost column, so audit_id lookups
-- are already efficient without a separate index).
create index idx_screenshots_business_id on screenshots (business_id);

alter table screenshots enable row level security;

-- ---------------------------------------------------------------------
-- service_role table privileges.
--
-- The Phase 2 migration did not include explicit GRANT statements, and
-- this project's service_role initially lacked basic table privileges
-- (SELECT/INSERT/UPDATE/DELETE) on all six Phase 2 tables -- confirmed
-- during Phase 3 testing via a PostgREST "permission denied" error,
-- and fixed at the time by running GRANTs directly against the
-- project. Re-asserting those grants here (safe/idempotent -- GRANT
-- does not error on an already-held privilege) plus granting on the
-- new screenshots table means a FRESH database, built from just the
-- migration files with no manual out-of-band fix, ends up in the same
-- working state as this project. The ALTER DEFAULT PRIVILEGES
-- statements extend this to any table created by future migrations,
-- so this class of issue should not recur in later phases.
-- ---------------------------------------------------------------------
grant select, insert, update, delete
  on businesses, websites, audit_jobs, audits, audit_findings, audit_scores, screenshots
  to service_role;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- ---------------------------------------------------------------------
-- Private Storage bucket for screenshot files. Idempotent -- safe to
-- re-run. No anon/authenticated policies are added; all access goes
-- through the server-only service-role client, same as every table.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;
