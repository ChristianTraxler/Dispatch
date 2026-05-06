import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  let payload: { currentPassword?: string; newPassword?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { currentPassword, newPassword } = payload;
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current and new passwords are required." },
      { status: 400 },
    );
  }
  if (newPassword.length < 12) {
    return NextResponse.json(
      { error: "New password must be at least 12 characters." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // Re-verify the current password by attempting a sign-in. This refreshes
  // the session as a side effect, which is fine.
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 },
    );
  }

  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
