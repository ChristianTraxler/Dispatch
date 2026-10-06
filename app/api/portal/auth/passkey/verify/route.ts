import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Step 2: verify the signed challenge. Supabase issues the session, which the
// server client writes to cookies, the same as the password login route.
export async function POST(req: Request) {
  let payload: { challengeId?: string; credential?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!payload.challengeId || !payload.credential || typeof payload.credential !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.passkey.verifyAuthentication({
    challengeId: payload.challengeId,
    credential: payload.credential as Parameters<
      typeof supabase.auth.passkey.verifyAuthentication
    >[0]["credential"],
  });

  if (error || !data?.user) {
    return NextResponse.json({ error: "Passkey sign-in failed." }, { status: 401 });
  }

  const role = (data.user.app_metadata as { role?: string } | undefined)?.role;
  return NextResponse.json({ redirect: role === "admin" ? "/admin" : "/portal/dashboard" });
}
