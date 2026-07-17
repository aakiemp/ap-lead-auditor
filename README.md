# AP Webmaster — Lead Auditor

Internal lead research and website audit tool for AP Webmaster. Given a
business niche and location, the tool (eventually) discovers local
businesses, audits their websites for objective, evidence-based issues,
scores them as redesign/optimization prospects, and tracks outreach.

This is an internal MVP, not a commercial product. See `CLAUDE.md` for
the full architecture, phase plan, and rules this project is built
against.

## Current status

**Phase 1 and Phase 2 only.**

Phase 1 — bare project scaffold:

- Next.js App Router, TypeScript strict mode, Tailwind CSS, ESLint
- A placeholder dashboard page (no real functionality)
- Environment-variable validation structure (`src/lib/env.ts`)
- Basic Supabase client/server plumbing (`src/lib/supabase/`)

Phase 2 — core database schema (not yet applied to any Supabase
project — see "Database" below):

- SQL migration defining `businesses`, `websites`, `audit_jobs`,
  `audits`, `audit_findings`, `audit_scores`
- Hand-maintained TypeScript types matching that schema
  (`src/lib/supabase/database.types.ts`)
- Row level security enabled on all six tables, with no policies

No authentication, no application routes/forms, no external API
integrations (Google Places, PageSpeed, Apify, Make.com), and no
scoring/audit logic exist yet. The app still only renders one
placeholder page — Phase 2 is schema-only, nothing reads or writes
these tables yet.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your DEVELOPMENT Supabase project's values
npm run dev
```

Open http://localhost:3000.

The app will start and render the placeholder dashboard even without a
real `.env.local`, since nothing on the current page reads the Supabase
plumbing yet. `.env.local` will become required once later phases wire
up real Supabase calls.

## Scripts

- `npm run dev` — start the local dev server
- `npm run build` — production build
- `npm run lint` — run ESLint
- `npx tsc --noEmit` — type-check without emitting output

## Project structure

```
src/
  app/            # Next.js App Router pages
  lib/
    env.ts        # zod-validated environment variables (client + server)
    supabase/
      client.ts          # browser Supabase client (anon key)
      server.ts          # server-only Supabase client (service role key)
      database.types.ts  # hand-maintained types matching the migrations

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

## Important

Read `CLAUDE.md` before extending this project. It defines the approved
architecture, the phase plan, the current phase, what is intentionally
postponed, and the evidence-based wording and security rules the rest
of the app must follow.
