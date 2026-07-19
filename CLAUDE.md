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
  to Vercel. Deployment timing was moved forward after Phase 11 (see
  "Deployment" below) but the connection itself is done manually by the
  user through the Vercel dashboard — no CLI command or plugin install
  from within this container.
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

## Deployment

The original phase plan scheduled Vercel deployment for what was then
called "Phase 16" (alongside cost controls, retry limits, and a
security hardening pass — see "Roadmap" for why that phase number no
longer applies). That timing was **intentionally moved forward to
after Phase 11** — the user connected and deployed the GitHub repo
manually through the Vercel dashboard rather than waiting. **Status:
done.** Production is live and protected by Vercel Authentication.

- **The Vercel connection and every deployment are done manually by
  the user through the Vercel dashboard** (import the GitHub repo,
  configure the project there). This is not something an agent working
  in this container performs.
- **Do not run deployment commands from this container.** No `vercel`
  or `npx vercel` CLI usage, no Vercel plugin installation
  (`npx plugins add ...` or otherwise), no scripted deployment of any
  kind. If a task seems to call for one of these, stop and ask instead
  of running it — see "Autonomous execution safety rules" below, which
  this section reinforces rather than relaxes.
- **Once the project is connected, pushes to `main` may trigger a
  Vercel deployment automatically** (Vercel's default Git integration
  behavior). Treat `git push` to `main` with that in mind going
  forward — it is no longer a purely local action once the dashboard
  connection exists.
- **Production must use Vercel Authentication** (Vercel's
  platform-level access gate on the deployed URL) — this is separate
  from, and not a substitute for, the application's own Supabase Auth,
  which remains unimplemented (see "Postponed"). Vercel Authentication
  protects the deployment itself from public access; it says nothing
  about per-user access inside the app.
- **Environment variables for the deployed app are configured through
  the Vercel dashboard**, not committed anywhere in this repo. This
  matches the existing local-dev rule (`.env.local` is gitignored;
  only `.env.example` with placeholders is committed) — the same
  discipline now extends to the Vercel project's own environment
  variable settings.
- **No secrets belong in Git or in documentation.** Neither this file
  nor `README.md` should ever contain a real API key, service role
  key, or other credential — placeholders only, exactly as already
  practiced for `.env.example`.

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
    Revisit with IP-pinned connections in a future security hardening
    pass if this ever becomes multi-user or public-facing (no longer
    tied to a specific phase number — see "Roadmap").
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
| 12+ | Superseded — see "Roadmap" below for the current, accurate plan |

Authentication (Supabase Auth, login/signup, protected routes, a
`profiles` table, user-based RLS) is intentionally not scheduled as its
own numbered phase above — see "Roadmap" below (full multi-user
authentication is deferred unless later approved). Do not add it
preemptively; wait for explicit approval.

**Note on phase numbering:** rows 1–11 above reflect the original
phase plan drafted at project inception, kept for historical context.
Actual approved scope for Phase 9 onward diverged from these original
one-line descriptions — Phase 9 became the audit queue dashboard,
Phase 10 became outreach preparation, and Phase 11 became the
lightweight lead/outreach pipeline described under "Current phase"
below, not this table's original "deep audit"/"Make.com scenarios"
text. Rows 12–16 (business-value/contactability/blended-priority
scoring, filters/sorting, outreach CRM, scoring settings, cost
controls + deploy) are now fully superseded by the "Roadmap" section
below — several of those original items were already delivered early
(filters/sorting and outreach CRM both landed as part of Phase 11;
deployment now happens manually via the Vercel dashboard rather than
as a phase deliverable), and the remaining scoring/settings work has
been deliberately deferred in favor of different priorities. "Current
phase" is the authoritative, up-to-date record of what was actually
built at each phase number.

## Roadmap

This section reflects the actual state of the application and
supersedes the stale parts of the "Phase plan" table above (rows
12–16). Last updated when Phase 12 was redefined, after Phase 11
shipped.

**Completed:**

- Lead discovery and import (Phase 8 — Google Places search, dedup)
- Website audits and scoring (Phases 4/7 — PageSpeed + HTML scan,
  website-need score)
