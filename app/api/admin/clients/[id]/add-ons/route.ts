import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { formatCents, priceUnitSuffix } from "@/lib/add-ons/format";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function guard() {
  try {
    await requireAdmin();
    return null;
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const rows = await prisma.clientAddOn.findMany({
    where: { clientAccountId: id },
    include: {
      addOn: true,
      site: { select: { id: true, displayName: true } },
      requestTicket: { select: { id: true, title: true, status: true } },
    },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ rows });
}

interface PostBody {
  addOnId?: unknown;
  siteId?: unknown;
  priceCents?: unknown;
  note?: unknown;
  fromTicketId?: unknown;
}

export async function POST(req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id: clientAccountId } = await params;

  let body: PostBody;
  try { body = (await req.json()) as PostBody; } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const addOnId = typeof body.addOnId === "string" ? body.addOnId : "";
  const siteId = typeof body.siteId === "string" && body.siteId ? body.siteId : null;
  const priceCents = typeof body.priceCents === "number" ? body.priceCents : NaN;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  const fromTicketId = typeof body.fromTicketId === "string" && body.fromTicketId ? body.fromTicketId : null;

  if (!addOnId) return NextResponse.json({ error: "addOnId required." }, { status: 400 });
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "priceCents must be a non-negative integer." }, { status: 400 });
  }

  const account = await prisma.clientAccount.findUnique({ where: { id: clientAccountId } });
  if (!account) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const addOn = await prisma.addOn.findUnique({ where: { id: addOnId } });
  if (!addOn) return NextResponse.json({ error: "Add-on not found." }, { status: 404 });

  if (addOn.scope === "PER_SITE" && !siteId) {
    return NextResponse.json({ error: "Site is required for this add-on." }, { status: 400 });
  }
  if (addOn.scope === "PER_CLIENT" && siteId) {
    return NextResponse.json({ error: "Site must not be provided for this add-on." }, { status: 400 });
  }

  let siteDisplayName: string | null = null;
  if (siteId) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, clientAccountId },
      select: { displayName: true },
    });
    if (!site) return NextResponse.json({ error: "Site does not belong to client." }, { status: 400 });
    siteDisplayName = site.displayName;
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.clientAddOn.create({
      data: {
        clientAccountId,
        addOnId,
        siteId,
        priceCents,
        note,
        requestTicketId: fromTicketId,
        status: "ACTIVE",
      },
      include: {
        addOn: true,
        site: { select: { id: true, displayName: true } },
      },
    });

    if (fromTicketId) {
      const sitePart = siteDisplayName ? ` for ${siteDisplayName}` : "";
      await tx.message.create({
        data: {
          ticketId: fromTicketId,
          senderType: "ADMIN",
          senderId: "system",
          body: `Activated **${addOn.name}**${sitePart} at ${formatCents(priceCents)}${priceUnitSuffix(addOn.priceUnit)}.`,
        },
      });
    }

    return row;
  });

  return NextResponse.json({ row: created }, { status: 201 });
}
