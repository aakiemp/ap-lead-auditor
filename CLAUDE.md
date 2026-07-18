# AP Webmaster — Lead Auditor

Guidance for working on this repository. Read this before writing code.

## Project purpose

An internal lead research and website audit tool for AP Webmaster (a web
development business). Given a niche and location (e.g. "Roofers in
Orlando, Florida"), the tool will eventually:

1. Discover relevant local businesses.
2. Collect public business details (Google Places).
3. Audit their websites for objective, measurable issues.
4. Store findings as individually verifiable records.
5. Calculate an opportunity score (website need, business value,
   contactability, priority).
6. Rank the strongest website-service prospects.
7. Let the owner manually review each lead's evidence.
8. Let the owner copy a structured, plain-text audit summary into
   ChatGPT or Claude for interpretation (no AI API calls from the app
   itself).
9. Track outreach status (new → reviewing → contacted → replied →
   qualified → closed, etc.).

This is a single-user internal MVP, not a polished commercial SaaS.
Prioritize a working vertical slice over completeness or polish.

## Approved architecture

- **Next.js (App Router) + TypeScript (strict) + Tailwind CSS**, deployed
  to Vercel (later phase).
- **Supabase** for database and storage. No authentication yet — see
  "Current phase" below. Every table has row level security **enabled
  with no policies** (deny-all for anon/authenticated roles); real
  per-owner policies get added once auth exists. All application data
  access goes through the server-only service-role client, which
  bypasses RLS.
- **Next.js API routes stay thin.** Long-running work (Places
  discovery, PageSpeed calls, screenshots, crawling) must never run
  inside a single long Vercel request. Use an async job model instead:
  `audit_jobs` rows move through
  `pending → queued → discovering/auditing → completed/partial/failed/skipped`.
- **Make.com (free tier)** — or, for local development, a manually run
  TypeScript worker script hitting the same API endpoints — claims jobs
  and calls external services (Google Places, PageSpeed, Apify), then
  posts grouped raw results back to secure Next.js API endpoints
  (`/api/jobs/claim`, `/api/jobs/update`, `/api/audits/pagespeed`,
  `/api/audits/crawl-results`, `/api/audits/complete`,
  `/api/audits/fail`). All scoring/finding-generation logic lives in the
  Next.js API/service layer, not in Make and not in the client.
- **Scoring and finding-generation logic lives in `src/lib/`
  service-layer functions**, never hardcoded inside React components.
- **One primary website per business.** Multiple audit runs are
  associated with that one `websites` row (not one website row per
  audit).
- **Raw PageSpeed responses are stored as Postgres `jsonb`** on the
  `audits` table (not Supabase Storage, not a separate normalized
  table) for now.
- External integrations planned: Google Places API, Google PageSpeed
  Insights API, Apify (screenshots/crawling), Make.com. No OpenAI API,
  no Anthropic API, no paid AI processing, no Airtable.

## Evidence-based wording rules

The app must never make unsupported or subjective claims. Every finding
must describe a directly observed fact, phrased so a skeptical reader
could verify it.

**Good:**
- "Mobile performance score measured at 34."
- "No contact form was detected on the pages reviewed."
- "The phone number was displayed as plain text rather than a
  telephone link."
- "Footer copyright year detected as 2021."
- "Two internal links returned 404 responses."
- "Google listing phone differs from the phone displayed in the
  footer."

**Bad — never write findings like this:**
- "This website is losing customers."
- "This site is violating the ADA."
- "This business has not updated its site since 2021."
- "They do not use analytics." (absence of detection ≠ absence of fact
  — say "not detected," not "not installed" or "absent.")
- "Their form does not work," unless it was safely and directly
  verified (forms are never submitted automatically).

When a claim requires interpretation or judgment (e.g. "the CTA is
weak," "the design looks outdated"), it belongs in the `manual_review`
confidence bucket, not stated as fact. Confidence levels throughout the
schema are `verified`, `likely`, `manual_review` — use them honestly.

## Security rules

- No authentication exists yet (see "Current phase"), so there is
  currently no user session and no protected route to bypass. Every
  table does have RLS enabled with no policies (deny-all), not because
  it models per-user access yet, but to keep the anon key — which is
  exposed in the browser bundle by design — from being able to read or
  write application data. These rules apply as the app grows into
  handling external input:
- Server-side environment variables only for secrets — never expose API
  keys in client code or `NEXT_PUBLIC_*` variables.
- All server-only Supabase access uses the service role key from
  server-only modules (see `src/lib/supabase/server.ts`, guarded with
  the `server-only` package).
- Webhook/job endpoints (Make.com, worker callbacks) must be protected
  by a shared secret and must be idempotent (dedupe on a job/attempt
  key) so retried or duplicate callbacks never create duplicate
  findings.
- Any code that fetches an external, user/business-supplied URL
  (website audits, crawling) must validate the URL, block private IP
  ranges and localhost (SSRF protection), limit redirects, and limit
  response size. This applies from the first line of URL-fetching code,
  not as a later hardening pass. Implemented as of Phase 3:
  `src/lib/security/ssrf-guard.ts` (DNS-resolution blocklist) and
  `src/lib/audit/check-reachability.ts` (manual redirect following,
  re-validated per hop, 5-redirect cap, 8s total timeout, no response
  body reads).
  - **Known accepted gap:** the guard validates DNS *before* connecting
    at each hop but does not pin the connection to the resolved IP, so
    a narrow DNS-rebinding window exists (a malicious DNS record could
    theoretically change between the check and the actual request a
    few milliseconds later). Accepted for this internal, single-user
    MVP where URLs are typed in by the owner, not adversarial input.
    Revisit with IP-pinned connections in the Phase 16 security pass if
    this ever becomes multi-user or public-facing.
- Sanitize any HTML snippets before storing/rendering them as evidence.
- Rate-limit API endpoints once they exist.
- Do not commit secrets. `.env.local` is gitignored; only
  `.env.example` with placeholder values is committed.

## Phase plan

| Phase | Scope |
|---|---|
| **1** | Next.js scaffold, TypeScript strict, Tailwind, ESLint, env-var validation structure, basic Supabase client/server plumbing, placeholder dashboard, README, CLAUDE.md |
| **2** | Core database migration (`businesses`, `websites`, `audit_jobs`, `audits`, `audit_findings`, `audit_scores`), hand-maintained TypeScript types, RLS enabled with no policies (deny-all) on all six tables. No seed data yet. Still no auth. |
| **3** | Manual "enter a URL" flow: `/leads/new` (Server Action), `/leads`, `/leads/[businessId]`; URL normalization (`tldts` for root domain); SSRF guard (DNS-resolution blocklist, re-validated on every redirect hop, no IP pinning); bounded reachability check (5-redirect cap, 8s timeout, no body reads); writes `businesses` → `websites` → `audit_jobs` sequentially with a compensating delete on downstream failure. |
| **4** | PageSpeed integration (mobile only), normalization (`pagespeed_mobile`), 7 objective finding rules, website-need scoring, manual "Run basic audit" button (atomic claim, no worker), audit results on the lead detail page |
| **5** | Copy-to-AI plain-text summary (`build-summary-text.ts`), finding verify/dismiss/restore actions (`updateFindingStatusAction`), live-computed effective website-need score (`effective-score.ts`) that excludes dismissed findings — `audit_scores` stays immutable |
| **6** | Mobile + desktop homepage screenshots via Apify (`apify/screenshot-url`), private Supabase Storage bucket, signed-URL display, separate "Capture screenshots" button (`screenshots` table added by migration) |
| **7** | Rule-based homepage HTML scan (Cheerio, plain fetch — no rendered browser) integrated into "Run basic audit": title/meta/H1/CTA/contact-form/trust-signal/technology/schema/sitemap detection, 14 new scoring rules, concurrent PageSpeed+HTML with 4-outcome handling including the new `partial` audit status |
| 8 | Google Places discovery: search form, business import, dedup |
| 9 | Async job boundary made real: `/api/jobs/claim`, `/api/jobs/update`; local worker script |
| 10 | Make.com scenarios for Places + PageSpeed + Apify batches |
| 11 | Deep audit: crawl up to 10 pages, broken links, form field introspection, structured data |
| 12 | Business-value score, contactability score, blended priority score |
| 13 | Lead table filters/sorting, dashboard summary metrics |
| 14 | Outreach CRM (statuses, notes, follow-up dates) |
| 15 | Scoring-settings UI, `app_settings`, freshness-window/re-audit-skip logic |
| 16 | Cost controls, retry limits, usage logging, security hardening pass, tests, deploy to Vercel |

Authentication (Supabase Auth, login/signup, protected routes, a
`profiles` table, user-based RLS) is intentionally not scheduled as its
own numbered phase above — it will be inserted before whichever phase
first needs it (likely before Phase 9's real async job endpoints go
live, or before deployment in Phase 16, whichever comes first). Do not
add it preemptively; wait for explicit approval.

## Current phase

**Phase 1 through Phase 9 — complete and fully verified.**

Phase 3 added the manual single-website intake flow: `/leads/new` (a
Next.js Server Action, not a public API route), `/leads` (list),
`/leads/[businessId]` (detail, uses `notFound()` for unknown/malformed
IDs). URL normalization, an SSRF guard, and a bounded/redirect-
revalidating reachability check all run server-side before any
database write. Writes are sequential
(`businesses` → `websites` → `audit_jobs`) with a compensating delete
of the business row (cascades clean up children) if a downstream
insert fails — not a transactional RPC, by design.

**Two real bugs were found and fixed during Phase 3 testing:**
1. `src/lib/audit/normalize-url.ts` accepted syntactically-garbage
   hostnames (e.g. `ht!tp://not a url` parsed as hostname `ht!tp`)
   because WHATWG `URL` parsing doesn't validate DNS-name plausibility.
   Fixed with an explicit hostname-shape check.
2. `src/lib/env.ts` passed `NEXT_PUBLIC_SUPABASE_URL` straight through
   even when it already had `/rest/v1` appended (as this project's
   `.env.local` does), which doubled into a malformed path and made
   every Supabase call fail with `PGRST125 Invalid path specified`.
   Fixed by stripping a trailing `/rest/v1` in `env.ts`'s zod
   transform. A separate `service_role` grants gap (missing `GRANT`s
   from the Phase 2 migration) was fixed directly by the user in
   Supabase.

Phase 4 added processing for existing `audit_jobs` rows: a "Run basic
audit" button on `/leads/[businessId]` (`run-audit-button.tsx` →
`actions.ts` → `src/lib/audit/run-audit.ts`) that atomically claims a
`queued`/`pending` job (conditional `UPDATE ... WHERE status IN
(...)`, so concurrent/duplicate clicks can only ever produce one
audit), skips the PageSpeed call entirely when
`website.is_reachable !== true` (producing a single verified
"unreachable" finding and a website-need score of 35), otherwise calls
PageSpeed Insights mobile (`src/lib/audit/pagespeed.ts`: 45s timeout,
up to 2 retries with 2s/5s backoff on 5xx/network/timeout only, never
on 4xx), normalizes the response (`normalize-pagespeed.ts`), generates
up to 6 additional objective findings from category-score thresholds
and the already-known HTTPS status (`generate-findings.ts`, pure
function), and computes the website-need score
(`scoring/website-need-score.ts`, pure function). `audits.status` uses
only `completed`/`failed` in Phase 4 (`partial` unused). A failure
after the `audits` row is created deletes it (cascades clean up
findings/score) and marks the job `failed`, mirroring the Phase 3
write pattern. `GOOGLE_PAGESPEED_API_KEY` is server-only, added to
`env.ts`'s server schema.

Phase 5 added finding review and the copy-to-AI summary, both entirely
read/derived from existing data — no schema change:
- `src/lib/scoring/effective-score.ts` (pure function): sums `points`
  from every finding whose `status != 'dismissed'`. This is the
  **only** website-need score shown anywhere in the app as of Phase 5
  — the originally stored `audit_scores.website_need_score` is never
  displayed separately (a deliberate simplification to avoid
  "which number is real" confusion) and is never mutated.
- `src/lib/audit/build-summary-text.ts` (pure function): assembles the
  plain-text "Copy audit for ChatGPT or Claude" output from
  already-fetched data. Never includes raw PageSpeed JSON, UUIDs, or
  `error_message` values.
- `updateFindingStatusAction` (`actions.ts`): validates
  businessId/findingId (UUID shape) and targetStatus (must be
  `active`/`verified`/`dismissed`) with zod before writing; scopes the
  `UPDATE` by both finding id and business id; returns a safe generic
  error string on failure or "not found," never a raw Postgres error.
- Findings are grouped into four sections wherever they're shown
  (on-page and in the copy text): Verified (`status='verified'`),
  Active (`status='active'` and `confidence != 'manual_review'`),
  Manual review (`status='active'` and `confidence='manual_review'` —
  empty until Phase 7 introduces non-`verified`-confidence findings),
  Dismissed (`status='dismissed'`, shown but excluded from the score).
  "Restore to active" is available from either `verified` or
  `dismissed`.
- The copy button only renders when an audit exists for the lead.

Phase 6 added mobile + desktop homepage screenshots, entirely optional
and additive — never touches `audits`/`audit_jobs`/`audit_findings`/
`audit_scores` regardless of outcome:
- New table `screenshots` (migration
  `20260718000000_phase6_screenshots.sql`) — one row per successfully
  captured device type per audit, `unique(audit_id, device_type)`. A
  missing row means "not captured"; failed attempts are never
  persisted, only logged server-side.
- `src/lib/audit/apify-screenshot.ts` — calls the `apify/screenshot-url`
  actor via Apify's REST API (`run-sync-get-dataset-items`), token sent
  only via `Authorization: Bearer`, never a query string. Parses
  `screenshotUrl` from the dataset item, requires it to be HTTPS, then
  fetches the image with a 20s timeout, a 10MB size cap, and a strict
  `image/png`-only content-type check — anything else (including JPEG)
  is rejected rather than mislabeled. No automatic retry (each Apify
  run costs money); a manual re-click of the button is the retry path.
  **The actor's real input schema was fetched from Apify (its build's
  `inputSchema`) rather than guessed** — it takes `urls: [{url}]` (not
  a bare `url` string) and requires `waitUntil`/`delay`/`viewportWidth`.
  It has **no height input at all**: the actor always captures the
  page's full scrollable height at the given width, which is exactly
  the full-page behavior this project wants, so there's nothing extra
  to configure for that.
