# AP Webmaster — Lead Auditor

Internal lead research and website audit tool for AP Webmaster. Given a
business niche and location, the tool (eventually) discovers local
businesses, audits their websites for objective, evidence-based issues,
scores them as redesign/optimization prospects, and tracks outreach.

This is an internal MVP, not a commercial product. See `CLAUDE.md` for
the full architecture, phase plan, and rules this project is built
against.

## Current status

**Phase 1 through Phase 9.5, plus Phase 10 — implemented and
machine-verified end-to-end.** Phase 9.5's and Phase 10's real-browser
interaction checks are both pending the user's own click-through —
this sandboxed container can't launch a real browser (see "Current
status" below for why).

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

Phase 8 — Google Places business discovery (Text Search (New) only):

- `/searches/new` — form (niche, city, state, zip, max results 1–60,
  min rating, min review count, "exclude businesses with no website")
  that runs a search and imports results.
- `/searches` and `/searches/[searchId]` — past searches and one
  search's imported businesses in a checkbox table with a "Queue
  selected" action that creates `basic` `audit_jobs` rows — the
  **only** place discovery leads to an audit job; `runSearch()` itself
  never creates one.
- `src/lib/places/places-client.ts` — `POST /v1/places:searchText`,
  API key in `X-Goog-Api-Key` only, field mask in `X-Goog-FieldMask`,
  `minRating` sent directly in the request body when set.
- `src/lib/places/import-search.ts` — pages up to 3 times (capped at
  20/page), applies `minReviews`/`excludeNoWebsite` as local
  post-filters (the API has no such parameters), dedupes primarily by
  exact `google_place_id` (reuse + refresh, never clobbering existing
  non-blank data with a blank Google value), and otherwise always
  creates a new business row — a secondary phone/domain match against
  an existing business only attaches a flag-only `duplicate_warning`,
  **never** an auto-merge.
- **No reachability check during import** — `websites` rows are
  created with every reachability field left `null`; syntactic URL
  normalization only, no network request.
- `run-audit.ts` gained a reachability step: since a Places-imported
  website's `is_reachable` starts `null` (never checked) rather than
  `true`/`false`, "Run basic audit" now runs `checkReachability()`
  first when it sees `null`, persists the result, and only then
  proceeds — verified end-to-end against a real imported business.

Verified against the real dev Supabase project — see "Development
fixtures" below for exactly what was tested and what exists in the
database. Two Phase 3 bugs surfaced and were fixed during earlier
testing — see `CLAUDE.md` for details (an overly-permissive URL parser,
and an env-var normalization gap for a Supabase URL that already had
`/rest/v1` appended). A Phase 8 configuration issue (not an app bug)
is also documented there: the Places API key initially returned `403`
until billing was correctly attached to its Google Cloud project.

Phase 9 — audit queue dashboard (`/queue`), manual batch processing
only, no background worker, no schema change:

- Five sections (Queued / Running / Partial / Failed / Completed).
  Queued jobs are checkbox-selectable for **"Run selected audits"**
  or **"Run next batch"** (oldest-first, runs all available if fewer
  exist than the requested size — no error). Default batch size 3,
  max 10.
- `src/lib/audit/run-audit-batch.ts` — bounded-concurrency batch
  runner, a fixed non-configurable concurrency of **2** (kept
  conservative since the whole batch runs inside one synchronous
  Server Action request). Reuses the existing `runAudit()` unchanged
  for every job; one job's failure or thrown exception never aborts
  or skips a sibling job.
- `src/lib/audit/retry-job.ts` — retries a `failed`/`partial` job by
  atomically resetting it back to `queued` and immediately calling
  `runAudit()` again. Reuses the existing `audit_jobs` row (the
  current queue slot); every retry still inserts a brand-new,
  immutable `audits` row and never touches a prior one.
- `run-audit.ts`'s existing atomic claim now also increments
  `attempt` by exactly one per real execution — a job's first-ever
  claim leaves it at its INSERT default of 1; every retry-driven
  re-claim after that increments it. No separate increment step, no
  schema change, no way for one retry click to double-increment it.
