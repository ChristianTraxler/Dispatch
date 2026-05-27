import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { AddOnsClient } from "./add-ons-client";

export const dynamic = "force-dynamic";

export default async function PortalAddOnsPage() {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  const [catalog, overrides, activeAddOns, openRequests, sites] = await Promise.all([
    prisma.addOn.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.addOnClientPrice.findMany({
      where: { clientAccountId: account.id },
    }),
    prisma.clientAddOn.findMany({
      where: {
        clientAccountId: account.id,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      include: { addOn: true, site: { select: { id: true, displayName: true } } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.ticket.findMany({
      where: {
        clientAccountId: account.id,
        addOnId: { not: null },
        status: { notIn: ["CLOSED"] },
      },
      select: { id: true, addOnId: true, siteId: true },
    }),
    prisma.site.findMany({
      where: { clientAccountId: account.id },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);

  return (
    <AddOnsClient
      catalog={catalog.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        kind: a.kind,
        scope: a.scope,
        priceType: a.priceType,
        priceCents: a.priceCents,
        priceMaxCents: a.priceMaxCents,
        pricePercentBp: a.pricePercentBp,
        priceUnit: a.priceUnit,
        priceUnitLabel: a.priceUnitLabel,
      }))}
      overrides={overrides.map((o) => ({
        addOnId: o.addOnId,
        priceType: o.priceType,
        priceCents: o.priceCents,
        priceMaxCents: o.priceMaxCents,
        pricePercentBp: o.pricePercentBp,
      }))}
      activeAddOns={activeAddOns.map((row) => ({
        id: row.id,
        addOnId: row.addOnId,
        addOnName: row.addOn.name,
        kind: row.addOn.kind,
        scope: row.addOn.scope,
        priceUnit: row.addOn.priceUnit,
        priceUnitLabel: row.addOn.priceUnitLabel,
        siteId: row.siteId,
        siteName: row.site?.displayName ?? null,
        status: row.status,
        priceCents: row.priceCents,
        startedAt: row.startedAt.toISOString(),
      }))}
      openRequests={openRequests.map((t) => ({
        ticketId: t.id,
        addOnId: t.addOnId!,
        siteId: t.siteId,
      }))}
      sites={sites}
    />
  );
}
