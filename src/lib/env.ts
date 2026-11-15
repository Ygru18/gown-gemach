import "server-only";
import { z } from "zod";

// Validated lazily (on first use) so that `next build` can analyse modules
// without every runtime secret being present at build time.
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  // Server-only. Bypasses Supabase RLS — used solely for Storage signing and
  // the Auth admin API (creating staff logins). Never prefix with NEXT_PUBLIC_.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_STORAGE_BUCKET: z.string().default("gown-photos"),
  // One-time code that protects the first-run /setup page.
  SETUP_TOKEN: z.string().optional(),
});

type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid or missing environment variables:", z.flattenError(parsed.error).fieldErrors);
    throw new Error("Invalid or missing environment variables. See .env.example.");
  }
  cached = parsed.data;
  return cached;
}

/**
 * Local end-to-end test mode: replaces Supabase Auth with a cookie and
 * Supabase Storage with the local filesystem. It can only ever activate on
 * a `next dev` server outside Vercel with the flag explicitly set, so it is
 * impossible to enable on a deployed site.
 */
export function isLocalTestMode(): boolean {
  return (
    process.env.E2E_LOCAL_MODE === "1" &&
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL
  );
}