- `src/lib/audit/capture-screenshots.ts` — captures mobile (width 390)
  and desktop (width 1366) in parallel; `viewport_height` (844/768) is
  stored on the `screenshots` row as a nominal reference value only —
  it's never sent to the actor, since the actor has no height
  parameter. Skips any device type that already has a row (idempotent
  re-click); uploads to the private `screenshots` Storage bucket at
  `{business_id}/{audit_id}/{device_type}.png`, then inserts the
  metadata row. A unique-constraint violation on insert (a concurrent
  duplicate attempt) is treated as success, not an error.
- A separate **"Capture screenshots"** button on `/leads/[businessId]`
  (`capture-screenshots-button.tsx` → `captureScreenshotsAction`) — not
  merged into "Run basic audit," so PageSpeed stays fast and Apify
  spend stays a deliberate, per-lead choice. Only rendered when the
  website is known-reachable and an audit exists; hidden once both
  device types are captured.
- The lead detail page generates fresh 1-hour signed URLs server-side
  on every load (`createSignedUrl`) — no public bucket, no long-lived
  links. `APIFY_API_TOKEN` and `APIFY_SCREENSHOT_ACTOR_ID` are
  server-only, added to `env.ts`'s server schema.
- The Phase 6 migration also re-asserts `service_role` GRANTs on all
  seven tables and sets `ALTER DEFAULT PRIVILEGES`, so a fresh database
  built from the migration files alone no longer needs the manual
  out-of-band fix Phase 3 required.

