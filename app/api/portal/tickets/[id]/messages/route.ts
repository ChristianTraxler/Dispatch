import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { sendNewMessageToAdminEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";
import { hydrateAttachments } from "@/lib/storage";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: ticketId } = await context.params;
  let payload: {
    body?: string;
    attachments?: Array<{
      filename: string;
      path: string;
      contentType: string;
      sizeBytes: number;
    }>;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = payload.body?.trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (!body && attachments.length === 0) {
    return NextResponse.json(
      { error: "Message body or at least one attachment is required." },
      { status: 400 },
    );
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

  if (ticket.isInquiry && ticket.inquiryEndedAt) {
    return NextResponse.json(
      { error: "This chat has ended. Open the launcher to start a new one." },
      { status: 409 },
    );
  }

  const now = new Date();

  const message = await prisma.message.create({
    data: {
      ticketId,
      senderType: "CLIENT",
      senderId: account.id,
      body: body ?? "",
      ...(attachments.length > 0 ? { attachments } : {}),
    },
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { lastMessageAt: now },
  });

  // Per-message email — tickets only. Inquiries notify via end-of-chat transcript
  // and the 1-hour admin-nudge cron; no per-message email noise.
  if (!ticket.isInquiry) {
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
          messageBody: body ?? "(attachment)",
        });
      } catch (err) {
        console.error("[messages] new-message-to-admin email failed:", err);
      }
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
      attachments: await hydrateAttachments(message.attachments),
    },
  });
}
