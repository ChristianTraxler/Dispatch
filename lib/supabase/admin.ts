import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS. NEVER import from a client component —
// `server-only` makes that a build-time error.
//
// Lazy: createClient throws "supabaseUrl is required" if the env var isn't
// set at construction. Module-load instantiation made the Vercel build crash
// before env vars were even in scope. Defer until first use.

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
    _client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}
