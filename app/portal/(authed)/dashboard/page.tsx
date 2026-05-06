import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { ticketNumber } from "@/lib/ticket";
import {
  type DashboardSite,
  type DashboardTicket,
} from "@/components/DashboardPage";
import { DashboardClient } from "./dashboard-client";

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

  const ticketDtos: DashboardTicket[] = tickets.map((t) => ({
    id: t.id,
    ticketNumber: ticketNumber(t.id, t.createdAt),
    title: t.title,
    siteId: t.siteId,
    siteUrl: t.site.url,
    status: t.status,
    lastActivityAt: (t.messages[0]?.createdAt ?? t.createdAt).toISOString(),
    messageCount: t._count.messages,
    // unreadCount: omitted until messages.read_at is wired in Phase 8
  }));

  const sites: DashboardSite[] = account.sites.map((s) => ({
    id: s.id,
    url: s.url,
    displayName: s.displayName,
  }));

  return <DashboardClient tickets={ticketDtos} sites={sites} />;
}
