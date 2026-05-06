import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

// Marks every CLIENT-sent message on this ticket as read by the admin viewer.
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id: ticketId } = await context.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const result = await prisma.message.updateMany({
    where: {
      ticketId,
      senderType: "CLIENT",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ updated: result.count });
}
