import "server-only";

import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS. NEVER import from a client component —
// `server-only` makes that a build-time error.

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
