import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ticketNumber } from "@/lib/ticket";
import { hydrateAttachments, hydrateAvatarUrl } from "@/lib/storage";
import { isOutOfFreeWindow } from "@/lib/free-updates";
import type { ChatMessage } from "@/components/ChatThread";
import type { TicketDetail } from "@/components/TicketDetailPage";
import { AdminTicketDetailClient } from "./admin-ticket-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTicketDetailPage({ params }: PageProps) {
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      site: { select: { url: true, displayName: true, productionStartedAt: true } },
      clientAccount: { select: { name: true, email: true, avatarPath: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) notFound();

  const isInquiry = ticket.isInquiry;
  const inquiryEndedAt = ticket.inquiryEndedAt?.toISOString() ?? null;

  // Stage 3 (Viewed) — auto-set the first time the admin opens the ticket.
  // Inquiries skip the 6-stage flow, so don't touch firstViewedAt for them.
  if (!isInquiry && !ticket.firstViewedAt) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { firstViewedAt: new Date() },
    });
    ticket.firstViewedAt = new Date();
  }

  const detail: TicketDetail = {
    id: ticket.id,
    ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    status: ticket.status,
    siteUrl: ticket.site.url,
    siteDisplayName: ticket.site.displayName,
    clientName: ticket.clientAccount.name,
    createdAt: ticket.createdAt.toISOString(),
    receivedAt: ticket.receivedAt?.toISOString() ?? null,
    firstViewedAt: ticket.firstViewedAt?.toISOString() ?? null,
    reviewingStartedAt: ticket.reviewingStartedAt?.toISOString() ?? null,
    fixingStartedAt: ticket.fixingStartedAt?.toISOString() ?? null,
    fixedAt: ticket.fixedAt?.toISOString() ?? null,
    confirmedAt: ticket.confirmedAt?.toISOString() ?? null,
  };

  const messages: ChatMessage[] = await Promise.all(
    ticket.messages.map(async (m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "ADMIN" ? "Christian" : ticket.clientAccount.name,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
      attachments: await hydrateAttachments(m.attachments),
    })),
  );

  const ticketAttachments = await hydrateAttachments(ticket.attachments);
  const clientAvatarUrl = await hydrateAvatarUrl(ticket.clientAccount.avatarPath);
  const outOfFreeWindow = isOutOfFreeWindow(
    ticket.createdAt,
    ticket.site.productionStartedAt,
  );

  return (
    <AdminTicketDetailClient
      ticket={detail}
      ticketAttachments={ticketAttachments}
      messages={messages}
      otherPartyName={ticket.clientAccount.name}
      isInquiry={isInquiry}
      inquiryEndedAt={inquiryEndedAt}
      clientAvatarUrl={clientAvatarUrl}
      outOfFreeWindow={outOfFreeWindow}
    />
  );
}
