import { NextResponse } from "next/server";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { getPendingForAccount } from "@/lib/email-change";

export async function GET() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const pending = await getPendingForAccount(account.id);
  if (!pending) {
    return NextResponse.json({ pending: null });
  }

  return NextResponse.json({
    pending: {
      newEmail: pending.newEmail,
      expiresAt: pending.expiresAt.toISOString(),
    },
  });
}