- A claim conflict (or a submitted id that's invalid, nonexistent, or
  not `audit_depth = 'basic'`) is a `skipped` count only — the
  database row is left completely untouched. An unreachable website
  still counts as `completed` (the audit genuinely succeeded in
  producing a verified "unreachable" finding).
- A `Running` job whose `claimed_at` is over 15 minutes old shows a
  "Possibly stale" badge — informational only, nothing resets or
  reruns it automatically.
- Nothing runs on page load; every batch/retry needs an explicit
  click, and all execution controls on the page disable together
  while any one action is in flight.

Phase 9.5 — visible, honest in-progress status on `/queue` (a small
slot between Phase 9 and Phase 10, not a renumbering of either):

- Two new nullable `audit_jobs` columns — `progress_stage` (8-value
  `CHECK`, informational only) and `progress_updated_at`. `status`
  remains the only value any application logic branches on.
- `runAudit()` writes a real stage at each genuine transition —
  `claiming` → (`checking_reachability`, only when previously unknown)
  → `analyzing_website` (PageSpeed + the homepage scan run
  concurrently, so this is deliberately one combined stage, not two)
  → `saving_results` → `calculating_score` → `completed`/`partial`/
  `failed`. Never estimated from elapsed time. `claiming` and the
  three terminal stages are folded into the same statement that
  already writes `status`, so the two can never disagree.
- A real Postgres `CHECK` violation was forced directly against
  `updateAuditProgress()` to confirm it logs sanitized output and
  returns normally rather than throwing — a progress-write failure
  cannot fail the audit.
- **"Run next batch" is now resolve-then-execute**: a new read-only
  action resolves the exact oldest eligible job ids first: the client
  tracks those exact ids, then submits them through the same "Run
  selected audits" path — never re-resolved at execution time, since
  the queue can change in between. Verified live: a job claimed by
  another process between resolution and execution came back
  `skipped`, untouched, without corrupting the batch summary.
- The progress bar and "N of M finished — X running, Y waiting"
  summary are computed only from the exact ids the current action
  submitted — never system-wide — and percentage is strictly
  `finished / total` (an `auditing` job earns no partial credit).
- Polling is a self-scheduling 3-second loop, scoped to the current
  action's tracked ids, stopping once every tracked id is terminal.
  The existing 15-minute stale badge is unchanged; a new relative
  caption ("Updated 4 seconds ago") is shown alongside it.
- **The core architectural risk was verified directly**: a real 4-job
  batch's Server Action was fired in the background, and a separate
  polling request fired 2 seconds into its ~26-second run returned in
  167ms with genuinely live data — confirming the dev server does not
  serialize concurrent requests, so true live progress during a long,
  synchronous batch action is real on this architecture, not
  theoretical. No WebSockets, SSE, Redis, cron, or background worker.
- Scoped to `/queue` only, as approved; the lead-detail page's single
  "Run basic audit" button is unchanged and now also writes progress
  data via the shared instrumentation, just without its own UI yet.

Phase 10 — outreach preparation (`/leads/[businessId]/outreach`), no
AI API, no sending, no persistence:

- Turns existing audit evidence into a plain-text or markdown
  "prospect brief": business/website/Google-profile overview, audit
  summary with a live-computed opportunity score, selectable findings
  (grouped by status, each visibly labeled with its confidence —
  Verified/Likely/Manual review), suggested email subjects/opener/body
  outline/Loom outline.
- **No Server Action, no mutation, no external fetch anywhere** — the
  brief is a pure function recomputed entirely in the browser from
  already-loaded page data on every checkbox/tone change; nothing is
  saved, generated briefs and selections are never persisted.
- A narrow, explicitly-allowed DTO is the only thing that crosses from
  the server component to the Client Component — never a raw database
  row, never PageSpeed JSON, never a storage path or signed URL, never
  an `audit_jobs`/internal-error field. A finding's id is the one UUID
  that crosses this boundary, used only as a local selection key that
  is never rendered or copied.
- Screenshot signed URLs are passed as a separate prop used only for
  on-page thumbnail display — the copyable brief only ever states
  availability ("screenshots are available... attach them manually")
  and never contains a URL.
