import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Single OAuth/PKCE callback for any flow that hands us a `code` param —
// password reset, magic link, invite redemption (Phase 5).
// Exchanges the code for a session (cookies set on the response), then
// forwards to the `next` query param.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/portal/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const failUrl = new URL("/portal", req.url);
      failUrl.searchParams.set("auth_error", "exchange_failed");
      return NextResponse.redirect(failUrl);
    }
  }

  return NextResponse.redirect(new URL(next, req.url));
}
