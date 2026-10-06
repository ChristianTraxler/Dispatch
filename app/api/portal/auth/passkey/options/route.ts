import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Step 1 of passkey sign-in: ask Supabase for a challenge. The browser runs the
// device prompt and sends the result to ../verify.
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.passkey.startAuthentication();
  if (error || !data) {
    return NextResponse.json({ error: "Passkey sign-in is unavailable." }, { status: 400 });
  }
  return NextResponse.json({ challengeId: data.challenge_id, options: data.options });
}
