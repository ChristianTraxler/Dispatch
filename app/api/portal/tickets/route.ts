import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { sendNewTicketEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";

const VALID_CATEGORIES = new Set([
  "BUG",
  "CONTENT",
  "FEATURE",
  "QUESTION",
  "URGENT",
]);

export async function POST(req: Request) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: {
    siteId?: string;
    title?: string;
    description?: string;
    category?: string;
    attachments?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const siteId = payload.siteId?.trim();
  const title = payload.title?.trim();
  const description = payload.description?.trim();
  const category = payload.category?.trim();

  if (!siteId || !title || !description || !category) {
    return NextResponse.json(
      { error: "Site, title, description, and category are required." },
      { status: 400 },
    );
  }
  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }
  if (!account.sites.some((s) => s.id === siteId)) {
    return NextResponse.json(
      { error: "That site is not on your account." },
      { status: 403 },
    );
  }

  const site = account.sites.find((s) => s.id === siteId)!;

  const ticket = await prisma.ticket.create({
    data: {
      clientAccountId: account.id,
      siteId,
      title,
      description,
      category: category as "BUG" | "CONTENT" | "FEATURE" | "QUESTION" | "URGENT",
      status: "NEW",
      receivedAt: new Date(), // Stage 2 of the 6-stage timeline
      ...(Array.isArray(payload.attachments) && payload.attachments.length > 0
        ? { attachments: payload.attachments }
        : {}),
    },
  });

  // Notify the admin. Don't fail the create if the email hiccups.
  const adminEmail = process.env.ADMIN_EMAIL;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
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
      });
    } catch (err) {
      console.error("[ticket] new-ticket email failed:", err);
    }
  }

  return NextResponse.json({ ticket }, { status: 201 });
}
