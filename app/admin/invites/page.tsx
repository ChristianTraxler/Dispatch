import { prisma } from "@/lib/prisma";
import {
  type AdminInvite,
  type InviteStatus,
} from "@/components/AdminInvitesPage";
import { InvitesListClient } from "./invites-list-client";

function deriveStatus(invite: {
  redeemedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InviteStatus {
  if (invite.redeemedAt) return "REDEEMED";
  if (invite.revokedAt) return "REVOKED";
  if (invite.expiresAt < new Date()) return "EXPIRED";
  return "PENDING";
}

function inviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/invite/${token}`;
}

export default async function AdminInvitesListPage() {
  const rows = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
  });

  const invites: AdminInvite[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    recipientName: r.recipientName ?? undefined,
    siteUrl: r.siteUrl,
    siteDisplayName: r.siteDisplayName,
    status: deriveStatus(r),
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    redeemedAt: r.redeemedAt?.toISOString() ?? null,
    redeemedByEmail: r.redeemedAt ? r.email : null,
    inviteUrl: inviteUrl(r.token),
  }));

  return <InvitesListClient invites={invites} />;
}
