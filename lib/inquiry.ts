import "server-only";

import { prisma } from "@/lib/prisma";
import {
  sendInquiryTranscriptEmail,
} from "@/lib/email";
import type { InquiryTranscriptMessage } from "@/lib/email-templates";

interface JsonAttachmentLike {
  filename?: unknown;
}

function attachmentNames(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const names = raw
    .map((a) => (a && typeof (a as JsonAttachmentLike).filename === "string" ? (a as { filename: string }).filename : null))
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names : undefined;
}

/**
 * End an inquiry: set `inquiry_ended_at`, send transcript emails to both parties.
 * Idempotent — if `inquiry_ended_at` is already set, returns without re-sending.
 */
export async function endInquiry(opts: {
  ticketId: string;
  endedBy: "client" | "admin" | "auto";
  appUrl: string;
}): Promise<{ alreadyEnded: boolean }> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: opts.ticketId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      clientAccount: { select: { name: true, email: true } },
    },
  });
  if (!ticket || !ticket.isInquiry) {
    throw new Error(`Ticket ${opts.ticketId} is not an inquiry`);
  }
  if (ticket.inquiryEndedAt) {
    return { alreadyEnded: true };
  }

  const endedAt = new Date();
  await prisma.ticket.update({
    where: { id: opts.ticketId },
    data: { inquiryEndedAt: endedAt },
  });

  const messages: InquiryTranscriptMessage[] = ticket.messages.map((m) => ({
    senderName: m.senderType === "ADMIN" ? "Christian" : ticket.clientAccount.name,
    senderType: m.senderType,
    body: m.body,
    createdAt: m.createdAt,
    attachmentNames: attachmentNames(m.attachments),
  }));

  const adminEmail = process.env.ADMIN_EMAIL;
  const ticketUrl = `${opts.appUrl}/admin/ticket/${ticket.id}`;
  const startedAt = ticket.createdAt;

  if (adminEmail) {
    try {
      await sendInquiryTranscriptEmail(adminEmail, {
        recipientType: "ADMIN",
        clientName: ticket.clientAccount.name,
        startedAt,
        endedAt,
        endedBy: opts.endedBy,
        messages,
        ticketUrl,
      });
    } catch (err) {
      console.error("[inquiry] transcript email to admin failed:", err);
    }
  }

  try {
    await sendInquiryTranscriptEmail(ticket.clientAccount.email, {
      recipientType: "CLIENT",
      clientName: ticket.clientAccount.name,
      startedAt,
      endedAt,
      endedBy: opts.endedBy,
      messages,
    });
  } catch (err) {
    console.error("[inquiry] transcript email to client failed:", err);
  }

  return { alreadyEnded: false };
}
