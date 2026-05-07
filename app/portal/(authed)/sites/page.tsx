import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import type { SiteWithStats } from "@/components/SitesPage";
import { SitesClient } from "./sites-client";

const OPEN_STATUSES = ["NEW", "REVIEWING", "FIXING", "REOPENED"] as const;

export default async function ClientSitesPage() {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  const sites = await prisma.site.findMany({
    where: { clientAccountId: account.id },
    orderBy: { addedAt: "asc" },
    include: {
      // Inquiries (quick chats) are a separate channel until promoted, so
      // they shouldn't be counted as tickets in the client's site stats.
      _count: { select: { tickets: { where: { isInquiry: false } } } },
      tickets: {
        where: { isInquiry: false, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      },
    },
  });

  const dtos: SiteWithStats[] = sites.map((s) => ({
    id: s.id,
    url: s.url,
    displayName: s.displayName,
    addedAt: s.addedAt.toISOString(),
    totalTickets: s._count.tickets,
    openTickets: s.tickets.length,
  }));

  return <SitesClient sites={dtos} />;
}