- `manual_review`-confidence findings can only ever appear under "Items
  to verify manually," regardless of their status — confidence and
  status are tracked independently and never conflated.
- Three fixed, human-reviewed tone presets (Warm/Direct/Professional)
  vary connective language only; facts, confidence, evidence, and the
  score are identical across all three by construction.

No authentication, no Make.com integration, no business-value/
contactability/priority scores, no automated worker, no AI API calls,
no automated outreach sending, no deep/multi-page crawling yet.

## Development fixtures

Four test leads exist in the dev Supabase project as known-good
fixtures (not cleaned up — kept intentionally for future testing):

| Business | Website | Result |
|---|---|---|
| Reachable Site Test (Phase 3 verify) | `https://example.com` | Audit completed. Performance 100, Accessibility 96, SEO 80, Best practices 96. 0 findings, website-need score 0. Also used in Phase 6: has both a mobile and desktop `screenshots` row (verified duplicate-safe on a second capture attempt). |
| Unreachable Host Test (Phase 3 verify) | an `.invalid` hostname | Audit completed without a PageSpeed call. 1 finding ("Website unreachable", critical). Website-need score 35. Also used in Phase 5 to test dismiss → restore → verify; its one finding's `status` ended the test cycle as `verified` (points/description unchanged throughout; the stored `audit_scores` row was never touched). |
| Duplicate Submission Test (Phase 4 verify) | `https://example.com` | Used to verify concurrent Run-audit clicks only ever produce one audit row. Same result profile as the first fixture. |
| HTML Scan Test - Divi Roofing Demo (Phase 7 verify) | `https://theultimatedivi.com/diviroofing/` (public WordPress/Divi marketplace demo, synthetic content) | Primary audit: `completed`, mobile performance 54, website-need score 38 from 5 point-earning findings (no contact form, no phone link, missing H1, missing meta description, no LocalBusiness schema) + 14 zero-point evidence findings (technology, trust signals, CTA, sitemap, etc.). Also used to exercise: an SSRF-blocked-redirect target (`ssrf_blocked`, Outcome B), a non-HTML content-type target (`unsupported_content_type`, Outcome D), and a transiently-erroring target (`http_error`) — 5 additional `audit_jobs` rows from that testing remain as historical evidence. |

Three real Google Places searches (Phase 8 verify, all real business
data — not synthetic) also exist in the dev project, all for **"coffee
shop" in Portland, OR**:

| Search | Parameters | Result |
|---|---|---|
| Search A | `maxResults=20`, `minRating=4` | `completed`. Found 20, imported 20 (2 with no website, left un-excluded), filtered 0. Confirmed `minRating` reaches Google — the lowest imported rating was 4.4. Confirmed no `websites` row got any reachability field populated during import. Real coincidental secondary-match warnings surfaced and were correctly flagged without merging: two physically distinct Stumptown Coffee Roasters locations sharing one website domain, and three unrelated businesses all listing an Instagram profile as their "website" (same root domain). |
| Search B | identical to Search A, re-run immediately after | `completed`. Found 20, imported 20 — but the business row count stayed at 20 (0 duplicates created). Confirmed exact `google_place_id` dedup: every place reused its existing row, `last_places_sync_at` was refreshed on all of them, and no `duplicate_warning` was attached (exact matches skip secondary matching entirely). |
| Search C | same niche/location, `minRating=4`, `minReviews=500`, `excludeNoWebsite=true` | `completed`. Found 20, filtered 13 (by review count and/or missing website), imported 7 — lowest imported review count was 511, and all 7 had a `websites` row. Its results page was then used to verify the full queue-selected flow: 3 businesses queued (one — "Good Coffee" — later used for the `is_reachable: null` → `checkReachability()` test below), a 4th queued in a follow-up submission, the 4 unselected businesses got no job, a duplicate resubmission of an already-queued business created no second job, and a submission mixing a syntactically-invalid id with a real business id from a *different, unrelated* search (a Phase 3 fixture) correctly queued only the valid+linked one. |

