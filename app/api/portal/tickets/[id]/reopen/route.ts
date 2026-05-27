import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { sendTicketReopenedEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";
import { updateNotionTicketStatus } from "@/lib/notion";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;

  const ticket = await prisma.ticket.findFirst({
    where: { id, clientAccountId: account.id },
    include: { site: { select: { displayName: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }
  if (ticket.status !== "AWAITING_CONFIRMATION") {
    return NextResponse.json(
      { error: "Only tickets awaiting confirmation can be reopened." },
      { status: 409 },
    );
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      status: "REOPENED",
      reopenedAt: new Date(),
    },
  });

  // Notify admin that the client kicked it back. Don't fail the API call if email hiccups.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    try {
      await sendTicketReopenedEmail(adminEmail, {
        ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
        ticketTitle: ticket.title,
        ticketUrl: `${appUrl}/admin/ticket/${ticket.id}`,
        clientName: account.name,
        siteDisplayName: ticket.site.displayName,
      });
    } catch (err) {
      console.error("[reopen] email failed:", err);
    }
  }

  void updateNotionTicketStatus({ ticketId: id, status: "REOPENED" }).catch(
    (err) => console.error("[notion] uncaught in portal reopen:", err),
  );

  return NextResponse.json({ ticket: updated });
}
