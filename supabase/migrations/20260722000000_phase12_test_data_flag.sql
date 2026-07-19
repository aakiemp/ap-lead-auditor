-- Phase 12 (checkpoint): test-data classification. Adds businesses.is_test
-- and searches.is_test, both boolean not null default false, and backfills
-- them against an explicit, audited list of row ids -- never a name
-- pattern, wildcard, or regex. No other schema changes. No rows are
-- deleted. No index is added (see note below).
--
-- Every other test-relevant table (websites, audit_jobs, audits,
-- audit_findings, audit_scores, screenshots, search_businesses,
-- lead_profiles, lead_activity) derives test status through its existing
-- foreign key back to businesses or searches -- it does not get its own
-- is_test column. Application code excludes test data by joining/
-- filtering on the owning business_id or search_id.
--
-- Backfill provenance: every id below was read directly from the live
-- database (not guessed or pattern-matched) and cross-checked against
-- README.md's "Development fixtures" section plus a live audit of every
-- business/search row not covered by that documentation, presented to
-- and confirmed by the user before this file was written. See CLAUDE.md
-- "Roadmap" / Phase 12 write-up for the full methodology.
--
-- Two businesses and two searches are DELIBERATELY left at their
-- default (is_test = false) despite not being explicitly listed in an
-- UPDATE below -- see the "left as production" note at the end of this
-- file. This is intentional, not an oversight.

alter table businesses add column is_test boolean not null default false;
alter table searches add column is_test boolean not null default false;

comment on column businesses.is_test is
  'True only for rows explicitly backfilled or explicitly created via '
  'an operator-checked "this is test data" box (manual lead form) or '
  'an exploratory Places search (see searches.is_test). Never inferred '
  'from name, source, or any other signal -- an unchecked default of '
  'false always means production/real data.';

comment on column searches.is_test is
  'True only for rows explicitly backfilled or explicitly created via '
  'an operator-checked "exploratory/test search" box. When true, every '
  'newly-created business imported by that search also gets '
  'is_test = true; an existing business matched by google_place_id '
  'keeps whatever is_test value it already had -- an exploratory '
  'search can never flip an existing real business to test, or vice '
  'versa.';

-- ---------------------------------------------------------------------
-- Backfill: businesses.is_test = true
-- 45 rows total, in three groups. Every id was read from the live
-- database; grouping below is for auditability only, not three
-- separate mechanisms.
-- ---------------------------------------------------------------------

-- Group 1 -- 23 documented fixtures (README.md "Development fixtures",
-- Phases 3/4/7/9/9.5/11).
update businesses set is_test = true where id in (
  'd8708c4f-9f5d-4e1d-9d0a-d4da79791adc', -- Reachable Site Test (Phase 3 verify)
  '2411c414-e2d7-4aae-8df6-6bd9d3c10079', -- Unreachable Host Test (Phase 3 verify)
  '8931179a-d8ca-45ff-abe2-a0e0f4d4c245', -- Duplicate Submission Test (Phase 4 verify)
  '753d0cdb-b225-4b0b-a9ef-cd8fda7685f2', -- HTML Scan Test - Divi Roofing Demo (Phase 7 verify)
  '9da0ba8b-ceb2-4189-8e10-01a7c2181a19', -- Queue Test A
  '3745eea4-be3a-45a9-bd4d-81ad051458e7', -- Queue Test B
  'f760a8d1-abbc-478c-a551-2e1bfddbca82', -- Queue Test C
  '975ae469-2b92-4daf-8463-74025eb86cdb', -- Queue Test D
  'e7e540d6-eba0-48a5-b36f-909ffa53e0d8', -- Queue Test E - Unreachable
  'f2a8aebc-f7a5-4485-b211-832057940c01', -- Queue Test F - NonHTML
  '7613610f-f285-4d2d-ae03-46eb8a3ab59d', -- Queue Test G - Concurrent Claim
  '3b801e0b-10ce-4893-9b4f-7d12d2031899', -- Queue Test H - Dup Test
  'f83149c9-ccb2-4c37-a963-dc085cb8a21e', -- Queue Test I - Invalid Mix
  '957252a2-0a13-48a0-b925-4def962a53e5', -- Queue Test J - Stale Fixture
  'b1505a22-edfc-42e7-9516-50fb65231ae6', -- Progress Test A
  'ab0f5f24-1483-48a0-8b98-2d6b3a49d4d8', -- Progress Test B
  'ade7de59-8209-4be4-a66b-c7512d161101', -- Progress Test C
  'd1e0e2d5-46e3-4853-8db8-994c0274a79f', -- Progress Test D
  'efec3c10-41f9-4cff-8949-d65ce4c2f562', -- Progress Test E
  'a3efca62-3bba-4564-be50-9324979eb30a', -- Progress Test F
  '806fec0b-279a-49be-8ae2-af28b27e0ed5', -- Progress Test G
  '04ee934e-6231-4f17-aea9-52bd54fdf1ab', -- Stale Progress Test
  '9bf9c33c-e100-4719-ab10-c434314bdadc'  -- Pipeline Test Lead
);

