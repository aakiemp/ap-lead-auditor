# AP Webmaster — Lead Auditor

Internal lead research and website audit tool for AP Webmaster. Given a
business niche and location, the tool (eventually) discovers local
businesses, audits their websites for objective, evidence-based issues,
scores them as redesign/optimization prospects, and tracks outreach.

This is an internal MVP, not a commercial product. See `CLAUDE.md` for
the full architecture, phase plan, and rules this project is built
against.

## Current status

**Phase 1 through Phase 7 — complete and fully verified end-to-end.**

Phase 1 — bare project scaffold:

- Next.js App Router, TypeScript strict mode, Tailwind CSS, ESLint
- Environment-variable validation structure (`src/lib/env.ts`)
- Basic Supabase client/server plumbing (`src/lib/supabase/`)

Phase 2 — core database schema:

- SQL migration defining `businesses`, `websites`, `audit_jobs`,
  `audits`, `audit_findings`, `audit_scores`
- Hand-maintained TypeScript types matching that schema
  (`src/lib/supabase/database.types.ts`)
- Row level security enabled on all six tables, with no policies

Phase 3 — manual single-website intake flow:

- `/leads/new` — form (Next.js Server Action, not a public API route)
  to manually add a business + website and queue a basic audit job
- `/leads` — bare list of created leads
- `/leads/[businessId]` — read-only detail view; unknown/malformed IDs
  return a real 404 via `notFound()`
- URL normalization (`src/lib/audit/normalize-url.ts`, using `tldts`
  for registrable-domain extraction) and an SSRF guard
  (`src/lib/security/ssrf-guard.ts`) that blocks private/loopback/
  link-local/reserved IP ranges — including the cloud metadata range —
  before any outbound request, re-checked on every redirect hop
- A bounded reachability check (`src/lib/audit/check-reachability.ts`):
  manual redirect following (max 5 hops), 8s total timeout, never reads
  a response body
- `src/lib/leads/create-manual-lead.ts` writes `businesses` →
  `websites` → `audit_jobs` sequentially, with a compensating delete of
  the business row (FK cascades clean up children) if a later insert
  fails

Phase 4 — processing queued audit jobs with PageSpeed (mobile only):

- A **"Run basic audit"** button on `/leads/[businessId]`, shown only
  when the lead has a `queued`/`pending` job. Atomically claims the job
  (`UPDATE ... WHERE status IN ('queued','pending')`) so double-clicks
  or two open tabs can never produce more than one audit.
- `src/lib/audit/pagespeed.ts` — calls PageSpeed Insights (mobile
  strategy, all 4 categories), 45s timeout, up to 2 retries with 2s/5s
  backoff on transient failures only (never on 4xx)
- `src/lib/audit/normalize-pagespeed.ts` — extracts the 4 category
  scores + 5 Core Web Vital metrics (numeric + original display text)
  into `audits.pagespeed_mobile`; `audits.raw_pagespeed_mobile` keeps
  the entire untouched API response
- `src/lib/audit/generate-findings.ts` and
  `src/lib/scoring/website-need-score.ts` — pure functions (no I/O)
  generating up to 7 objective findings (reachability, HTTPS, 4
  PageSpeed category thresholds) and the website-need score
- A website that isn't known-reachable (`is_reachable !== true`) never
  triggers a PageSpeed call — it gets one verified "unreachable"
  finding and a score of 35
- A failure after the `audits` row is created deletes it (cascades
  clean up findings/score) and marks the job `failed`, mirroring the
  Phase 3 write pattern rather than a transactional RPC

Phase 5 — finding review and the copy-to-AI summary:

- **"Copy audit for ChatGPT or Claude"** button in the lead detail
  header — plain text only, no raw PageSpeed JSON, no UUIDs, no
  `error_message` values. Only shown when an audit exists.
