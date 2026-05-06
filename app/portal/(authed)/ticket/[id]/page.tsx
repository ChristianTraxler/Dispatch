import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { ticketNumber } from "@/lib/ticket";
import { hydrateAttachments, hydrateAvatarUrl } from "@/lib/storage";
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

  const messages: ChatMessage[] = await Promise.all(
    ticket.messages.map(async (m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "CLIENT" ? account.name : "Christian",
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
      attachments: await hydrateAttachments(m.attachments),
    })),
  );

  const ticketAttachments = await hydrateAttachments(ticket.attachments);
  const clientAvatarUrl = await hydrateAvatarUrl(account.avatarPath);

  return (
    <TicketDetailClient
      ticket={detail}
      ticketAttachments={ticketAttachments}
      messages={messages}
      viewerType="client"
      otherPartyName="Christian"
      myName={account.name}
      clientAvatarUrl={clientAvatarUrl}
    />
  );
}
