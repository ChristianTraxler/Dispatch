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
      clientAccount: { select: { id: true, name: true, email: true, avatarPath: true } },
      messages: { orderBy: { createdAt: "asc" } },
      addOn: true,
    },
  });

  if (!ticket) notFound();

  let addOnBanner: {
    clientId: string;
    addOn: {
      id: string;
      name: string;
      kind: "RECURRING" | "ONE_TIME";
      scope: "PER_SITE" | "PER_CLIENT";
      priceType: "FIXED" | "RANGE" | "PERCENTAGE";
      priceCents: number;
      priceMaxCents: number | null;
      pricePercentBp: number | null;
      priceUnit: "ONE_TIME" | "PER_MONTH" | "PER_YEAR";
    };
    override: {
      priceType: "FIXED" | "RANGE" | "PERCENTAGE";
      priceCents: number;
      priceMaxCents: number | null;
      pricePercentBp: number | null;
    } | null;
    alreadyActiveCount: number;
    defaultSiteId: string;
    clientSites: { id: string; displayName: string }[];
  } | null = null;

  if (ticket.addOn) {
    const [override, alreadyActive, clientSites] = await Promise.all([
      prisma.addOnClientPrice.findUnique({
        where: {
          addOnId_clientAccountId: {
            addOnId: ticket.addOn.id,
            clientAccountId: ticket.clientAccount.id,
          },
        },
      }),
      prisma.clientAddOn.count({
        where: {
          clientAccountId: ticket.clientAccount.id,
          addOnId: ticket.addOn.id,
          status: "ACTIVE",
          ...(ticket.addOn.scope === "PER_SITE" ? { siteId: ticket.siteId } : {}),
        },
      }),
      prisma.site.findMany({
        where: { clientAccountId: ticket.clientAccount.id },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
      }),
    ]);

    addOnBanner = {
      clientId: ticket.clientAccount.id,
      addOn: {
        id: ticket.addOn.id,
        name: ticket.addOn.name,
        kind: ticket.addOn.kind,
        scope: ticket.addOn.scope,
        priceType: ticket.addOn.priceType,
        priceCents: ticket.addOn.priceCents,
        priceMaxCents: ticket.addOn.priceMaxCents,
        pricePercentBp: ticket.addOn.pricePercentBp,
        priceUnit: ticket.addOn.priceUnit,
      },
      override: override
        ? {
            priceType: override.priceType,
            priceCents: override.priceCents,
            priceMaxCents: override.priceMaxCents,
            pricePercentBp: override.pricePercentBp,
          }
        : null,
      alreadyActiveCount: alreadyActive,
      defaultSiteId: ticket.siteId,
      clientSites,
    };
  }

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
      addOnBanner={addOnBanner}
    />
  );
}