- Screenshots (Phase 6 — mobile/desktop homepage capture via Apify)
- Audit queue and live progress (Phases 9/9.5 — `/queue` dashboard,
  batch processing, progress instrumentation)
- Outreach preparation (Phase 10 — prospect brief, tone presets, copy
  to clipboard)
- Lead pipeline and follow-up tracking (Phase 11 — status/priority/
  notes/outreach-angle/dates, atomic status history, `/leads`
  filters/sorting/pagination)
- Vercel deployment and protection (manual dashboard connection, per
  "Deployment" above — production is live behind Vercel
  Authentication)

**Phase 12 (current target) — UX polish, performance, production
cleanup, and test-data management:**

- Test-data labeling and cleanup — distinguishing/managing the many
  fixture businesses, searches, and leads accumulated across Phases
  3–11's testing from real production data
- Dashboard redesign
- Navigation and information architecture
- Loading and interaction improvements
- Production query and rendering performance
- Responsive design
- Accessibility and consistency
- Production error and cost visibility where appropriate

**Deferred unless later approved:**

- Business-value/contactability/blended-priority scoring (the
  original Phase 12)
- Editable scoring settings (the original Phase 15)
- Contact enrichment
- Competitor analysis
- Multi-page crawling
- AI-generated outreach
- Automated outreach sending
- Make.com integration
- Full multi-user authentication

## Current phase

**Phase 1 through Phase 11 — complete and verified.** Phase 9.5's and
Phase 10's real-browser interaction checks remain pending the user's
own click-through (see below). Phase 11 has an additional, narrower
testing gap of its own — see its write-up below.

**Deployment (decided and completed after Phase 11, before Phase 12):**
the user connected this repo to Vercel and deployed it manually through
the Vercel dashboard, rather than any CLI/agent-driven step, and rather
than waiting for the phase that originally covered it. Production is
live behind Vercel Authentication. This was a scope/sequencing
decision plus a manual user action, not application work — no phase's
implementation status changes because of it. See "Deployment" above
for the full policy.

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

Phase 9.5 added visible, honest in-progress status to `/queue` — a
small slot between Phase 9 and Phase 10, not a renumbering of either:
- **Schema**: two new nullable columns on the existing `audit_jobs`
  table, `progress_stage text` (`CHECK`-constrained to exactly 8
  values: `claiming`, `checking_reachability`, `analyzing_website`,
  `saving_results`, `calculating_score`, `completed`, `partial`,
  `failed`) and `progress_updated_at timestamptz` — matching the
  project's existing text+CHECK convention, not a native enum. Both
  are **informational only**: `audit_jobs.status` remains the sole
  value any application logic branches on (batch classification,
  polling-stop, retry eligibility) — nothing was changed to read
  `progress_stage` for a functional decision anywhere.
- **`src/lib/audit/audit-progress.ts`** — `updateAuditProgress()` is a
  best-effort, non-throwing write scoped to `WHERE id = $1 AND status
  = 'auditing'`, called from `run-audit.ts` at each real stage
  transition (never estimated from elapsed time). `claiming` and the
  three terminal stages are instead folded directly into the same
  statement that already writes `audit_jobs.status` for those cases
  (the atomic claim, and every terminal/failure write) — so status and
  terminal progress can never momentarily disagree, and no extra round
  trip is needed. `progressStageLabel()` is a pure function shared by
  the server-rendered initial page and the client polling loop, so the
  very first render and every subsequent poll produce identical label
  text.
