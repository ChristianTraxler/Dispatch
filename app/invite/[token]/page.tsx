import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/client-session";
import type { InviteState } from "@/components/InviteRedemption";
import { InviteRedemptionClient } from "./redemption-client";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InviteRedemptionPage({ params }: PageProps) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });

  // Compute the state, preferring the most-specific failure mode.
  const now = new Date();
  const isInvalid =
    !invite ||
    invite.redeemedAt !== null ||
    invite.revokedAt !== null ||
    invite.expiresAt < now;

  if (!invite || isInvalid) {
    return <InviteRedemptionClient state="INVALID" token={token} />;
  }

  const sessionUser = await getCurrentAuthUser();
  const inviteData = {
    email: invite.email,
    siteUrl: invite.siteUrl,
    siteDisplayName: invite.siteDisplayName,
  };

  if (sessionUser) {
    const sessionEmail = sessionUser.email?.toLowerCase() ?? "";
    const inviteEmail = invite.email.toLowerCase();

    const state: InviteState =
      sessionEmail === inviteEmail
        ? "EXISTING_LOGGED_IN_MATCH"
        : "EXISTING_LOGGED_IN_MISMATCH";

    return (
      <InviteRedemptionClient
        state={state}
        token={token}
        invite={inviteData}
        currentSessionEmail={sessionUser.email ?? undefined}
      />
    );
  }

  // No session. Does an account already exist for this email?
  const existing = await prisma.clientAccount.findUnique({
    where: { email: invite.email.toLowerCase() },
  });

  const state: InviteState = existing ? "EXISTING_NEEDS_LOGIN" : "NEW_SIGNUP";

  return (
    <InviteRedemptionClient state={state} token={token} invite={inviteData} />
  );
}
