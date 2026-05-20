import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/client-session";
import { sendInviteRedeemedEmail } from "@/lib/email";

export async function POST(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const user = await getCurrentAuthUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.redeemedAt) {
    return NextResponse.json({ error: "Invite already redeemed." }, { status: 409 });
  }
  if (invite.revokedAt) {
    return NextResponse.json({ error: "Invite revoked." }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite expired." }, { status: 410 });
  }

  const sessionEmail = user.email.toLowerCase();
  const inviteEmail = invite.email.toLowerCase();
  if (sessionEmail !== inviteEmail) {
    return NextResponse.json(
      { error: "This invite is for a different email." },
      { status: 403 },
    );
  }

  const account = await prisma.clientAccount.findUnique({
    where: { authUserId: user.id },
  });
  if (!account) {
    return NextResponse.json(
      { error: "No client account on file. Contact support." },
      { status: 404 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.site.upsert({
        where: {
          clientAccountId_url: {
            clientAccountId: account.id,
            url: invite.siteUrl,
          },
        },
        update: {
          displayName: invite.siteDisplayName,
        },
        create: {
          clientAccountId: account.id,
          url: invite.siteUrl,
          displayName: invite.siteDisplayName,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: {
          redeemedAt: new Date(),
          redeemedByAccountId: account.id,
        },
      });
    });
  } catch (err) {
    console.error("[merge] transaction failed:", err);
    return NextResponse.json(
      { error: "Could not attach the site. Try again." },
      { status: 500 },
    );
  }

  // Notify the admin that an existing client redeemed an invite. Don't fail the merge.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      await sendInviteRedeemedEmail(adminEmail, {
        kind: "merge",
        clientName: account.name,
        clientEmail: account.email,
        siteDisplayName: invite.siteDisplayName,
        siteUrl: invite.siteUrl,
        adminUrl: `${appUrl}/admin/clients`,
        redeemedAt: new Date(),
      });
    } catch (err) {
      console.error("[merge] invite-redeemed email failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
