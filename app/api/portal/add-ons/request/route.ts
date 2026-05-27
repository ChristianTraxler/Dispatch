import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { sendNewTicketEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";

export const dynamic = "force-dynamic";

interface Body {
  addOnId?: unknown;
  siteId?: unknown;
  notes?: unknown;
}

export async function POST(req: Request) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const addOnId = typeof body.addOnId === "string" ? body.addOnId : "";
  const siteId = typeof body.siteId === "string" && body.siteId ? body.siteId : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!addOnId) {
    return NextResponse.json({ error: "addOnId is required." }, { status: 400 });
  }

  const addOn = await prisma.addOn.findUnique({ where: { id: addOnId } });
  if (!addOn || !addOn.isActive) {
    return NextResponse.json({ error: "Add-on not available." }, { status: 404 });
  }

  if (addOn.scope === "PER_SITE" && !siteId) {
    return NextResponse.json({ error: "Site is required for this add-on." }, { status: 400 });
  }
  if (addOn.scope === "PER_CLIENT" && siteId) {
    return NextResponse.json({ error: "Site must not be provided for this add-on." }, { status: 400 });
  }

  // Resolve the site to attach the ticket to.
  // - PER_SITE: the requested site, must belong to this client.
  // - PER_CLIENT: pick any of the client's sites (tickets require siteId).
  let site: { id: string; displayName: string; url: string } | null = null;
  if (siteId) {
    site = await prisma.site.findFirst({
      where: { id: siteId, clientAccountId: account.id },
      select: { id: true, displayName: true, url: true },
    });
    if (!site) {
      return NextResponse.json({ error: "Site not found." }, { status: 404 });
    }
  } else {
    site = await prisma.site.findFirst({
      where: { clientAccountId: account.id },
      orderBy: { addedAt: "asc" },
      select: { id: true, displayName: true, url: true },
    });
    if (!site) {
      return NextResponse.json(
        { error: "Add a site before requesting add-ons." },
        { status: 400 },
      );
    }
  }

  // Block: already active (scope-aware)
  const existingActive = await prisma.clientAddOn.findFirst({
    where: {
      clientAccountId: account.id,
      addOnId: addOn.id,
      status: "ACTIVE",
      ...(addOn.scope === "PER_SITE" && siteId ? { siteId } : {}),
    },
  });
  if (existingActive) {
    return NextResponse.json({ error: "This add-on is already active." }, { status: 409 });
  }

  // Block: open request already exists
  const existingRequest = await prisma.ticket.findFirst({
    where: {
      clientAccountId: account.id,
      addOnId: addOn.id,
      status: { notIn: ["CLOSED"] },
      ...(addOn.scope === "PER_SITE" && siteId ? { siteId } : {}),
    },
    select: { id: true },
  });
  if (existingRequest) {
    return NextResponse.json(
      { error: "You already have an open request for this add-on.", ticketId: existingRequest.id },
      { status: 409 },
    );
  }

  const descriptionParts = [
    `Add-on requested: **${addOn.name}**`,
    addOn.scope === "PER_SITE"
      ? `Scope: site (${site.displayName})`
      : `Scope: client account`,
  ];
  if (notes) descriptionParts.push("", "Notes from client:", notes);
  const description = descriptionParts.join("\n");

  const ticket = await prisma.ticket.create({
    data: {
      clientAccountId: account.id,
      siteId: site.id,
      title: `Add-on request: ${addOn.name}`,
      description,
      category: "UPDATE",
      status: "NEW",
      addOnId: addOn.id,
    },
    select: { id: true, title: true, description: true, category: true, createdAt: true },
  });

  // Notify the admin. Mirror the new-ticket email so add-on requests don't go silent.
  const adminEmail = process.env.ADMIN_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  if (adminEmail) {
    try {
      await sendNewTicketEmail(adminEmail, {
        ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
        ticketTitle: ticket.title,
        ticketUrl: `${appUrl}/admin/ticket/${ticket.id}`,
        category: ticket.category,
        clientName: account.name,
        clientEmail: account.email,
        siteDisplayName: site.displayName,
        siteUrl: site.url,
        description: ticket.description,
        isEmergency: false,
        emergencyFeeAmountCents: null,
        isAddOnRequest: true,
      });
    } catch (err) {
      console.error("[add-on request] new-ticket email failed:", err);
    }
  }

  return NextResponse.json({ ticketId: ticket.id }, { status: 201 });
}