- **PageSpeed and the homepage scan run concurrently**, so there is
  deliberately one combined `analyzing_website` stage ("Running
  performance and homepage checks…") rather than two — not a
  limitation, a direct reflection of the real, unchanged execution
  order. `checking_reachability` only appears for a job whose website
  had never been checked before this run (the Phase 8 null-reachability
  path); a manually-created business with already-known reachability
  skips straight to `analyzing_website`, confirmed against both cases
  live.
- **Verified empirically that a progress-write failure cannot fail the
  audit**: forced a real Postgres `CHECK` constraint violation by
  calling `updateAuditProgress()` with an invalid stage value directly
  against a real job row — it logged a sanitized message
  server-side, returned normally (did not throw), and left
  `progress_stage` unchanged, exactly as designed.
- **`/queue`'s "Run next batch" is now a three-step client flow**,
  replacing the old single combined action: (1) a new read-only Server
  Action, `resolveNextBatchJobIdsAction()`, resolves the exact oldest
  eligible job ids (capped by the requested batch size) without
  claiming anything; (2) the client stores those exact ids as its
  tracked progress scope; (3) the client submits those exact ids
  through the same `runSelectedAuditsAction` "Run selected audits"
  already uses — deliberately **not** re-resolved at execution time,
  since the queue can change in between, and every id is still
  atomically (re-)validated and claimed by the unmodified `runAudit()`
  regardless. Verified live: simulated a job being claimed by another
  process between resolution and execution — the batch summary
  correctly showed it as `skipped` (not `failed`, not miscounted) and
  the row itself was left completely untouched, never overwritten.
- **Batch progress is tracked by exact job id, never system-wide.** The
  progress bar and its "N of M finished — X running, Y waiting" summary
  are computed only from the specific ids the current action just
  submitted (the checked boxes, the resolved next-batch ids, or the one
  retried id) — an unrelated job auditing elsewhere can never affect
  this batch's math. Percentage is strictly `finished / total`; a job
  that is merely `auditing` earns no partial credit (verified live: a
  4-job batch showed 0% while 2 were actively `auditing` and 2 were
  still `queued`, only advancing as jobs actually reached
  completed/partial/failed).
- **`src/app/queue/progress-actions.ts`** — `getAuditProgressAction()`
  accepts at most 10 already-validated job ids, queries only those ids
  restricted to `audit_depth = 'basic'`, and returns only
  `id`/`status`/`progress_stage`/`progress_updated_at` — no
  business-sensitive or operational field. Returns a discriminated
  `{ok:false}` (not an empty row list) on a query failure specifically
  so the polling loop can tell "the read failed" apart from "nothing to
  report" and retain its last-known UI state rather than clearing it.
- **Polling** (`queue-table.tsx`): a self-scheduling `setTimeout` loop
  (never `setInterval`, so a slow poll can't overlap the next one),
  every 3 seconds, scoped to the current action's tracked ids only,
  stopping entirely once every tracked id has reached a terminal
  status. The existing 15-minute `claimed_at`-based "Possibly stale"
  badge is unchanged; a new, separate relative caption ("Updated 4
  seconds ago") is rendered from `progress_updated_at` alongside it —
  verified together live on a deliberately-aged fixture.
- **Verified the core architectural risk directly, not just assumed
  it away**: fired a real 4-job batch's Server Action in the
  background, then fired a separate polling request 2 seconds into
  its ~26-second execution. The poll returned in **167ms** with
  genuinely live data (2 jobs already `auditing`/`analyzing_website`,
  2 still `queued`) — conclusive evidence the Next.js dev server does
  **not** serialize concurrent requests from the same client, so true
  live progress during a long, synchronous batch Server Action is
  real, not theoretical, on this architecture. No WebSockets, SSE,
  Redis, cron, or background worker were added or needed.
- Retry re-progresses through the same stages on the same reused
  `audit_jobs` row (unchanged from Phase 9); `attempt` is still
  incremented only inside `runAudit()`'s own claim step, never by any
  progress-related code — confirmed live (`attempt` read `3 → 4` on a
  retry, with a fifth historical `audits` row untouched and a new one
  added).
- **Known, accepted limitation, same as Phase 10**: this sandboxed
  container still cannot launch a real browser, so interactive
  verification of the progress bar, per-row labels, and automatic
  polling stopping was done via direct Server Action calls (using the
  dev build's own `server-reference-manifest.json` to invoke
  `getAuditProgressAction`/`resolveNextBatchJobIdsAction` exactly as
  the browser would, bypassing the need for a real DOM) plus
  server-rendered HTML inspection, not an actual click-through — left
  to the user against the same dev server.
- Scoped to `/queue` only, as approved — the lead-detail page's single
  "Run basic audit" button continues to work unchanged (verified live)
  and now also writes progress data via the shared instrumentation,
  but has no dedicated progress UI in this phase; a natural, low-cost
  follow-up given the instrumentation already exists.

Phase 10 added outreach preparation (`/leads/[businessId]/outreach`) —
turning existing audit evidence into a reviewable prospect brief and
outreach draft, entirely template-driven, no AI API, no sending, no
persistence:
- **No Server Action, no mutation, no external fetch anywhere in this
  feature** — a genuine architectural simplification versus every
  prior phase. `src/lib/outreach/build-prospect-brief.ts` is a pure
  content-assembly function (no I/O, no `server-only` guard) that runs
  identically on the server (never invoked there) and, in practice,
  entirely in the browser: the Client Component recomputes the brief
  from already-loaded props on every checkbox/tone change, so the
  preview is genuinely regenerated on demand with no round-trip.
  Confirmed empirically: zero `fetch`/`XMLHttpRequest`/`axios` calls
  exist anywhere in the outreach feature's code (grepped, not just
  reasoned about) — external calls during interaction aren't just
  untested, they're structurally impossible.
- **Narrow, sanitized DTO boundary.** `page.tsx` (the server component)
  builds an `OutreachBriefData` object containing only the explicitly
  allowed business-facing fields (name, category, city/state/address,
  phone, source label, website display URL + reachability, Google
  rating/review count/maps URL, audit status, the live
  `calculateEffectiveScore()` result, safe audit summary, homepage
  title, sanitized findings, screenshot *availability* booleans, a
  human-readable prepared date) — never a raw Supabase row, never
  `raw_pagespeed_mobile`/`pagespeed_mobile` JSON, never `audit_jobs`
  fields, never `google_place_id`/`phone_normalized`, never a storage
  path or signed URL. A finding's real `id` is the one UUID that does
  cross this boundary, used only as the local selection key (React key
  + `selectedKeys` Set member) — never rendered or copied. Confirmed
  empirically: zero UUID-shaped substrings anywhere in the page's
  visible (non-`<script>`) HTML text across all five test fixtures.
- **Screenshot signed URLs never enter the brief pipeline.**
  `page.tsx` generates fresh signed URLs (same 1-hour-TTL pattern as
  Phase 6) and passes them to the Client Component as a **separate**
  prop from the sanitized DTO, used only for `<img>` thumbnail display.
  `buildProspectBrief()`/`renderPlainText()`/`renderMarkdown()` never
  see them — the brief only ever states screenshot *availability*
  ("Mobile and desktop homepage screenshots are available... attach
  them manually") and instructs the operator to review/attach
  manually. Confirmed empirically on the Reachable Site Test fixture
  (which has both device screenshots): the signed URL appears in the
  page's `<img src>` attributes but is completely absent from the
  copyable `<pre>` preview text.
- **Confidence and status are never conflated.** Every finding carries
  both independently; the UI groups findings by status (Verified/
  Active/Dismissed) but always shows a confidence badge
  (Verified/Likely/Manual review) alongside each one.
  `buildProspectBrief()` routes purely by confidence for section
  placement: `manual_review` goes to "Items to verify manually" only,
  *regardless of status* — a `verified`-status finding with
  `manual_review` confidence still cannot appear in "Top
  opportunities." `findingCount` (used only in the opener's plain
  numeric count) counts exclusively selected, non-`manual_review`
  findings — never inferred as a signal of priority, severity, or
  urgency. Confirmed by 623 passing pure-function assertions (see
  below) plus a live fixture (the Divi Roofing demo's current latest
  audit) that genuinely mixes a `manual_review` finding with two
  `verified` ones and routes each to the correct section.
- **Dismissed findings**: hidden and unselected by default; the
  "Include dismissed findings" toggle only reveals them in the UI —
  revealing never auto-selects, since selection is driven purely by
  whether a finding's key is in `selectedKeys`, which the toggle never
  touches.
- **Tone presets** (`src/lib/outreach/tone-presets.ts`): three fixed,
  literal, human-reviewed and explicitly approved phrase banks (Warm
  and consultative / Direct and concise / Professional and analytical)
  — no AI generation anywhere. Tone changes connective language,
  opener structure, subject-line framing, and outline wording only;
  facts, confidence, selected findings, evidence, the score, and audit
  status are identical across all three tones by construction (they're
  substituted into the templates unchanged, never regenerated).
  Verified live across all three tones on the same fixture: openers
  and subject lines differ, every fact (score, finding text,
  confidence labels) is byte-identical.
- **Wording discipline**: the score is always shown as "Internal
  website-opportunity score: N/100" immediately followed by a fixed,
  non-optional caveat sentence, never tone-varied. Unreachable websites
  get one neutral sentence ("could not be reached during the recorded
  audit attempt") — never a claim about the business being closed,
  inactive, or losing customers. Missing Google data says "was not
  imported for this business," never "does not exist." A
  `failed`-status audit (a necessary small addition beyond the
  originally-specified partial/unreachable branches, flagged here) gets
  its own plain sentence rather than silently showing zero findings
  with no explanation.
- **Markdown escaping**: `render-markdown.ts` escapes
  `` \ ` * _ [ ] < > # | `` in all business/finding-derived text before
  embedding it (verified this neutralizes attempted `*bold*`,
  `<script>`, and heading-injection payloads in a pure-function test);
  website/Google-Maps URLs are deliberately left unescaped since
  they're already-validated structured data, not free-form prose, and
  escaping would risk corrupting a literal, copyable URL.
- **Plain-text/markdown parity**: both renderers consume the identical
  `ProspectBrief` object produced by `buildProspectBrief()` and make no
  content decisions of their own (only formatting ones), so the two
  outputs are factually identical by construction — verified directly
  by stripping markdown syntax and diffing against the plain-text
  output in a pure-function test.
- **Testing**: 623 pure-function assertions (`npx tsx` against the real
  modules via the project's existing `@/` path alias — no test runner
  is configured in this project, so this ran as an ephemeral script,
  not a committed test file) cover selection/routing rules, all empty-
  state wordings, the partial/unreachable/Google-unavailable/failed
  sentences, tone-invariance of facts, plain/markdown parity, markdown-
  escaping payloads, absence of UUIDs/secrets/raw-JSON/DB-field-names
  in output, and the 10-phrase prohibited-language regression list
  (checked across all 3 tones × 3 audit statuses × 3 reachability
  states) — all passing. Five real fixtures were exercised end-to-end
  through the actual dev server (completed-with-screenshots, completed-
  without-screenshots, unreachable, Places-imported with Google rating/
  review data, and a mixed-confidence real audit).
- **Known limitation, flagged rather than silently skipped**: this
  sandboxed container cannot launch a real browser to click through the
  checkboxes/tone selector/dismissed-toggle/copy buttons — headless
  Chromium requires system shared libraries not present here, and
  installing them needs `sudo`, which is never used. `chromium-cli` is
  also unavailable. The user chose to verify this interaction layer
  themselves against the running dev server rather than have this
  skipped or worked around. Everything else (data boundary, template
  correctness, tone/selection/routing logic, escaping, wording) was
  verified as described above.

Phase 11 added a lightweight lead/outreach pipeline (status, priority,
notes, outreach angle, contact/follow-up dates) with an atomic,
trigger-enforced status history, plus a rewrite of `/leads` into a
filterable/sortable/paginated dashboard — no email sending, no
Make.com, no automated outreach:
- **Schema**: `supabase/migrations/20260721000000_phase11_lead_pipeline.sql`
  creates `lead_profiles` (`business_id` primary key/FK to
  `businesses` `on delete cascade`, `status` text+`CHECK` across the
  10 approved values defaulting to `'new'`, `priority` text+`CHECK`
  (`low`/`medium`/`high`, nullable), `notes` text, `outreach_angle`
  text, `last_contacted_date` date, `next_follow_up_date` date,
  `created_at`/`updated_at` — the existing `set_updated_at()` trigger
  function reused for the latter) and `lead_activity` (`id` uuid
  primary key, `business_id` FK `on delete cascade`, `from_status`
  text+`CHECK`/nullable, `to_status` text+`CHECK` not null, `note`
  text — present in the schema but never written by any application
  code in this phase, `created_at`). Indexes on `lead_profiles.status`,
  `.priority`, `.next_follow_up_date`, and
  `lead_activity(business_id, created_at desc)`. RLS enabled, no
  policies, matching every other table. `service_role` granted
  select/insert/update/delete on both new tables plus the existing
  default-privileges/sequence grants re-asserted.
- **Backfill and auto-creation, not lazy creation**: the migration
  inserts a `'new'`-status `lead_profiles` row for every existing
  business (`on conflict (business_id) do nothing`, confirmed
  idempotent), and a `create_default_lead_profile()` function fires
  `after insert on businesses` so every future business gets one
  immediately, atomically, in the same transaction as its own
  creation — never lazily on first page view. A missing row is an
  unexpected state (application code defends against it via
  `defaultLeadProfile()` as a fallback, but this is not the normal
  path). Verified empirically: 45 businesses = 45 `lead_profiles` rows
  immediately after migration, 0 spurious `lead_activity` rows from
  the backfill; a fresh business created via the ordinary `/leads/new`
  flow immediately had a correctly auto-created profile
  (`status: 'new'`, every other field null).
- **Status history is trigger-only, no per-transition note (Option
  B)** — the design decision made and reported before writing
  application code, as the approval required. A
  `log_lead_status_change()` function fires
  `after update of status on lead_profiles for each row when
  (old.status is distinct from new.status)`, inserting exactly one
  `lead_activity` row with the real `from_status`/`to_status` in the
  same transaction as the status write — atomic by construction, not
  a two-step application-level sequence, and impossible for
  application code to bypass, double-write, or desync. A same-status
  resubmission or an update to any other column never fires it
  (`WHEN` clause). Option A (a narrowly-scoped RPC accepting an
  optional operator note) was considered and explicitly not chosen:
  the general-purpose `notes` field already covers "why did this
  change," and an RPC-based design would have been harder to validate
  without a live database connection during planning. Status
  transitions are fully permissive — any of the 10 values to any
  other, no enforced workflow graph, matching the approved design (an
  internal manual tool, not a system needing guardrails against the
  operator's own judgment).
- **Status/priority never auto-advance.** No code path infers or sets
  `lead_profiles.status` or `.priority` from audit completion, audit
  score, Google Places data (rating/review count), source, website
  reachability, finding severity, outreach-brief generation, or copied
  outreach text — every change is an explicit Server Action call
  triggered by an explicit operator form submission.
- **`src/app/leads/[businessId]/pipeline-actions.ts`** — five
  `"use server"` async functions
  (`updateLeadStatusAction`/`updateLeadPriorityAction`/
  `updateLeadNotesAction`/`updateLeadOutreachAngleAction`/
  `updateLeadDatesAction`), each validating `businessId` (UUID shape)
  and its field via the zod schemas in
  `src/lib/validation/pipeline.ts`, running a plain `UPDATE ...
  WHERE business_id = ...` scoped update, detecting a missing profile
  via `.select("business_id").maybeSingle()` returning null (a
  sanitized "profile could not be found" error, never a raw Postgres
  error — confirmed by testing against a syntactically-valid but
  nonexistent business id), and calling `revalidatePath()` for both
  lead pages plus `/leads` on success. Notes are trimmed and capped at
  10,000 characters, outreach angle at 500 — both server-side,
  boundary-tested at exactly the limit (accepted) and one character
  over (rejected). Dates are validated as plain `YYYY-MM-DD` strings
  (nullable, to support clearing a field) — never a timestamp, matching
  the approved no-times decision.
- **`src/lib/pipeline/lead-profile.ts`** — `getFollowUpState()` is a
  pure function: overdue = `next_follow_up_date` before today AND
  status not in `won`/`lost`/`not_a_fit`; due-today and upcoming are
  distinguished; returns `null` for no date or a terminal status
  regardless of how overdue the stored date is. Plain `YYYY-MM-DD`
  lexicographic string comparison throughout, deliberately avoiding
  `Date` object timezone-conversion bugs (the same pattern already
  established in Phase 9.5's stale-job check). `getTodayISODate()` is
  kept in its own function (not inlined into a component's render
  body) per the project's established React-purity convention for
  `Date.now()`/`new Date()` calls.
- **`src/app/leads/[businessId]/pipeline-panel.tsx`** — a Client
  Component rendered identically on both `/leads/[businessId]` and
  `/leads/[businessId]/outreach`, using five separate `useActionState`
  hooks (one per field group) so each form saves independently.
  Selecting `"contacted"` in the status dropdown prefills the (still
  separate, still-unsubmitted) last-contacted date field with today's
  date client-side, only when that field is currently empty — the
  value stays visible and editable, and nothing is written until the
  operator explicitly submits the dates form, matching the approved
  "must not silently write a date" requirement.
- **`/leads` rewritten in place** (no new route) into a
  filterable/sortable/paginated dashboard: one-or-more statuses,
  priority, an overdue toggle, source, and a business-name/website
  search box; sort by newest/oldest/status/priority/follow-up date; a
  hard 50-row page size with server-side `.range()` pagination
  (`{ count: 'exact' }`), filters and sort preserved across page links.
  A search or source filter first resolves a narrowed business-id list
  before querying `lead_profiles`, so filtering never loads the full
  unbounded business table into memory. **Known, accepted
  limitation**: status/priority sort is plain alphabetical text order
  on the stored string values, not a true workflow-stage or severity
  order — no ordinal/rank column was added, since that schema change
  was outside this phase's approved scope.
- **Notes and outreach angle stay internal-only by construction.** The
  Phase 10 outreach DTO (`OutreachBriefData`) was not modified to add
  either field, and `outreach-builder.tsx` required no changes at all
  — confirmed both by a clean typecheck and by a live test: a
  distinctive marker string set in both `notes` and `outreach_angle`
  on a real fixture appeared in the `PipelinePanel` form fields (and,
  necessarily, in that component's own hydration payload) but was
  completely absent from the outreach page's copyable `<pre>` preview
  block when checked directly against the rendered HTML.
- **Zero pipeline-code changes touch audit data.** Row counts for
  `audits`, `audit_findings`, `audit_scores`, `screenshots`, and
  `audit_jobs` were captured before and compared after a full,
  95-assertion Phase 11 test run — all five unchanged.
- **Testing method and a real, thoroughly-diagnosed environment
  limitation, not a workaround**: the raw-HTTP Server Action
  replication method used successfully in every prior phase's testing
  (extracting and POSTing back the `$ACTION_REF_N`/`$ACTION_N:0`/
  `$ACTION_N:1`/`$ACTION_KEY` hidden form fields) turned out to hang
  indefinitely on a **successful** response in this container's dev
  server (`Next.js 16.2.10`) — the request never returns until the
  client's own timeout closes the connection, at which point the dev
  server retroactively logs a slow "200." This was root-caused, not
  just observed: timing instrumentation showed the real action logic
  (zod validation, the Supabase update, even a full page re-render)
  completing in under 1–2 seconds every time; the identical hang
  reproduced on a **pre-existing, previously-proven Phase 5 action**
  (`updateFindingStatusAction`), ruling out a Phase 11 defect; it
  reproduced identically under both Turbopack and `next dev --webpack`,
  ruling out a Turbopack-specific bug; a trivial hand-written API route
  confirmed plain POST requests are not broadly broken in this
  environment (16ms round trip); and an intentionally-invalid action
  reference returned a normal error response, isolating the bug
  specifically to encoding/streaming a *successful* Server Action
  response. Given this, Phase 11's five mutating actions were instead
  tested by importing and calling the real, unmodified exported
  functions directly from a Node/`tsx` script against the real dev
  database (stubbing only the `server-only` package's unconditional
  throw, which exists purely as a Next.js build-time guard and is a
  no-op outside its bundler) — genuinely exercising the same
  validation, Supabase calls, and database trigger a live request
  would, via 95 passing assertions covering every one of the 10
  status values in sequence, an arbitrary non-adjacent transition
  (`won` → `new`), invalid-status rejection, a same-status resubmit
  producing no history row, two concurrent status updates producing
  exactly two history rows with no lost update, every priority value
  plus unsetting it, notes/angle trimming and exact-boundary length
  validation, valid/invalid/cleared dates, the full overdue/due-today/
  upcoming/terminal-exclusion matrix, not-found handling, and
  profile-backfill/auto-creation for both manual and Places-imported
  businesses. Every read-only path (`/leads` filters/sorting/search/
  pagination, the lead-detail page, the outreach page, the "no
  visible UUIDs" check) was still verified live over real HTTP, since
  plain GET requests are unaffected by this bug. Interactive browser
  click-through remains deferred to the user, same as Phase 9.5/10.
- Test fixture: **Pipeline Test Lead** (`https://example.com`,
  business id `9bf9c33c-e100-4719-ab10-c434314bdadc`, created via the
  ordinary `/leads/new` flow), left reset to a clean `new`/no-priority/
  no-notes/no-history state after testing, available for reuse.

All phases were confirmed via full end-to-end testing against the real
dev Supabase project — see `README.md`'s "Development fixtures"
section for the exact verified records.

**Do not begin Phase 12 without explicit approval.**

## Postponed (not yet implemented — do not add without explicit approval)

This is the granular, implementation-level list. For the current
high-level plan (what's actually next vs. deferred), see "Roadmap"
above — its "Deferred unless later approved" bucket and this list
describe the same reality at different levels of detail.

- Authentication: Supabase Auth, login/signup pages, protected routes,
  `profiles` table, user roles, and any user-based RLS policy (RLS
  itself is enabled with no policies as of Phase 2 — see "Current
  phase" — but real per-user policies wait for auth)
- Contact enrichment: finding new contact details (emails, additional
  phone numbers, social profiles, decision-maker names) from external
  sources — distinct from the contact-information mismatch checking
  below, which only compares data already on hand
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
- A dedicated progress UI on the lead-detail page's single "Run basic
  audit" button — it already writes the same `progress_stage`/
  `progress_updated_at` data as of Phase 9.5 (shared instrumentation),
  but only `/queue` displays it
- Automated/recurring audit workers — the Phase 4 "Run basic audit"
  button and the Phase 9 queue dashboard's manual batch buttons *are*
  the triggers; there is no polling or scheduled processing
- AI API calls of any kind (the Phase 5 copy button only builds and
  clipboard-copies plain text — no OpenAI/Anthropic call is ever made)
- Automated outreach — sending email/messages, or any status change
  triggered automatically rather than by an explicit operator action
  (Phase 10 prepares a brief and draft copy for the user to send
  manually; nothing is ever sent automatically). Manual pipeline
  status/priority/notes/follow-up tracking **is** implemented as of
  Phase 11 (`lead_profiles`, `lead_activity`) — what remains postponed
  is automating any part of it, plus reminders/notifications for
  overdue follow-ups (Phase 11's overdue badge is informational only,
  computed on read, never pushed or emailed)
- Persisting outreach briefs, draft edits, versioning, or send-time
  snapshots (Phase 10 generates on demand from current records only;
  no `outreach_briefs` table exists — see "Current phase")
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
- Deployment automation of any kind from this container (CLI commands,
  plugins, scripted deploys). The Vercel connection and every actual
  deployment are approved to happen now, after Phase 11, but only
  manually by the user through the Vercel dashboard — see
  "Deployment" above.

## Autonomous execution safety rules

These apply to any agent (human or AI) working in this repository with
elevated/non-interactive permissions:

- Do not access anything outside `/workspaces/ap-lead-auditor`.
- Do not use `sudo`.
- Do not run destructive Git commands (force-push, hard reset, branch
  deletion, `git clean`) without explicit user approval.
- Do not deploy to Vercel or any hosting target. Do not run `vercel`/
  `npx vercel` or any other deployment command, and do not install a
  Vercel plugin, from within this container — deployment is performed
  manually by the user through the Vercel dashboard only. See
  "Deployment" above.
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
