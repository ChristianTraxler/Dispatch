import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { updateNotionTicketStatus } from "@/lib/notion";
import { notifyAdminTicketClosed } from "@/lib/notify";

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
    select: {
      id: true,
      status: true,
      title: true,
      category: true,
      createdAt: true,
      clientAccount: {
        select: { authUserId: true, email: true, name: true, emailNotifications: true },
      },
      site: { select: { displayName: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }
  if (ticket.status !== "AWAITING_CONFIRMATION") {
    return NextResponse.json(
      { error: "Only tickets awaiting confirmation can be closed." },
      { status: 409 },
    );
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      status: "CLOSED",
      confirmedAt: new Date(),
    },
  });

  after(() => updateNotionTicketStatus({ ticketId: id, status: "CLOSED" }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  after(() => notifyAdminTicketClosed(ticket, appUrl));

  return NextResponse.json({ ticket: updated });
}
