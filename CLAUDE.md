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
| 5 | Copy-to-AI plain-text summary, finding verify/dismiss actions |
| 6 | Screenshots via Apify, Supabase Storage wiring, screenshot viewer |
| 7 | Rule-based HTML scan: CTA detection, contact-form detection, trust signals, tech hints, freshness signals |
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

**Phase 1 through Phase 4 — complete and fully verified.**

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

Both phases were confirmed via full end-to-end testing against the
real dev Supabase project — see `README.md`'s "Development fixtures"
section for the exact verified records.

**Do not begin Phase 5 without explicit approval.**

## Postponed (not yet implemented — do not add without explicit approval)

- Authentication: Supabase Auth, login/signup pages, protected routes,
  `profiles` table, user roles, and any user-based RLS policy (RLS
  itself is enabled with no policies as of Phase 2 — see "Current
  phase" — but real per-user policies wait for auth)
- Seed data
- Desktop PageSpeed (mobile only is implemented as of Phase 4)
- External *content* fetching (title/meta/H1/CTA/form/trust-signal
  scraping) — reachability-only fetching (no body reads) is implemented
  as of Phase 3; homepage HTML fetch/parse for title/meta/H1 is
  deliberately deferred to the broader HTML-scan phase (Phase 7) rather
  than built once for Phase 4 and again for Phase 7
- PageSpeed fields beyond the 4 category scores + 5 Core Web Vital
  metrics: INP, TTFB, page weight/request count, itemized diagnostic
  audits (render-blocking resources, unused JS/CSS, image issues, etc.)
- Business-value score, contactability score, blended priority score
  (website-need score only is implemented as of Phase 4)
- Editable scoring settings / `scoring_rules` table usage
- Audit re-running (only processing existing queued/pending jobs is
  implemented as of Phase 4)
- Automated/recurring audit workers — the Phase 4 "Run basic audit"
  button *is* the trigger; there is no polling or scheduled processing
- Copy-to-AI output
- Google Places integration
- Apify integration
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