Phase 7 added rule-based homepage HTML scanning, integrated into "Run
basic audit" (not a separate button — this is free and fast, unlike
Apify screenshots) and run **concurrently** with the PageSpeed call:
- `src/lib/audit/fetch-html.ts` — bounded, SSRF-guarded GET (same
  manual-redirect-revalidation pattern as `check-reachability.ts`, but
  reads the body: 8s timeout, 5-redirect cap, 2MB cap, requires
  `text/html`/`application/xhtml+xml` content type before reading).
  Plain fetch only — no headless browser, no page-script execution.
- `src/lib/audit/scan-homepage.ts` — Cheerio parsing (new dependency)
  of title/meta/canonical/robots/H1, CTA phrase matching (fixed
  16-phrase list), contact-page/phone/email link detection, contact
  form + provider + field counts, testimonials, trust-signal keywords,
  social links, copyright year, 14 technology signatures, LocalBusiness
  JSON-LD (parsed defensively — malformed JSON-LD is skipped, never
  fails the scan). `<script>`/`<style>`/`<noscript>`/`<template>`
  content is stripped before any text-based keyword matching. No raw
  HTML is ever stored — only short (~200 char), tag-stripped evidence
  snippets on individual findings.
- `src/lib/audit/sitemap-robots.ts` — independent, optional
  `/sitemap.xml` + `/robots.txt` checks; a failure in either never
  affects the other or the homepage scan.
