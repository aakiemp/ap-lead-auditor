-- Phase 8: Google Places business discovery.
--
-- Adds `searches` (one row per niche+location search request) and
-- `search_businesses` (join table linking a search to the businesses
-- it found, one row per result, carrying any duplicate-review flag).
-- Extends `businesses` with the fields Google Places Text Search (New)
-- returns. No reachability/audit data is touched here -- discovery
-- never contacts a business's website; that only happens later, when
-- a business is manually selected and its basic audit is queued (see
-- CLAUDE.md).
--
-- RLS: enabled with NO policies on both new tables, matching every
-- other table (see the Phase 2 migration's header comment for the
-- full rationale). Deny-all for anon/authenticated; the server-only
-- service-role client bypasses RLS and is the only way these tables
-- are ever read or written.

-- ---------------------------------------------------------------------
-- searches
-- ---------------------------------------------------------------------
create table searches (
  id uuid primary key default gen_random_uuid(),
  niche text not null,
  city text not null,
  state text not null,
  zip text,
  max_results int not null default 20,
  min_rating numeric,
  min_reviews int,
  exclude_no_website boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'partial', 'failed')),
  businesses_found int not null default 0,
  businesses_imported int not null default 0,
  businesses_filtered int not null default 0,
  businesses_without_website int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table searches is
  'One row per niche+location Google Places search request. Runs '
  'synchronously within a single Server Action (no async worker yet) '
  '-- status starts pending and is written once to its terminal value '
  '(completed/partial/failed) in the same request. businesses_found is '
  'the raw Places result count; businesses_filtered is how many were '
  'excluded by min_rating/min_reviews/exclude_no_website; '
  'businesses_imported is how many resulted in a new or reused '
  'businesses row; businesses_without_website is a breakdown of '
  'businesses_imported.';

create trigger set_searches_updated_at
  before update on searches
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- search_businesses
-- ---------------------------------------------------------------------
create table search_businesses (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references searches(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  rank_in_search int,
  is_new_business boolean not null default false,
  duplicate_warning text,
  created_at timestamptz not null default now(),
  constraint search_businesses_unique unique (search_id, business_id)
);

comment on table search_businesses is
  'One row per (search, business) pairing -- immutable once created, '
  'no updated_at/trigger needed. duplicate_warning is set only when '
  'this business was newly created during this search but matched an '
  'existing business by normalized phone or website domain (a '
  'flag-only signal; the businesses are never auto-merged -- see '
  'CLAUDE.md). The unique constraint also indexes search_id as its '
  'leftmost column, so a separate search_id index is not needed.';

create index idx_search_businesses_business_id on search_businesses (business_id);

alter table searches enable row level security;
alter table search_businesses enable row level security;

-- ---------------------------------------------------------------------
-- businesses: Google Places fields.
--
-- All nullable -- a manually-created business (Phase 3+) never has
-- these populated, and that is expected, not an error state.
-- ---------------------------------------------------------------------
alter table businesses
  add column primary_category text,
  add column categories text[],
  add column address text,
  add column zip text,
  add column lat numeric,
  add column lng numeric,
  add column google_rating numeric,
  add column google_review_count integer,
  add column google_maps_url text,
  add column opening_hours jsonb,
  add column business_status text,
  add column phone_normalized text,
  add column last_places_sync_at timestamptz;

comment on column businesses.business_status is
  'Google Places businessStatus verbatim (e.g. OPERATIONAL, '
  'CLOSED_TEMPORARILY, CLOSED_PERMANENTLY). Intentionally not '
  'constrained by a CHECK -- this is externally-sourced data Google '
  'could extend, unlike our own internally-defined status enums.';

comment on column businesses.last_places_sync_at is
  'When this business''s cached Google Places fields were last '
  'written. No refresh feature reads this yet (Phase 8 only sets it '
  'on import/re-encounter) -- it exists so a future staleness-aware '
  'refresh does not require another migration.';

-- Supports the secondary (flag-only, never auto-merge) duplicate-match
-- check performed during import: an existing business's normalized
-- phone is compared against a newly-found place's normalized phone.
create index idx_businesses_phone_normalized on businesses (phone_normalized);

-- Supports the same secondary duplicate-match check via website
-- domain. websites.root_domain has existed since Phase 3 but was
-- never indexed until this query pattern needed it.
create index idx_websites_root_domain on websites (root_domain);

-- ---------------------------------------------------------------------
-- service_role grants, consistent with the Phase 6 migration's
-- pattern: explicit grants on the tables this migration creates, plus
-- re-asserting the default-privileges rule so any table created by
-- still later migrations continues to need no manual fix.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on searches, search_businesses to service_role;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
