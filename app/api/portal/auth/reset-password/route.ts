import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  let payload: { password?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const password = payload.password;
  if (!password || password.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // The user must already have a (recovery) session — the /auth/callback route
  // exchanged the email-link code into cookies before they landed here. If
  // they don't, the updateUser call returns an auth error.
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error || !data.user) {
    return NextResponse.json(
      { error: "Reset link expired or invalid. Request a new one." },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
