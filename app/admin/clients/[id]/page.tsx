import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hydrateAvatarUrl } from "@/lib/storage";
import { freeWindowStatus, isOutOfFreeWindow } from "@/lib/free-updates";
import type { TicketStatus } from "@/components/StatusPill";
import type {
  AdminClientDetailData,
  AdminClientDetailSite,
  AdminClientDetailTicket,
} from "@/components/AdminClientDetail";
import type { FreeWindowStatus } from "@/lib/free-updates";
import { ClientDetailClient } from "./detail-client";

const OPEN_STATUSES = ["NEW", "REVIEWING", "FIXING", "REOPENED"] as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const account = await prisma.clientAccount.findUnique({
    where: { id },
    include: {
      sites: {
        orderBy: { addedAt: "asc" },
        include: {
          _count: { select: { tickets: { where: { isInquiry: false } } } },
          tickets: {
            where: { isInquiry: false, status: { in: [...OPEN_STATUSES] } },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!account) notFound();

  const avatarUrl = await hydrateAvatarUrl(account.avatarPath);

  const recentTicketRows = await prisma.ticket.findMany({
    where: { clientAccountId: id, isInquiry: false },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      site: { select: { displayName: true, productionStartedAt: true } },
    },
  });

  const messageCount = await prisma.message.count({
    where: { ticket: { clientAccountId: id } },
  });

  const [catalog, overrides, clientAddOns] = await Promise.all([
    prisma.addOn.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.addOnClientPrice.findMany({ where: { clientAccountId: id } }),
    prisma.clientAddOn.findMany({
      where: { clientAccountId: id },
      include: {
        addOn: true,
        site: { select: { id: true, displayName: true } },
        requestTicket: { select: { id: true, title: true, status: true } },
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const sites: AdminClientDetailSite[] = account.sites.map((s) => ({
    id: s.id,
    url: s.url,
    displayName: s.displayName,
    totalTickets: s._count.tickets,
    openTickets: s.tickets.length,
    productionStartedAt: s.productionStartedAt?.toISOString() ?? null,
  }));

  const freeWindowStatusBySite: Record<string, FreeWindowStatus> = {};
  for (const s of account.sites) {
    freeWindowStatusBySite[s.id] = freeWindowStatus(s.productionStartedAt);
  }

  const recentTickets: AdminClientDetailTicket[] = recentTicketRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status as TicketStatus,
    createdAt: t.createdAt.toISOString(),
    siteDisplayName: t.site.displayName,
    outOfFreeWindow: isOutOfFreeWindow(t.createdAt, t.site.productionStartedAt),
  }));

  const totalTickets = sites.reduce((s, st) => s + st.totalTickets, 0);
  const openTickets = sites.reduce((s, st) => s + st.openTickets, 0);

  const data: AdminClientDetailData = {
    id: account.id,
    name: account.name,
    email: account.email,
    joinedAt: account.createdAt.toISOString(),
    avatarUrl,
    isOnline: false,
    lastSeenAt: null,
    sites,
    recentTickets,
    totals: {
      sites: sites.length,
      tickets: totalTickets,
      openTickets,
      messages: messageCount,
    },
  };

  return (
    <ClientDetailClient
      initial={data}
      initialFreeWindowStatusBySite={freeWindowStatusBySite}
      addOnsCatalog={catalog.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        scope: a.scope,
        priceCents: a.priceCents,
        priceUnit: a.priceUnit,
        isActive: a.isActive,
      }))}
      addOnsOverrides={overrides.map((o) => ({
        addOnId: o.addOnId,
        priceCents: o.priceCents,
      }))}
      addOnsActive={clientAddOns.map((r) => ({
        id: r.id,
        addOnId: r.addOnId,
        addOnName: r.addOn.name,
        kind: r.addOn.kind,
        scope: r.addOn.scope,
        priceUnit: r.addOn.priceUnit,
        siteId: r.siteId,
        siteName: r.site?.displayName ?? null,
        status: r.status,
        priceCents: r.priceCents,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
        note: r.note,
        requestTicket: r.requestTicket
          ? { id: r.requestTicket.id, title: r.requestTicket.title, status: r.requestTicket.status }
          : null,
      }))}
      addOnsClientSites={sites.map((s) => ({ id: s.id, displayName: s.displayName }))}
    />
  );
}
