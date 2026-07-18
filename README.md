# AP Webmaster — Lead Auditor

Internal lead research and website audit tool for AP Webmaster. Given a
business niche and location, the tool (eventually) discovers local
businesses, audits their websites for objective, evidence-based issues,
scores them as redesign/optimization prospects, and tracks outreach.

This is an internal MVP, not a commercial product. See `CLAUDE.md` for
the full architecture, phase plan, and rules this project is built
against.

## Current status

**Phase 1, 2, and 3 — complete and fully verified end-to-end.**

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

Verified against the real dev Supabase project: submitting a reachable
site and an unreachable hostname both correctly create
`businesses`/`websites`/`audit_jobs` rows, redirect to
`/leads/[businessId]`, and show up in `/leads`. Two bugs surfaced and
were fixed during that testing — see "Database" below and `CLAUDE.md`
for details (an overly-permissive URL parser, and an env-var
normalization gap for a Supabase URL that already had `/rest/v1`
appended).

No authentication, no PageSpeed integration, no findings/scoring, no
Google Places/Apify/Make.com integration yet.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your DEVELOPMENT Supabase project's values
npm run dev
```

Open http://localhost:3000.

`.env.local` is now required for `/leads`, `/leads/new`, and
`/leads/[businessId]` to work — they read/write Supabase directly. The
root `/` dashboard still renders without it.

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
        page.tsx            # read-only lead detail
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
    validation/
      website-intake.ts    # zod schema for the intake form
    leads/
      create-manual-lead.ts # orchestrates the Phase 3 writes

supabase/
  migrations/     # SQL migrations, applied manually for now (see below)
```

## Environment variables

See `.env.example`. Only Supabase variables are validated in Phase 1.
Google Places, PageSpeed, Apify, and Make.com variables will be added in
later phases as those integrations are implemented — do not add real
keys for them yet.

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
5. Repeat for any later migration files, in filename (timestamp) order.

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