- `src/lib/audit/generate-html-findings.ts` — pure functions
  (`generateHtmlFindings`, `generateSitemapRobotsFindings`) turning
  scan results into findings. 14 new scoring rules (missing title/meta
  /H1, multiple H1, no CTA, no phone link, no contact form, form >10
  fields, no testimonials, no trust signals, stale copyright ≥3 years,
  no LocalBusiness schema, no privacy-policy link, no sitemap) — a rule
  only ever fires when its detector actually completed. Presence
  findings are stored too, at 0 points, as outreach evidence.
- **Four PageSpeed/HTML-scan outcomes**, since Phase 7 changed the
  original Phase 4 "discard HTML results if PageSpeed fails" plan to
  instead preserve whichever succeeded:
  - **A** both succeed → `audits.status`/`job.status` = `completed`,
    full findings, full score
  - **B** PageSpeed only → `completed`, PageSpeed findings preserved,
    HTML metadata stays null, one `confidence: manual_review` note
    that homepage content couldn't be fully reviewed, **no
    absence-based HTML findings**
  - **C** HTML only → `audits.status`/`job.status` = **`partial`**
    (already a valid value in both enums since Phase 2 — no migration
    needed), HTML findings + the website-fact-based HTTPS check
    preserved, `raw_pagespeed_mobile`/`pagespeed_mobile` stay null, one
    `confidence: verified` note that PageSpeed was unavailable, score
    from HTML + website findings only
  - **D** both fail → `failed`, no findings/score at all (matches the
    original Phase 4 "both fail" semantics exactly), sanitized
    `error_message`
  - All four outcomes share one write path (`writeAuditOutcome` in
    `run-audit.ts`), replacing the separate `finishSuccessfulAudit`/
    `createFailedAudit` functions from Phase 4.
