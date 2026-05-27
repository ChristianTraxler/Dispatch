import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { updateNotionTicketStatus } from "@/lib/notion";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;

  const ticket = await prisma.ticket.findFirst({
    where: { id, clientAccountId: account.id },
    select: { id: true, status: true },
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

  void updateNotionTicketStatus({ ticketId: id, status: "CLOSED" }).catch(
    (err) => console.error("[notion] uncaught in portal confirm:", err),
  );

  return NextResponse.json({ ticket: updated });
}