- Findings show **Verify**, **Dismiss**, and **Restore to active**
  buttons (only for the statuses a finding isn't currently in), each a
  small Server-Action-backed form, validated (UUID shape + enum) and
  scoped by both finding id and business id before writing.
- Findings are grouped into **Verified / Active / Manual review /
  Dismissed** everywhere they're shown (on-page and in the copy text).
- The **website-need score is always the live-computed effective
  score** — sum of `points` from every non-dismissed finding. This is
  the only score shown anywhere; the originally stored
  `audit_scores.website_need_score` is never displayed separately and
  is never mutated (`audits`/`audit_scores` stay immutable, same
  principle as Phase 2–4).

Phase 6 — mobile + desktop homepage screenshots via Apify:

- A separate **"Capture screenshots"** button on `/leads/[businessId]`
  — deliberately not merged into "Run basic audit," so PageSpeed stays
  fast and Apify spend (unlike free-tier PageSpeed) is a per-lead
  choice. Only shown when the website is known-reachable and hidden
  once both device types are captured.
- Calls the `apify/screenshot-url` actor (mobile width 390, desktop
  width 1366) via Apify's REST API — token sent only via
  `Authorization: Bearer`, never a query string, log line, or stored
  value. No automatic retry; a manual re-click is the retry path. The
  actor's input schema was fetched from Apify directly (not guessed):
  it takes no height parameter at all and always captures the page's
  full scrollable height at the given width — full-page by default,
  nothing extra to configure. `viewport_height` (844/768) is stored on
  each `screenshots` row as a nominal reference value only.
- Only `image/png` responses are accepted — anything else (including
  JPEG) is safely rejected rather than mislabeled.
- Images upload to a **private** Supabase Storage bucket
  (`{business_id}/{audit_id}/{device_type}.png`); the page displays
  them via fresh 1-hour **signed URLs** generated server-side on every
  load — never a public link.
- Each device type is captured independently and idempotently: a
  device type that already has a `screenshots` row is skipped, so a
  repeat click (or a partial prior failure) is always safe and never
  duplicates or overwrites.
- Entirely optional and additive — a screenshot failure (or the
  feature not being used at all) never touches `audits`, `audit_jobs`,
  `audit_findings`, or `audit_scores`.

Phase 7 — rule-based homepage HTML scanning, integrated into "Run
basic audit" and run **concurrently** with the PageSpeed call:

- Plain server-side HTTP fetch (`src/lib/audit/fetch-html.ts`, reusing
  the SSRF guard with manual redirect revalidation, 8s timeout, 5
  redirects, 2MB cap, HTML-only content type) + **Cheerio** parsing
  (`src/lib/audit/scan-homepage.ts`) — no headless browser, no page
  scripts executed, no forms submitted.
- Detects: title, meta description, canonical URL, robots meta, H1
  text/count, primary CTA (fixed 16-phrase list), contact-page/phone/
  email links, contact form (+ provider, field counts, submit text),
  testimonials, trust-signal keywords, social links, copyright year,
  14 technology signatures, LocalBusiness JSON-LD (parsed defensively —
  malformed JSON-LD never fails the scan), privacy-policy/terms links.
- `src/lib/audit/sitemap-robots.ts` — independent `/sitemap.xml` +
  `/robots.txt` checks; a failure in either never affects the other or
  the homepage scan.
- **No raw HTML is ever stored** — parsed in memory, discarded; only
  short tag-stripped evidence snippets (~200 chars) persist.
- 14 new scoring rules — a rule only fires when its detector actually
  completed. Presence findings are stored too, at 0 points, as
  outreach evidence (not just problems flagged).
- **Four PageSpeed/HTML outcomes**, since a Phase 7 requirement changed
  the original plan (discard HTML if PageSpeed fails) to instead
  preserve whichever succeeded:
  - Both succeed → `completed`, full findings, full score
  - PageSpeed only → `completed`, PageSpeed findings preserved, one
    manual-review note that homepage content wasn't fully reviewed, no
    absence-based HTML findings
  - HTML only → **`partial`** (an already-valid status since Phase 2 —
    no migration needed), HTML + HTTPS findings preserved, one note
    that PageSpeed was unavailable, score from what succeeded
  - Both fail → `failed`, no findings/score at all
- **Known, accepted limitation**: plain HTTP fetch can't see
  JavaScript-injected content. A heavily client-rendered (SPA-style)
  site may under-report body-content signals (CTA, forms, trust
  signals) even though they exist — meta tags are unaffected. No
  rendered-browser fallback yet; documented, not solved.

Verified against the real dev Supabase project — see "Development
fixtures" below for exactly what was tested and what exists in the
database. Two Phase 3 bugs surfaced and were fixed during earlier
testing — see `CLAUDE.md` for details (an overly-permissive URL parser,
and an env-var normalization gap for a Supabase URL that already had
`/rest/v1` appended).

No authentication, no Google Places/Make.com integration, no
business-value/contactability/priority scores, no audit re-running, no
automated worker, no AI API calls, no outreach automation, no deep/
multi-page crawling yet.

## Development fixtures

Four test leads exist in the dev Supabase project as known-good
fixtures (not cleaned up — kept intentionally for future testing):

| Business | Website | Result |
|---|---|---|
| Reachable Site Test (Phase 3 verify) | `https://example.com` | Audit completed. Performance 100, Accessibility 96, SEO 80, Best practices 96. 0 findings, website-need score 0. Also used in Phase 6: has both a mobile and desktop `screenshots` row (verified duplicate-safe on a second capture attempt). |
| Unreachable Host Test (Phase 3 verify) | an `.invalid` hostname | Audit completed without a PageSpeed call. 1 finding ("Website unreachable", critical). Website-need score 35. Also used in Phase 5 to test dismiss → restore → verify; its one finding's `status` ended the test cycle as `verified` (points/description unchanged throughout; the stored `audit_scores` row was never touched). |
| Duplicate Submission Test (Phase 4 verify) | `https://example.com` | Used to verify concurrent Run-audit clicks only ever produce one audit row. Same result profile as the first fixture. |
| HTML Scan Test - Divi Roofing Demo (Phase 7 verify) | `https://theultimatedivi.com/diviroofing/` (public WordPress/Divi marketplace demo, synthetic content) | Primary audit: `completed`, mobile performance 54, website-need score 38 from 5 point-earning findings (no contact form, no phone link, missing H1, missing meta description, no LocalBusiness schema) + 14 zero-point evidence findings (technology, trust signals, CTA, sitemap, etc.). Also used to exercise: an SSRF-blocked-redirect target (`ssrf_blocked`, Outcome B), a non-HTML content-type target (`unsupported_content_type`, Outcome D), and a transiently-erroring target (`http_error`) — 5 additional `audit_jobs` rows from that testing remain as historical evidence. |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your DEVELOPMENT Supabase project's values
npm run dev
```

Open http://localhost:3000.

`.env.local` is now required for `/leads`, `/leads/new`, and
`/leads/[businessId]` to work — they read/write Supabase directly.
`GOOGLE_PAGESPEED_API_KEY` is required for the "Run basic audit" button
to succeed on a reachable website; `APIFY_API_TOKEN` and
`APIFY_SCREENSHOT_ACTOR_ID` are required for "Capture screenshots" to
succeed (a website already known to be unreachable never calls either
service, so both buttons render fine without those keys — they just
can't complete their action). The root `/` dashboard still renders
without any of it.

## Scripts

- `npm run dev` — start the local dev server
- `npm run build` — production build
- `npm run lint` — run ESLint
- `npx tsc --noEmit` — type-check without emitting output

## Project structure

```
src/
  app/
    page.tsx              # placeholder dashboard
    leads/
      page.tsx             # bare lead list
      new/
        page.tsx            # intake form (Client Component)
        actions.ts          # "use server" — the intake Server Action
      [businessId]/
        page.tsx            # lead detail — business/website/audit/findings/score/screenshots
        actions.ts           # "use server" — runAudit + updateFindingStatus + captureScreenshots actions
        run-audit-button.tsx # Client Component wrapping runAuditAction
        finding-status-button.tsx # Client Component: verify/dismiss/restore
        copy-summary-button.tsx   # Client Component: clipboard copy
        capture-screenshots-button.tsx # Client Component wrapping captureScreenshotsAction
  lib/
    env.ts        # zod-validated environment variables (client + server)
    supabase/
      client.ts          # browser Supabase client (anon key)
      server.ts           # server-only Supabase client (service role key)
      database.types.ts   # hand-maintained types matching the migrations
    security/
      ssrf-guard.ts        # DNS-resolution IP blocklist
    audit/
      normalize-url.ts     # URL parsing/validation, root-domain extraction
      check-reachability.ts # bounded, SSRF-guarded reachability check
      pagespeed.ts          # PageSpeed API client (timeout + retry)
      normalize-pagespeed.ts # raw Lighthouse JSON -> normalized fields
      generate-findings.ts  # pure function: website+pagespeed -> findings
      run-audit.ts           # orchestrates claim -> pagespeed -> writes
      build-summary-text.ts  # pure function: data -> copy-to-AI plain text
      apify-screenshot.ts     # Apify REST client: run actor, fetch + validate image
      capture-screenshots.ts  # orchestrates parallel mobile+desktop capture, upload, insert
      fetch-html.ts            # bounded, SSRF-guarded GET that reads the response body
      scan-homepage.ts         # Cheerio parsing: title/meta/CTA/forms/trust/tech/schema
      sitemap-robots.ts        # independent /sitemap.xml + /robots.txt checks
      generate-html-findings.ts # pure functions: scan result -> findings
    scoring/
      website-need-score.ts # pure function: findings -> score + breakdown (Phase 4, at creation time)
      effective-score.ts    # pure function: findings -> live score, excludes dismissed (Phase 5, display/copy time)
    validation/
      website-intake.ts    # zod schema for the intake form
    leads/
      create-manual-lead.ts # orchestrates the Phase 3 writes

supabase/
  migrations/     # SQL migrations, applied manually for now (see below)
```

## Environment variables

See `.env.example`. Supabase variables are validated as of Phase 1;
`GOOGLE_PAGESPEED_API_KEY` (server-only) as of Phase 4;
`APIFY_API_TOKEN` and `APIFY_SCREENSHOT_ACTOR_ID` (both server-only) as
of Phase 6. Google Places and Make.com variables will be added in later
phases as those integrations are implemented — do not add real keys
for them yet.

**Use a development Supabase project only.** Do not point this app at a
production project or real customer data at this stage.

## Database

There is no Supabase CLI set up in this project yet, so migrations are
plain SQL files applied by hand rather than via `supabase db push`.

**To apply the current schema to your development Supabase project:**

1. Open your project's Supabase Dashboard.
2. Go to the SQL Editor.
3. Open `supabase/migrations/20260717000000_phase2_core_schema.sql` from
   this repo, copy its full contents, and paste it into the SQL Editor.
4. Run it. This creates `businesses`, `websites`, `audit_jobs`,
   `audits`, `audit_findings`, and `audit_scores`, with foreign keys,
   check constraints, indexes, `updated_at` triggers on the mutable
   tables, and row level security enabled (no policies) on all six.
5. Repeat for `supabase/migrations/20260718000000_phase6_screenshots.sql`
   — creates the `screenshots` table (RLS enabled, no policies) and the
   private `screenshots` Storage bucket (idempotent). This migration
   also re-asserts `service_role` GRANTs on all seven tables and sets
   `ALTER DEFAULT PRIVILEGES` for future tables, so — unlike after
   Phase 2 — a fresh database built from just the migration files does
   **not** need the manual grants fix described below.
6. Repeat for any later migration files, in filename (timestamp) order.

**Row level security:** every table has RLS **enabled with no
policies**. This is intentional, not a placeholder to fill in later —
there is no authentication yet, so a user-based policy would be
misleading. Deny-all means the anon/authenticated roles (the ones a
browser client would use) cannot read or write these tables at all.
All application data access goes through the server-only service-role
client (`src/lib/supabase/server.ts`), which always bypasses RLS. Do
not add browser-side Supabase reads/writes or "temporary" permissive
policies before real authentication exists — see `CLAUDE.md`.

**Types:** `src/lib/supabase/database.types.ts` is hand-maintained to
match the migrations, since there's no linked CLI project to generate
from yet. If a migration changes the schema, update this file in the
same change. Once the Supabase CLI is installed and linked to a real
project (a later, explicit step — not part of Phase 1/2), it can be
regenerated with `supabase gen types typescript`.

**`service_role` table grants — resolved.** The Phase 2 migration didn't
include explicit `GRANT` statements, and this project's `service_role`
initially lacked table privileges on all six Phase 2 tables (confirmed
via a direct PostgREST request returning
`permission denied for table businesses`, code `42501`). Fixed by
granting `SELECT, INSERT, UPDATE, DELETE` on all public tables and
`USAGE, SELECT` on all public sequences to `service_role`, plus
matching default privileges for future tables, applied directly against
the project (not via a migration file, since it's a privilege change,
not a schema change).

**Supabase URL normalization — resolved in code.** This project's
`.env.local` has `NEXT_PUBLIC_SUPABASE_URL` with `/rest/v1` already
appended, which doubled into a malformed path
(`PGRST125 Invalid path specified`) since Supabase client libraries
append that path themselves. Rather than requiring `.env.local` to
change, `src/lib/env.ts` now strips a trailing `/rest/v1` from the URL
before it's used.

## Important

Read `CLAUDE.md` before extending this project. It defines the approved
architecture, the phase plan, the current phase, what is intentionally
postponed, and the evidence-based wording and security rules the rest
of the app must follow.