- `generateReachableFindings` (Phase 4, `generate-findings.ts`) was
  modified to accept `pagespeed: NormalizedPageSpeed | null` — when
  null (outcome C), only the website-fact-based HTTPS check applies;
  the four PageSpeed-score-derived checks are skipped rather than
  evaluated against missing data. This was a necessary small change
  beyond the phase's originally-listed file list, flagged at the time.
- **Known, accepted limitation**: plain HTTP fetch cannot see content
  injected by client-side JavaScript. For a heavily client-rendered
  (SPA-style) site, body-content detectors (CTA, forms, trust signals)
  may under-report even though the site genuinely has that content.
  Meta tags (title/description/canonical/robots) are unaffected — those
  are reliably present in server-rendered HTML regardless of framework.
  No rendered-browser fallback exists yet; this is deferred, not solved.
- Test lead: **Divi Roofing Service Layout Pack** demo
  (`https://theultimatedivi.com/diviroofing/`) — a public WordPress/Divi
  marketplace demo with synthetic placeholder content, not a real
  business. See `README.md`'s "Development fixtures" for what it
  exercised.

Phase 8 added Google Places business discovery (Text Search (New)
only — no Nearby Search, no Geocoding, no separate Place Details
calls):
- `/searches/new` — form (niche, city, state, zip, max results 1–60,
  min rating, min review count, "exclude businesses with no website"
  toggle) that calls `runSearch()`.
- `/searches` — list of past searches with found/imported counts and
  status. `/searches/[searchId]` — one search's imported businesses in
  a checkbox table, with a "Queue selected" action.
- `src/lib/places/places-client.ts` — `searchTextPlaces()`, a thin
  fetch wrapper around `POST /v1/places:searchText`. The API key goes
  only in the `X-Goog-Api-Key` header (never a query string, log, or
  error), field mask in `X-Goog-FieldMask`, 15s timeout. `minRating` is
  sent directly in the request body when set — Text Search (New)
  supports it natively (this corrected an earlier assumption that it
  would need a local filter, made during planning).
- `src/lib/places/import-search.ts` — `runSearch()` creates the
  `searches` row *before* calling Google (so a total API failure still
  leaves an auditable `failed` row with a sanitized error), pages up to
  3 times (`pageSize` = remaining capped at 20, a 2s delay between
  pages since Google's `nextPageToken` isn't immediately valid),
  applies `minReviews` and `excludeNoWebsite` as **local** post-filters
  (the API has no such parameters), then imports each surviving place
  via `importOnePlace()`.
