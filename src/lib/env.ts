import { z } from "zod";

/**
 * Environment variable validation.
 *
 * Split into a client schema (safe to read in the browser, must be
 * prefixed NEXT_PUBLIC_) and a server schema (secrets, server-only).
 * Only Supabase plumbing is validated in Phase 1 — Google Places,
 * PageSpeed, Apify, and Make.com variables are added in later phases
 * when those integrations are implemented.
 *
 * Import `clientEnv` from client or server code. Only import
 * `serverEnv` from server-only code (API routes, server components,
 * server actions) — never from a "use client" file.
 */

const clientSchema = z.object({
  // Supabase client libraries expect the bare project URL (they append
  // /rest/v1/... themselves). Some project dashboards surface the URL
  // with /rest/v1 already appended, which would otherwise double up
  // into a malformed path — strip it defensively here so a correctly
  // configured .env.local isn't required to already be free of it.
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .transform((url) => url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "")),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_PAGESPEED_API_KEY: z.string().min(1),
});

function parseClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid client environment variables: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

function parseServerEnv() {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_PAGESPEED_API_KEY: process.env.GOOGLE_PAGESPEED_API_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

export const clientEnv = parseClientEnv();
export const serverEnv = parseServerEnv();
