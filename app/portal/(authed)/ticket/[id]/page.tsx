import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { ticketNumber } from "@/lib/ticket";
import type { ChatMessage } from "@/components/ChatThread";
import type { TicketDetail } from "@/components/TicketDetailPage";
import { TicketDetailClient } from "./ticket-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientTicketDetailPage({ params }: PageProps) {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  const { id } = await params;

  const ticket = await prisma.ticket.findFirst({
    where: { id, clientAccountId: account.id },
    include: {
      site: { select: { url: true, displayName: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) notFound();

  const detail: TicketDetail = {
    id: ticket.id,
    ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    status: ticket.status,
    siteUrl: ticket.site.url,
    siteDisplayName: ticket.site.displayName,
    createdAt: ticket.createdAt.toISOString(),
    receivedAt: ticket.receivedAt?.toISOString() ?? null,
    firstViewedAt: ticket.firstViewedAt?.toISOString() ?? null,
    reviewingStartedAt: ticket.reviewingStartedAt?.toISOString() ?? null,
    fixingStartedAt: ticket.fixingStartedAt?.toISOString() ?? null,
    fixedAt: ticket.fixedAt?.toISOString() ?? null,
    confirmedAt: ticket.confirmedAt?.toISOString() ?? null,
    // reopenedAt isn't part of the timeline component yet — Phase 7 extends it
  };

  const messages: ChatMessage[] = ticket.messages.map((m) => ({
    id: m.id,
    senderType: m.senderType,
    senderName: m.senderType === "CLIENT" ? account.name : "Christian",
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
  }));

  return (
    <TicketDetailClient
      ticket={detail}
      messages={messages}
      viewerType="client"
      otherPartyName="Christian"
      otherPartyOnline={false}
    />
  );
}
