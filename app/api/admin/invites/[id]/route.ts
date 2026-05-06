import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthRequiredError, AdminRequiredError } from "@/lib/auth/admin-guard";

export async function DELETE(
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
      { error: "Already redeemed — cannot revoke." },
      { status: 409 },
    );
  }

  const updated = await prisma.invite.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ invite: updated });
}
