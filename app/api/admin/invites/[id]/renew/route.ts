import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthRequiredError, AdminRequiredError } from "@/lib/auth/admin-guard";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id } = await context.params;
  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.redeemedAt) {
    return NextResponse.json(
      { error: "Already redeemed — nothing to renew." },
      { status: 409 },
    );
  }
  if (invite.revokedAt) {
    return NextResponse.json(
      { error: "Invite was revoked — create a new one instead." },
      { status: 409 },
    );
  }

  // Keep the same token so the link in the recipient's email still works.
  const updated = await prisma.invite.update({
    where: { id },
    data: {
      expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
      reminderSentAt: null,
    },
  });
  return NextResponse.json({ invite: updated });
}
