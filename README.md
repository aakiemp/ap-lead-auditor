# AP Webmaster — Lead Auditor

Internal lead research and website audit tool for AP Webmaster. Given a
business niche and location, the tool (eventually) discovers local
businesses, audits their websites for objective, evidence-based issues,
scores them as redesign/optimization prospects, and tracks outreach.

This is an internal MVP, not a commercial product. See `CLAUDE.md` for
the full architecture, phase plan, and rules this project is built
against.

## Current status

**Phase 1 only.** This is a bare project scaffold:

- Next.js App Router, TypeScript strict mode, Tailwind CSS, ESLint
- A placeholder dashboard page (no real functionality)
- Environment-variable validation structure (`src/lib/env.ts`)
- Basic Supabase client/server plumbing (`src/lib/supabase/`) — not yet
  connected to any database tables, since no migrations exist yet

No authentication, no database tables, no external API integrations
(Google Places, PageSpeed, Apify, Make.com), and no scoring/audit logic
exist yet. Do not expect this app to do anything beyond render one
placeholder page.

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
      client.ts   # browser Supabase client (anon key)
      server.ts   # server-only Supabase client (service role key)
```

## Environment variables

See `.env.example`. Only Supabase variables are validated in Phase 1.
Google Places, PageSpeed, Apify, and Make.com variables will be added in
later phases as those integrations are implemented — do not add real
keys for them yet.

**Use a development Supabase project only.** Do not point this app at a
production project or real customer data at this stage.

## Important

Read `CLAUDE.md` before extending this project. It defines the approved
architecture, the phase plan, the current phase, what is intentionally
postponed, and the evidence-based wording and security rules the rest
of the app must follow.
