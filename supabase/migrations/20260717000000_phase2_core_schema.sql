-- Phase 2: core database foundation for the manual single-website audit flow.
--
-- Tables: businesses, websites, audit_jobs, audits, audit_findings, audit_scores.
--
-- RLS: every table below has row level security ENABLED with NO policies
-- attached. This is intentional, not an oversight — see the "Row level
-- security" section near the bottom of this file. There is no
-- authentication in the app yet, so a user-based policy (e.g. keyed on
-- auth.uid()) would be misleading: it would imply a per-user data model
-- that doesn't exist. Enabling RLS with zero policies instead means
-- "deny all access to the anon and authenticated roles" — the only way
-- to read or write these tables is the server-side service-role client
-- (src/lib/supabase/server.ts), which always bypasses RLS. When
-- authentication is introduced, real per-owner policies replace this;
-- nothing here needs to be undone first.

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current on mutable tables.
-- Only attached to tables whose rows are edited after creation
-- (businesses, websites, audit_jobs, audit_findings). audits and
-- audit_scores are treated as immutable once written and do not get
-- this trigger or an updated_at column.
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  name text not null,
  city text,
  state text,
  phone text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table businesses is
  'A discovered or manually entered local business. google_place_id is '
  'nullable/unique now in anticipation of Google Places import (Phase 8); '
  'manually entered businesses leave it null.';

create trigger set_businesses_updated_at
  before update on businesses
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- websites — one primary website per business (unique business_id).
-- Multiple audits reference the same website row over time.
-- ---------------------------------------------------------------------
create table websites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  input_url text not null,
  final_url text,
  root_domain text,
  is_reachable boolean,
  http_status int,
  https_enabled boolean,
  redirect_count int,
  redirect_chain jsonb,
  http_to_https_redirect boolean,
  failure_reason text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint websites_business_id_unique unique (business_id)
);

comment on table websites is
  'The single primary website for a business. The unique constraint on '
  'business_id enforces one-website-per-business for this MVP; it also '
  'serves as the index for the business_id foreign key, so no separate '
  'index is added below.';

create trigger set_websites_updated_at
  before update on websites
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- audit_jobs — the async job state machine.
-- ---------------------------------------------------------------------
create table audit_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  website_id uuid not null references websites(id) on delete cascade,
  audit_depth text not null
    check (audit_depth in ('discovery_only', 'basic', 'deep')),
  status text not null default 'pending'
    check (status in (
      'pending', 'queued', 'discovering', 'auditing',
      'completed', 'partial', 'failed', 'skipped'
    )),
  attempt int not null default 1,
  claimed_by text,
  claimed_at timestamptz,
  idempotency_key text unique,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table audit_jobs is
  'State machine for a single audit run request. idempotency_key is '
  'unique so a duplicate callback (e.g. from Make.com) cannot double '
  'process the same job stage.';

create trigger set_audit_jobs_updated_at
  before update on audit_jobs
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- audits — one row per completed/partial/failed audit run.
-- Immutable after creation: no updated_at column, no update trigger.
-- Raw and normalized PageSpeed data both live here as jsonb.
-- ---------------------------------------------------------------------
create table audits (
  id uuid primary key default gen_random_uuid(),
  audit_job_id uuid not null references audit_jobs(id) on delete cascade,
  website_id uuid not null references websites(id) on delete cascade,
  audit_depth text not null
    check (audit_depth in ('discovery_only', 'basic', 'deep')),
  status text not null
    check (status in ('completed', 'partial', 'failed')),
  raw_pagespeed_mobile jsonb,
  raw_pagespeed_desktop jsonb,
  pagespeed_mobile jsonb,
  pagespeed_desktop jsonb,
  homepage_title text,
  meta_description text,
  canonical_url text,
  robots_meta text,
  h1_text text,
  h1_count int,
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table audits is
  'One completed/partial/failed audit run. Immutable once written — a '
  're-run creates a new audit_jobs row and a new audits row rather than '
  'updating this one. raw_pagespeed_* holds the untouched API response; '
  'pagespeed_* holds normalized fields extracted from it, in the same row.';

-- ---------------------------------------------------------------------
-- audit_findings — one row per individually verifiable finding.
-- ---------------------------------------------------------------------
create table audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  category text not null
    check (category in (
      'performance', 'accessibility', 'seo', 'conversion', 'technical',
      'trust', 'contact', 'freshness', 'content', 'local_consistency',
      'technology', 'broken_link'
    )),
  finding_type text not null,
  title text not null,
  description text not null,
  evidence text,
  source_url text,
  source_type text,
  severity text not null
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  confidence text not null
    check (confidence in ('verified', 'likely', 'manual_review')),
  status text not null default 'active'
    check (status in ('active', 'verified', 'dismissed')),
  raw_value text,
  normalized_value text,
  points int not null default 0,
  rule_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table audit_findings is
  'A single objective, evidence-based finding. business_id is '
  'denormalized from audits->audit_jobs for simpler querying. status is '
  'mutable (manual verify/dismiss actions), hence the updated_at trigger.';

create trigger set_audit_findings_updated_at
  before update on audit_findings
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- audit_scores — one score row per audit. Immutable after creation.
-- ---------------------------------------------------------------------
create table audit_scores (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  website_need_score int,
  business_value_score int,
  contactability_score int,
  priority_score int,
  breakdown jsonb,
  created_at timestamptz not null default now(),
  constraint audit_scores_audit_id_unique unique (audit_id)
);

comment on table audit_scores is
  'Exactly one score row per audit (enforced by the unique constraint on '
  'audit_id, which also indexes that foreign key). Immutable once written.';

-- ---------------------------------------------------------------------
-- Indexes for foreign key columns not already covered by a unique
-- constraint above, plus the audit_jobs.status lookup index used by
-- job claiming.
-- ---------------------------------------------------------------------
create index idx_audit_jobs_business_id on audit_jobs (business_id);
create index idx_audit_jobs_website_id on audit_jobs (website_id);
create index idx_audit_jobs_status on audit_jobs (status);

create index idx_audits_audit_job_id on audits (audit_job_id);
create index idx_audits_website_id on audits (website_id);

create index idx_audit_findings_audit_id on audit_findings (audit_id);
create index idx_audit_findings_business_id on audit_findings (business_id);

-- Not indexed separately (already covered by a unique constraint above):
--   websites.business_id      -> websites_business_id_unique
--   audit_scores.audit_id     -> audit_scores_audit_id_unique
--   businesses.google_place_id -> businesses_google_place_id_key
--   audit_jobs.idempotency_key -> audit_jobs_idempotency_key_key

-- ---------------------------------------------------------------------
-- Row level security: enabled, no policies, on all six tables.
-- See the file header comment for why this is intentional rather than
-- a temporary placeholder to "fill in later." All application access
-- goes through the server-side service-role client, which bypasses RLS
-- unconditionally, so deny-all here has no effect on the app today —
-- it only closes off direct anon/authenticated access via the
-- Supabase auto-generated REST API.
-- ---------------------------------------------------------------------
alter table businesses enable row level security;
alter table websites enable row level security;
alter table audit_jobs enable row level security;
alter table audits enable row level security;
alter table audit_findings enable row level security;
alter table audit_scores enable row level security;