- **Dedup**: primary match is exact `google_place_id` equality — reuses
  the business row, refreshes only the Google-sourced fields that are
  actually present (never overwrites existing non-blank data with a
  blank Google value — `buildUpdatePayload()` only includes non-null/
  non-blank fields), and stamps `last_places_sync_at`. When no
  `google_place_id` match exists, a **new** business row is always
  created — normalized phone (`src/lib/places/normalize-phone.ts`,
  also now used by `create-manual-lead.ts` so manually-created
  businesses stay matchable) or website root-domain equality against
  an *existing* business is flag-only: `checkSecondaryMatch()` attaches
  a human-readable `duplicate_warning` to the `search_businesses` row.
  Businesses are **never auto-merged** on a secondary match — confirmed
  in testing against a real, coincidental case (two physically distinct
  Stumptown Coffee Roasters locations sharing one website domain) and
  correctly flagged without merging.
- **No reachability check during import.** `ensureWebsiteRow()` does
  syntactic-only URL normalization (`parseAndNormalizeInputUrl()`, no
  network call) and inserts a `websites` row with every
  reachability-related field left `null` — `is_reachable`, `final_url`,
  `http_status`, `https_enabled`, `redirect_count`, `redirect_chain`,
  `http_to_https_redirect`, `failure_reason`, `last_checked_at`. This
  was a deliberate reversal of the original Phase 8 plan (which would
  have run the Phase 3 reachability check automatically during import)
  for cost/speed/consent reasons.
- **Queueing is manual and separate from discovery.** `runSearch()`
  never creates an `audit_jobs` row. `queueSelectedAction()` (in
  `/searches/[searchId]/actions.ts`) only runs after a human selects
  businesses on the results page: validates every selected id as a
  UUID, cross-checks each against `search_businesses` for *this*
  search (rejecting ids not actually linked to it), skips businesses
  with no `websites` row or an already-active (`pending`/`queued`/
  `auditing`) basic job, and returns a counted summary
  (`"N queued, N skipped (no website), N skipped (already queued), N
  invalid selection"`). It never starts PageSpeed, HTML scanning,
  screenshots, or a reachability check itself.
- **`run-audit.ts` gained a reachability step.** Since Places-imported
  websites have `is_reachable = null` (never checked) rather than
  `true`/`false`, treating `!== true` as "confirmed unreachable" (the
  Phase 4/7 behavior) would have wrongly skipped every Places-imported
  business's audit. `runAudit()` now checks for `is_reachable === null`
  first: if so, it runs `checkReachability()` immediately, persists the
  result to the `websites` row (same fields Phase 3's
  `create-manual-lead.ts` writes), and only then proceeds with the
  existing reachable/unreachable branching. Verified end-to-end: a
  Places-imported business with `is_reachable: null` had it flip to
  `true` (with `http_status`, `https_enabled`, `redirect_chain`, etc.
  all populated) and its basic audit completed normally in the same
  "Run basic audit" click — manually-created leads are unaffected,
  since Phase 3 always sets a real boolean at creation time.
- **A real bug was found and fixed during Phase 8 testing, outside
  this project's own code**: `GOOGLE_PLACES_API_KEY` initially returned
  `403 PERMISSION_DENIED` on every request (confirmed with a raw
  `fetch` outside the app, so not an app bug) because billing wasn't
  correctly attached to the Google Cloud project the key belongs to.
  Fixed directly by the user in Google Cloud Console. The app's
  failure-path handling around this was itself verified correct while
  diagnosing it: the `searches` row was still created first, ended up
  `status: 'failed'`, and got a sanitized `error_message` — the raw
  Google 403 body was never exposed to the browser.
- Test searches: **"coffee shop" in Portland, OR** (real Google Places
  data, not synthetic) — see `README.md`'s "Development fixtures" for
  what was verified.

Phase 9 added an audit queue dashboard (`/queue`) for manual, batched
processing of existing `basic` `audit_jobs` rows — no background
worker, no schema change:
- Five sections — **Queued**, **Running** (the `auditing` DB status),
  **Partial**, **Failed**, **Completed** — each job shows business,
  website, source/search (derived at query time via `businesses.source`
  and, for Places-imported businesses, the most recently linked
  `searches` row — no new column), queue date, last attempt
  (`claimed_at`), attempt count, and status.
- **Queued** jobs are checkbox-selectable for **"Run selected
  audits"** (server-validated: UUID shape, deduplicated, capped at 10)
  or **"Run next batch"** (server picks the oldest N queued/pending
  jobs by `created_at`; if fewer than N are available it runs all of
  them and reports the real count — no error). Default batch size 3,
  max 10, both enforced server-side
  (`src/lib/validation/queue-batch.ts`); if fewer are available than
  requested, all available run and the summary's `selected` reflects
  the real count.
