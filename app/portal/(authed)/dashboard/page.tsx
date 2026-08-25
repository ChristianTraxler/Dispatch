import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { ticketNumber } from "@/lib/ticket";
import { clientHasActivity } from "@/lib/ticket-activity";
import {
  type DashboardSite,
  type DashboardTicket,
} from "@/components/DashboardPage";
import { DashboardClient } from "./dashboard-client";
import { RefreshDashboardOnTicketChange } from "./refresh-on-change";

export default async function DashboardPage() {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  const tickets = await prisma.ticket.findMany({
    where: { clientAccountId: account.id, isInquiry: false },
    orderBy: { createdAt: "desc" },
    include: {
      site: { select: { id: true, url: true, displayName: true } },
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  // Unread counts in one grouped query rather than a filtered _count: Prisma
  // cannot count the same relation twice with different filters, and the
  // total message count above is already using it.
  const unreadRows = await prisma.message.groupBy({
    by: ["ticketId"],
    where: {
      senderType: "ADMIN",
      readAt: null,
      ticket: { clientAccountId: account.id, isInquiry: false },
    },
    _count: { _all: true },
  });
  const unreadByTicket = new Map(
    unreadRows.map((r) => [r.ticketId, r._count._all]),
  );

  const ticketDtos: DashboardTicket[] = tickets.map((t) => ({
    id: t.id,
    ticketNumber: ticketNumber(t.id, t.createdAt),
    title: t.title,
    siteId: t.siteId,
    siteUrl: t.site.url,
    status: t.status,
    lastActivityAt: (t.messages[0]?.createdAt ?? t.createdAt).toISOString(),
    messageCount: t._count.messages,
    unreadCount: unreadByTicket.get(t.id) ?? 0,
    hasActivity: clientHasActivity({
      unreadCount: unreadByTicket.get(t.id) ?? 0,
      clientLastViewedAt: t.clientLastViewedAt,
      firstViewedAt: t.firstViewedAt,
      reviewingStartedAt: t.reviewingStartedAt,
      fixingStartedAt: t.fixingStartedAt,
      fixedAt: t.fixedAt,
    }),
  }));

  const sites: DashboardSite[] = account.sites.map((s) => ({
    id: s.id,
    url: s.url,
    displayName: s.displayName,
  }));

  return (
    <>
      <RefreshDashboardOnTicketChange />
      <DashboardClient tickets={ticketDtos} sites={sites} />
    </>
  );
}