"Good Coffee" (`http://goodwith.us/`, imported via Search C) is the
fixture that verified the Phase 8 `run-audit.ts` reachability step:
its `websites` row started with `is_reachable: null` (and every other
reachability field `null`) immediately after import; clicking "Run
basic audit" ran `checkReachability()` first, persisted
`is_reachable: true` / `http_status: 200` / `https_enabled: true` /
a one-hop HTTP→HTTPS `redirect_chain`, and then completed a full
`completed` audit (mobile performance 78, homepage title "Good
Coffee", 16 findings) in the same click — confirming a Places-imported
business's first audit run no longer misreads "never checked" as
"confirmed unreachable."

Ten "Queue Test" leads (Phase 9 verify, created via the ordinary
`/leads/new` flow specifically to populate `/queue` with fast,
deterministic real outcomes) also exist in the dev project:

| Lead | Website | Result |
|---|---|---|
| Queue Test A | `https://example.com` | Run alone to verify a single-job batch. `completed`, performance 100. `attempt` stayed at 1 (first execution). Later resubmitted alongside an already-completed id in the same batch to confirm a completed job is never rerun — correctly `skipped`, no second `audits` row. |
| Queue Test B, C, D | `https://example.org`, `https://example.net`, `https://www.iana.org` | Run together with F in one 4-job batch. All three `completed`. Used with F to verify bounded concurrency. |
| Queue Test E — Unreachable | an `.invalid` hostname | `completed` with one verified "Website unreachable" finding (score 35) — confirms unreachable counts as `completed`, not a separate bucket. Also the "Run next batch" fixture: requested batch size 6 against only 4 available queued jobs, ran all 4, reported `selected: 4`, no error. |
| Queue Test F — NonHTML | `https://api.github.com` (returns JSON) | `failed` (Outcome D — both PageSpeed and the homepage scan genuinely fail on a non-HTML resource). Retried twice: `attempt` read `1 → 2 → 3`, exactly one increment per real execution; the original `audits` row stayed byte-for-byte unchanged both times, and each retry added exactly one new row (3 total). |
| Queue Test G — Concurrent Claim | `https://example.com` | Two near-simultaneous requests submitted "Run selected audits" for this single job. Exactly one returned `claimed: 1, completed: 1`; the other returned `claimed: 0, skipped: 1` — confirmed via the database afterward: exactly one `audits` row, `attempt` still 1 (no double-increment from the race). |
| Queue Test H — Dup Test | `https://example.com` | Submitted twice in the same batch (alongside Queue Test A's already-completed id) to confirm client-submitted duplicate ids collapse to one execution before touching the database — `selected: 2` (deduplicated), not 3. |
| Queue Test I — Invalid Mix | `https://example.org` | Submitted alongside a syntactically-invalid id and a synthetic `audit_depth: 'discovery_only'` job (inserted directly for this one test, then removed) — both were safely rejected/skipped without erroring the batch; the non-`basic` job's row was left completely untouched. |
| Queue Test J — Stale Fixture | `https://example.net` | Its job was forced directly into `status: 'auditing'` with a `claimed_at` 20 minutes in the past. `/queue` correctly showed it under **Running** with a "Possibly stale" badge; simply loading the page never reset or reran it. Left in this state intentionally as a fixture for a future force-reset feature. |

The two pre-existing `failed` `audit_jobs` rows from Phase 7 testing
(the Divi Roofing demo's `unsupported_content_type`/`http_error`
exercises) were also confirmed to still appear correctly in `/queue`'s
Failed section and remain available to retry — left untouched as
historical evidence.

**Known testing limitation**: a genuine Outcome C (`partial`) audit —
the homepage scan succeeds but PageSpeed genuinely fails on an
otherwise-reachable site — proved impractical to reproduce on demand
against real external targets in this session. `partial` batch
classification was verified by code inspection instead (it flows
through the exact same, already-proven `writeAuditOutcome()` return
path as `completed`/`failed`), not by a live trigger.

Phase 9.5 created several short-lived "Progress Test" leads (`A`–`G`,
plus a few one-off fixtures) purely to populate `/queue` with fresh,
fast-executing jobs for progress-instrumentation testing — most
completed normally during testing and carry no lasting significance
beyond that. One fixture was kept intentionally:

| Fixture | What it exercised |
|---|---|
| Stale Progress Test | Forced directly into `status: 'auditing'`, `claimed_at` 20 minutes in the past, `progress_stage: 'analyzing_website'`, `progress_updated_at` 2 minutes in the past. `/queue` correctly showed **both** the existing 15-minute "Possibly stale" badge and the new "Updated 2 minutes ago" caption together, with the stage label ("Running performance and homepage checks…") unchanged — confirmed simply loading the page never resets or reruns it. Left in this state intentionally, alongside Phase 9's similar `Queue Test J`. |

The critical "does polling actually work concurrently with a pending
batch Server Action" question was verified directly rather than
assumed: the dev build's own `server-reference-manifest.json` was used
to find `getAuditProgressAction`'s real action id, allowing it to be
invoked exactly as the browser would (a `Next-Action` header POST) —
independent of the checkbox-driven form-submission protocol used
everywhere else in this project's testing. A real 4-job batch was
fired via curl in the background; 2 seconds into its ~26-second run, a
separate polling request for the same 4 ids returned in **167ms**
showing genuinely live data (2 jobs `auditing`/`analyzing_website`, 2
still `queued`). A plain page `GET` fired the same way also returned
promptly mid-batch. Neither serialized behind the pending batch
request.

Phase 10 (`/leads/[businessId]/outreach`) reused five existing
fixtures rather than creating new ones — no new business/website/audit
records were needed since the feature is read-only:

| Fixture | What it exercised |
|---|---|
| Reachable Site Test (Phase 3/6 verify) | Completed audit **with** both mobile and desktop screenshots — confirmed the copyable preview text contains zero trace of the signed screenshot URLs (checked directly against the underlying HTML: the signed URL appears only in the page's `<img src>` thumbnail, never in the `<pre>` preview), while the "Screenshots are available... attach them manually" sentence renders correctly. |
| Queue Test A (Phase 9 verify) | Completed audit **without** screenshots — correct "No homepage screenshots have been captured" wording. |
| Unreachable Host Test (Phase 3 verify) | Unreachable-site wording — confirmed neutral phrasing ("could not be reached during the recorded audit attempt"), no Google data, no closed/inactive/neglected language. |
| Good Coffee (Phase 8 verify) | Places-imported business — Google rating (4.7), review count (511), full formatted address, Maps URL, and search-context sentence ("Found via Google Places search for...") all rendered correctly with no `google_place_id` or other internal field leaking. |
| HTML Scan Test - Divi Roofing Demo (Phase 7 verify) | Its current latest audit genuinely mixes two `verified`-confidence findings (routed correctly to Top Opportunities, using each finding's `description` text) with one `manual_review`-confidence finding (routed correctly to Items to Verify Manually only, never Top Opportunities) — real, live confirmation of the confidence-based routing rule, not just a synthetic test. |

**Known testing limitation**: this sandboxed container cannot launch a
real browser (headless Chromium needs system shared libraries not
present here; installing them requires `sudo`, which is never used;
`chromium-cli` was also unavailable). Interactive verification of the
checkboxes, tone selector, dismissed-findings toggle, live preview,
and both copy buttons was therefore not done by an automated click-
through — it was verified instead through 623 passing pure-function
assertions (`npx tsx` against the real `src/lib/outreach/*` modules,
covering every selection/routing/tone/escaping rule) plus code review
of the Client Component's wiring, consistent with what was approved
for this phase. The dev server was left running for the user to
click through `/leads/[businessId]/outreach` themselves.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your DEVELOPMENT Supabase project's values
npm run dev
```

Open http://localhost:3000.

`.env.local` is now required for `/leads`, `/leads/new`,
`/leads/[businessId]`, `/searches`, `/searches/new`,
`/searches/[searchId]`, and `/queue` to work — they read/write
Supabase directly. `GOOGLE_PAGESPEED_API_KEY` is required for the "Run
basic audit" button (and every `/queue` batch/retry action, which all
call the same underlying code) to succeed on a reachable website;
`APIFY_API_TOKEN` and `APIFY_SCREENSHOT_ACTOR_ID` are required for
"Capture screenshots" to succeed (a website already known to be
unreachable never calls either service, so both buttons render fine
without those keys — they just can't complete their action);
`GOOGLE_PLACES_API_KEY` is required for `/searches/new` to succeed
(needs Places API (New) enabled and billing attached on its Google
Cloud project). `/queue` introduces no new environment variable. The
root `/` dashboard still renders without any of it.

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
        outreach/
          page.tsx              # server component: builds the sanitized outreach DTO
          outreach-builder.tsx   # Client Component: tone/findings/dismissed toggle, live preview, copy
    searches/
      page.tsx               # list of past searches
      new/
        page.tsx              # search form (Client Component)
        actions.ts             # "use server" — the search Server Action, calls runSearch()
      [searchId]/
        page.tsx                # one search's imported businesses
        actions.ts               # "use server" — queueSelectedAction
        queue-selected-form.tsx  # Client Component: checkbox table + queue submit
    queue/
      page.tsx           # queue dashboard — 5 status sections, stale-job warning, progress columns
      actions.ts          # "use server" — runSelectedAuditsAction/retryJobAction
      progress-actions.ts  # "use server", read-only — resolveNextBatchJobIdsAction/getAuditProgressAction
      queue-table.tsx       # Client Component: selection, batch size, live progress bar + polling
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
      run-audit.ts           # orchestrates claim (+ attempt increment) -> pagespeed -> writes
      run-audit-batch.ts      # bounded-concurrency (2) batch runner over runAudit()
      retry-job.ts             # atomic failed/partial -> queued reset, then runAudit()
      stale-job.ts              # pure function: is a Running job's claim old enough to flag?
      audit-progress.ts          # updateAuditProgress() (best-effort write) + progressStageLabel()
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
    places/
      normalize-phone.ts     # pure function: raw phone -> +1XXXXXXXXXX or best-effort digits
      places-client.ts        # Places Text Search (New) fetch wrapper
      import-search.ts         # orchestrates search -> page -> filter -> dedup/import
    outreach/
      build-prospect-brief.ts # pure function: sanitized DTO + selection + tone -> structured brief
      render-plain-text.ts     # pure function: brief -> plain text (no content decisions)
      render-markdown.ts        # pure function: brief -> markdown, escapes user-controlled text
      tone-presets.ts             # fixed, human-reviewed phrase banks (no AI)
    validation/
      website-intake.ts    # zod schema for the intake form
      search-intake.ts     # zod schema for the search form
      queue-batch.ts        # batch size schema/limits (default 3, max 10)
    leads/
      create-manual-lead.ts # orchestrates the Phase 3 writes (also sets phone_normalized, Phase 8)

supabase/
  migrations/     # SQL migrations, applied manually for now (see below)
```

## Environment variables

See `.env.example`. Supabase variables are validated as of Phase 1;
`GOOGLE_PAGESPEED_API_KEY` (server-only) as of Phase 4;
`APIFY_API_TOKEN` and `APIFY_SCREENSHOT_ACTOR_ID` (both server-only) as
of Phase 6; `GOOGLE_PLACES_API_KEY` (server-only) as of Phase 8. A
Make.com variable will be added in a later phase as that integration is
implemented — do not add a real value for it yet.

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
6. Repeat for
   `supabase/migrations/20260719000000_phase8_places_discovery.sql` —
   creates `searches` and `search_businesses` (both RLS enabled, no
   policies), adds 13 Google Places columns to `businesses`, and
   indexes `businesses.phone_normalized` /`websites.root_domain` for
   the secondary duplicate-match check. Also re-asserts `service_role`
   GRANTs on its two new tables.
7. Repeat for
   `supabase/migrations/20260720000000_phase9_5_audit_progress.sql` —
   adds `progress_stage` (`CHECK`-constrained, nullable) and
   `progress_updated_at` (nullable) to the existing `audit_jobs`
   table. No new table, so no grant changes needed — the existing
   table-level grants already cover both columns.
8. Repeat for any later migration files, in filename (timestamp) order.

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
