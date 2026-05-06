import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { sendNewMessageToAdminEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: ticketId } = await context.params;
  let payload: { body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = payload.body?.trim();
  if (!body) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, clientAccountId: account.id },
    include: {
      site: { select: { displayName: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      ticketId,
      senderType: "CLIENT",
      senderId: account.id,
      body,
    },
  });

  // Notify the admin (debounced per-ticket).
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    try {
      await sendNewMessageToAdminEmail(adminEmail, ticket.id, {
        ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
        ticketTitle: ticket.title,
        ticketUrl: `${appUrl}/admin/ticket/${ticket.id}`,
        clientName: account.name,
        siteDisplayName: ticket.site.displayName,
        messageBody: body,
      });
    } catch (err) {
      console.error("[messages] new-message-to-admin email failed:", err);
    }
  }

  return NextResponse.json({
    message: {
      id: message.id,
      senderType: message.senderType,
      senderName: account.name,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString() ?? null,
    },
  });
}