-- Group 2 -- undocumented, confirmed-test businesses (not in README's
-- fixture tables; confirmed with the user before this migration was
-- written).
update businesses set is_test = true where id in (
  '83cda246-2350-4d5b-bf0b-2f00742a1196', -- Single Audit Test
  '29ff589f-ee47-4a66-b386-d62b5ecef021'  -- Render Check
);

-- Group 3 -- 20 Portland, OR coffee-shop businesses imported by the
-- Phase 8 "coffee shop" / Portland, OR test searches (real Places
-- data, imported solely to test discovery/filtering/dedup -- not a
-- live sales target). Includes both "Stumptown Coffee Roasters" rows
-- (two distinct real physical locations, both part of this test
-- effort -- matched by id, not by the shared name).
update businesses set is_test = true where id in (
  '49273848-ef2a-480d-bcae-f43d80e6ebcc', -- Less and more coffee
  'b5811a96-4737-4c84-bc3b-9da12ee4ecda', -- Good Coffee
  '1a72da13-60ae-4ede-86e8-8b4983d422c2', -- Drip Drop Coffee
  'a14c4268-d2af-4b9a-bf83-735769383d74', -- Rose City Coffee Co.
  'd9cf237d-1dd3-4fd5-8686-f5bf64e38243', -- Cadejo Coffee
  'b5558c25-91c5-4fa0-bed0-d4d39546c00c', -- Stumptown Coffee Roasters (location 1)
  '2f2695e7-bc57-4fe4-a2d6-872b4ff1d214', -- PDX Coffee Club
  'dee5d766-9017-4856-8312-fb1e5768ad40', -- BEST Coffee
  'beb96a8b-7d5a-415d-8d2a-8168b7b896fe', -- Slow Haste Coffee
  'd56d7063-1d4a-4f9f-8e12-2e47ad335caa', -- Our Spot
  'cae44fd4-2513-4c55-9ac9-d6a87170057a', -- 40 LBS Coffee + Bar
  '2141f2c5-6c27-4116-9bca-6ad0351a9e05', -- Case Study Coffee Roasters
  'b36bb063-7d51-4b35-a52d-de85268358b6', -- Above Grnd Coffee
  'c8b222d2-dd66-4631-b016-852608d5ef54', -- No Preference Coffee
  '7b85efdc-ad32-45b1-9674-335a8eb21c77', -- Sterling Coffee Roasters
  'df3e5058-8183-4b49-a612-55a7c0cffde0', -- Portland Coffee Roasters
  '9d3ddd17-086d-442f-a512-495186bdba95', -- Stumptown Coffee Roasters (location 2)
  '9b1ffcde-806d-40d1-9d35-571cb82d42fd', -- Portland Lux Coffee
  '510046a0-f096-4509-9baf-4dc08e44505b', -- AdaptCafe
  '7527d75f-7890-4ac5-9ef1-d3bebed36b83'  -- Coava Coffee Roasters
);

-- ---------------------------------------------------------------------
-- Backfill: searches.is_test = true
-- All 4 Portland, OR "coffee shop" search rows -- the 3 completed
-- searches (README's Search A/B/C) plus the earlier failed attempt
-- (zero results, zero businesses linked; the documented
-- GOOGLE_PLACES_API_KEY 403 permission failure from Phase 8 testing,
-- before the user fixed billing in Google Cloud Console).
-- ---------------------------------------------------------------------
update searches set is_test = true where id in (
  '4f87c151-5cf5-4e5c-940d-926e2a79a2c8', -- coffee shop / Portland, OR -- failed, 0 found/imported
  'd96afe33-a2c0-488b-9da2-c8475fbd5ab3', -- coffee shop / Portland, OR -- Search A, 20/20
  'e06fc9db-99c9-45a8-a461-95ff2b84166e', -- coffee shop / Portland, OR -- Search B, 20/20
  'da67a791-cea3-46c0-a8e8-f3e4dd03e637'  -- coffee shop / Portland, OR -- Search C, 20/7
);

-- ---------------------------------------------------------------------
-- Left as production (is_test stays at its default of false) --
-- listed here explicitly, not as an UPDATE, so this file is a complete
-- audit trail of every row this migration considered:
--
-- businesses:
--   6ecaa9ac-d83a-473d-a450-857500187879 -- Watercrest St Lucie West
--   ec40726b-edaa-49bb-b133-a048de9130dd -- Excellence Senior Living
-- searches:
--   620dba25-baca-4939-8260-bb25064055fd -- assisted living facility, Port St. Lucie
--   e75763c3-8cda-4451-ab64-c418a6655470 -- assisted living facility, Orlando
--
-- Both businesses are real Google-Places-imported leads under active
-- manual review by the operator (one already has a real lead_activity
-- status-change row, new -> reviewing) -- not test data by any
-- definition, and never touched by this or any future test-data
-- migration without a separate, explicit decision.
-- ---------------------------------------------------------------------

-- No index is added on either is_test column. At current and
-- near-term row counts (dozens to low hundreds), a low-cardinality
-- boolean index is very unlikely to improve any query plan over a
-- sequential scan -- an index will only be proposed later if an actual
-- EXPLAIN ANALYZE against production data demonstrates a real need.
