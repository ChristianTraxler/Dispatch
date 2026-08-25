import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

/**
 * Toggle the client's ticket-update email. Its own route rather than a widening
 * of PATCH /api/portal/account, which hard-requires `name` — matching how
 * /avatar, /email and /password are already split out.
 *
 * Push notifications are untouched here: they live per-device in
 * push_subscriptions and have their own toggle.
 */
export async function PATCH(req: Request) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: { emailNotifications?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Strict boolean, not truthiness: a stray "false" string must not read as on.
  if (typeof payload.emailNotifications !== "boolean") {
    return NextResponse.json(
      { error: "emailNotifications must be true or false." },
      { status: 400 },
    );
  }

  await prisma.clientAccount.update({
    where: { id: account.id },
    data: { emailNotifications: payload.emailNotifications },
  });

  return NextResponse.json({ ok: true, emailNotifications: payload.emailNotifications });
}
