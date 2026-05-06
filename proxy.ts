import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Exact "/portal" plus any nested public flow (forgot-/reset-password). Other
// /portal/* routes (dashboard, ticket detail, etc.) require an authed session.
const PUBLIC_EXACT = new Set(["/portal"]);
const PUBLIC_PREFIXES = ["/portal/forgot-password", "/portal/reset-password"];

function isPortalPublic(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only the /portal/* tree is gated here. /admin/* is gated separately
  // (see Phase 8 — admin shell checks app_metadata.role === 'admin').
  if (!pathname.startsWith("/portal")) return NextResponse.next();
  if (isPortalPublic(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/portal", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/portal/:path*"],
};
