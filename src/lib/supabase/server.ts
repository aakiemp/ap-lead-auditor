import "server-only";

import { createClient } from "@supabase/supabase-js";

import { clientEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only Supabase client using the service role key. This app has
 * no authentication yet, so there is no per-user session/cookie wiring —
 * server code talks to Supabase with elevated privileges directly.
 *
 * Must only be imported from server-only code (API routes, server
 * components, server actions). The `server-only` import throws at build
 * time if this module is ever pulled into a client bundle.
 *
 * This is currently the only supported way to read or write application
 * data: all six Phase 2 tables have RLS enabled with no policies, so
 * only the service role key (which bypasses RLS) can reach them.
 */
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
