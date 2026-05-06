import { prisma } from "@/lib/prisma";
import { hydrateAvatarUrls } from "@/lib/storage";
import type { AdminClient, AdminClientSite } from "@/components/AdminClientsPage";
import { ClientsListClient } from "./clients-list-client";

const OPEN_STATUSES = ["NEW", "REVIEWING", "FIXING", "REOPENED"] as const;

export default async function AdminClientsPage() {
  const accounts = await prisma.clientAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sites: {
        orderBy: { addedAt: "asc" },
        include: {
          _count: { select: { tickets: true } },
          tickets: {
            where: { status: { in: [...OPEN_STATUSES] } },
            select: { id: true },
          },
        },
      },
    },
  });

  const avatarUrls = await hydrateAvatarUrls(accounts.map((a) => a.avatarPath));

  const initial: AdminClient[] = accounts.map((a, i) => {
    const sites: AdminClientSite[] = a.sites.map((s) => ({
      id: s.id,
      url: s.url,
      displayName: s.displayName,
      totalTickets: s._count.tickets,
      openTickets: s.tickets.length,
    }));
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      joinedAt: a.createdAt.toISOString(),
      isOnline: false, // hydrated on the client from Realtime presence
      lastSeenAt: null,
      avatarUrl: avatarUrls[i],
      sites,
    };
  });

  return <ClientsListClient initial={initial} />;
}