- `src/lib/audit/run-audit-batch.ts` — `runAuditBatch()` runs a fixed,
  **non-configurable concurrency of 2** (a hardcoded constant, not a
  UI control — kept conservative because the batch runs inside one
  synchronous Server Action request; there's no background worker yet
  to relax this against). A small worker-pool pulls job ids off a
  shared index in order (never an unbounded `Promise.all` across the
  whole selection), calling the existing, unmodified `runAudit()` for
  each — no duplication of the claim/reachability/PageSpeed/HTML-scan
  logic. Every job is wrapped in its own try/catch so one job's failure
  or thrown exception can never abort or skip a sibling job. Verified
  empirically: a real 4-job batch showed jobs starting in two clean
  waves of 2 (confirmed via `audits.started_at`/`completed_at`
  overlap), never more than 2 concurrent.
- **`run-audit.ts` gained an `attempt` increment**, entirely inside its
  own existing atomic claim step (no separate step, no schema change):
  it peeks at `claimed_at` before claiming — still-`null` means this is
  the job's first-ever execution, so `attempt` stays at its INSERT
  default of 1 unchanged; already-set means a prior execution happened
  (i.e. this claim is retry-driven), so `attempt` increments by
  exactly one. Only the claim that actually wins the
  `status IN ('queued','pending')`-guarded `UPDATE` ever has its
  `attempt` value persisted, so a losing concurrent claim can never
  double-increment it. Verified empirically: a job retried twice read
  `attempt: 1 → 2 → 3`, one increment per real execution, never more.
- `src/lib/audit/retry-job.ts` — `retryAuditJob()` does the one thing
  Phase 9 adds beyond re-running: atomically resets a `failed`/`partial`
  job back to `queued` (guarded by `status IN ('failed','partial')`,
  clears `error_message`, never touches `attempt` itself) and
  immediately calls the same unmodified `runAudit()`. **Reuses the
  existing `audit_jobs` row** rather than creating a new one —
  `audit_jobs` is the current queue slot, `audits` is the immutable
  history, and every retry (like every fresh run) inserts a brand-new
  `audits` row via the existing `writeAuditOutcome()` and never
  updates or deletes a prior one. Verified empirically: retrying a
  failed job left its original `audits` row byte-for-byte identical
  and added exactly one new row, twice in a row.
- **`RunAuditResult` gained two additive fields**, verified compatible
  with the unmodified Phase 4 single-business "Run basic audit" button
  (which only ever read `result.ok`): `status: "completed" | "partial"
  | "failed"` on the `ok: true` branch (so a batch can tell a fully-
  failed audit — Outcome D, `ok: true` since the failure was recorded
  successfully — apart from a `completed`/`partial` one), and
  `alreadyClaimed?: boolean` on the `ok: false` branch, set only at the
  claim-failure return site. The batch orchestrator uses these to
  classify each job into exactly one of `completed`/`partial`/`failed`/
  `skipped` — a claim conflict (or a job that turns out invalid/
  nonexistent/non-`basic`) is `skipped` and the database row is left
  completely untouched; every other outcome, including a thrown
  exception, is `claimed` and bucketed by its real result.
- **A website that's unreachable counts as `completed`, not a separate
  bucket** — the audit process succeeded in producing a verified
  "unreachable" finding; Outcome D (both PageSpeed and the HTML scan
  genuinely fail on a reachable site) is what actually produces
  `failed`. Verified empirically: an unreachable target
  (`dns_failure`) came back `completed` with one `critical`/`verified`
  "Website unreachable" finding and score 35, while a real non-HTML
  target (`https://api.github.com`, `unsupported_content_type`) came
  back genuinely `failed`.
- **Stale-job visibility, informational only**: a `Running` job whose
  `claimed_at` is more than 15 minutes old shows a "Possibly stale"
  badge next to its status. Nothing resets, reruns, or force-claims it
  — the Running section has no action controls at all. Verified with a
  fabricated 20-minutes-old fixture: the badge rendered and the row
  was completely untouched by simply loading the page.
- **UI**: nothing runs on page load — every batch/retry needs an
  explicit click. All three action forms (`runSelectedAuditsAction`,
  `runNextBatchAction`, and a single shared `retryJobAction` used by
  every retry button on the page) feed into one combined `anyPending`
  flag that disables every execution control on the page — checkboxes,
  both batch buttons, and every retry button — while any one of them
  is in flight, with an honest "this may take several minutes, do not
  assume closing this tab is safe" message. No polling/SSE/WebSockets.
