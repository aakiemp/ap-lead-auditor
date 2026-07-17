import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Browser-safe Supabase client. Uses the anon key only — never the
 * service role key. No auth/session wiring yet (Phase 1 plumbing only).
 *
 * Do not use this to read or write application data yet: every table
 * has row level security enabled with no policies, so the anon key
 * cannot access them regardless. All data access goes through
 * `createSupabaseServiceRoleClient` (server.ts) until authentication
 * exists.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
