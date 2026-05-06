import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { sendNewMessageToClientEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";
import { hydrateAttachments } from "@/lib/storage";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
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

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      site: { select: { displayName: true } },
      clientAccount: { select: { email: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      ticketId,
      senderType: "ADMIN",
      senderId: adminUser.id,
      body: body ?? "",
      ...(attachments.length > 0 ? { attachments } : {}),
    },
  });

  // Notify the client (debounced per-ticket).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    await sendNewMessageToClientEmail(ticket.clientAccount.email, ticket.id, {
      ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
      ticketTitle: ticket.title,
      ticketUrl: `${appUrl}/portal/ticket/${ticket.id}`,
      siteDisplayName: ticket.site.displayName,
      messageBody: body ?? "(attachment)",
    });
  } catch (err) {
    console.error("[messages] new-message-to-client email failed:", err);
  }

  return NextResponse.json({
    message: {
      id: message.id,
      senderType: message.senderType,
      senderName: "Christian",
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString() ?? null,
      attachments: await hydrateAttachments(message.attachments),
    },
  });
}
