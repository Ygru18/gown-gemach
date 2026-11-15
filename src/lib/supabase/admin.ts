import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

// Bypasses RLS. Server-only. Used for exactly two things, each after the
// app's own permission check: Storage signing and the Auth admin API.
export function createAdminClient() {
  const env = getEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
