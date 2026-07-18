-- Phase 9.5: audit progress visibility.
--
-- Adds two nullable columns to the existing audit_jobs table so
-- runAudit() can record which sub-stage a currently-`auditing` job is
-- in, for the /queue dashboard's live progress display. No new table,
-- no backfill, no change to audits/audit_findings/audit_scores/
-- screenshots, no change to any existing row's status.
--
-- progress_stage is informational only -- audit_jobs.status remains
-- the sole source of truth for whether a job is queued, running, or
-- terminal (completed/partial/failed). Nothing in the application
-- ever branches on progress_stage for that determination; it is read
-- purely to render a human-readable "what is it doing right now"
-- message and an "as of" recency caption. See CLAUDE.md for the full
-- rationale and stage-placement design.

alter table audit_jobs
  add column progress_stage text,
  add column progress_updated_at timestamptz;

alter table audit_jobs
  add constraint audit_jobs_progress_stage_check
  check (progress_stage in (
    'claiming', 'checking_reachability', 'analyzing_website',
    'saving_results', 'calculating_score',
    'completed', 'partial', 'failed'
  ));

comment on column audit_jobs.progress_stage is
  'Informational only -- audit_jobs.status is the sole source of '
  'truth for whether a job is queued/running/terminal. Set alongside '
  'progress_updated_at at each real stage transition inside '
  'runAudit() (never estimated from elapsed time); null for a job '
  'that has never been claimed. PageSpeed and homepage-HTML analysis '
  'run concurrently, so there is deliberately no separate stage for '
  'each -- both are represented together by analyzing_website.';

comment on column audit_jobs.progress_updated_at is
  'When progress_stage was last written. Used only to render a '
  'relative "as of" caption in the UI -- not a substitute for the '
  'existing claimed_at-based 15-minute "Possibly stale" warning.';

-- No service_role grant changes needed: this migration adds columns
-- to an already-granted existing table (audit_jobs), not a new
-- table. Table-level grants from the Phase 2/6 migrations already
-- cover all of that table's columns, existing and future.