- **Known, accepted testing limitation**: a genuine Outcome C
  (`partial` — HTML scan succeeds, PageSpeed genuinely fails on an
  otherwise-reachable site) proved impractical to reproduce on demand
  against real external targets in this session (no infrastructure
  available to force it deterministically). `partial` classification
  was verified by code inspection instead — it flows through the exact
  same `writeAuditOutcome()` return statement and `runAuditBatch()`
  branch already proven correct live for `completed` and `failed`, so
  residual risk is low, but it wasn't exercised end-to-end this phase.
- Test fixtures: ten new "Queue Test" leads (`A`–`J`, plus one dup-test
  and one invalid-mix lead) created via the ordinary `/leads/new` flow
  specifically to populate the queue with fast, deterministic outcomes
  — see `README.md`'s "Development fixtures" for the full list and
  results.

All phases were confirmed via full end-to-end testing against the real
dev Supabase project — see `README.md`'s "Development fixtures"
section for the exact verified records.

**Do not begin Phase 10 without explicit approval.**

## Postponed (not yet implemented — do not add without explicit approval)

- Authentication: Supabase Auth, login/signup pages, protected routes,
  `profiles` table, user roles, and any user-based RLS policy (RLS
  itself is enabled with no policies as of Phase 2 — see "Current
  phase" — but real per-user policies wait for auth)
- Seed data
- Desktop PageSpeed (mobile only is implemented as of Phase 4)
- Deep/multi-page crawling (Phase 7 scans the homepage only, one page)
- A rendered-browser fallback for JS-heavy sites (documented, accepted
  limitation as of Phase 7 — see "Current phase")
- Phone-number-in-text vs. tel:-link comparison ("phone number was
  displayed as plain text rather than a telephone link" — Phase 7 only
  detects presence/absence of a tel: link, not this fuller comparison)
- Contact-page broken-link verification (Phase 7 only detects whether a
  contact-page link exists, not whether it resolves)
- Contact-information mismatch checking (Google Places data is now
  available as of Phase 8, but the comparison logic itself is not yet
  implemented)
- PageSpeed fields beyond the 4 category scores + 5 Core Web Vital
  metrics: INP, TTFB, page weight/request count, itemized diagnostic
  audits (render-blocking resources, unused JS/CSS, image issues, etc.)
- Business-value score, contactability score, blended priority score
  (website-need score only is implemented as of Phase 4)
- Editable scoring settings / `scoring_rules` table usage
- Automatic recovery of a stuck (`auditing` for >15 minutes) job — the
  Phase 9 queue dashboard shows a "Possibly stale" warning only; no
  force-reset action exists yet (see "Current phase")
- Automated/recurring audit workers — the Phase 4 "Run basic audit"
  button and the Phase 9 queue dashboard's manual batch buttons *are*
  the triggers; there is no polling or scheduled processing
- AI API calls of any kind (the Phase 5 copy button only builds and
  clipboard-copies plain text — no OpenAI/Anthropic call is ever made)
- Automated outreach / outreach status tracking
- Adding a manual finding (verify/dismiss/restore only, as of Phase 5)
- Apify usage beyond homepage screenshots (`apify/screenshot-url` only,
  as of Phase 6 — no crawling actor, no competitor analysis)
- Full-page multi-page crawling (Phase 6's "full-page" screenshots
  capture one page's entire scroll height, not multiple pages)
- Above-the-fold/viewport-only screenshots (full-page only, as of
  Phase 6) and any screenshot device type beyond mobile/desktop
- Automatic retry of failed Apify screenshot runs (manual re-click
  only, as of Phase 6 — deliberate, since each run costs money)
- Make.com integration
- Background/async workers
- Vercel deployment

## Autonomous execution safety rules

These apply to any agent (human or AI) working in this repository with
elevated/non-interactive permissions:

- Do not access anything outside `/workspaces/ap-lead-auditor`.
- Do not use `sudo`.
- Do not run destructive Git commands (force-push, hard reset, branch
  deletion, `git clean`) without explicit user approval.
- Do not deploy to Vercel or any hosting target.
- Do not create or connect production services (Supabase, or otherwise)
  — development project only, per "Approved architecture" above.
- Do not commit secrets. Use placeholder environment variables only in
  anything committed to git.
- Do not modify Docker or Dev Container configuration unless a phase
  explicitly requires it.
- Stop and ask before any command that would affect anything outside
  this repository.
- Do not skip ahead to a later phase without explicit approval, even if
  it seems like a natural next step. Implement only the current phase's
  listed scope.
