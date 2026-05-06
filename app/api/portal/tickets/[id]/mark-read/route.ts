import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

// Marks every ADMIN-sent message on this ticket as read by the client viewer.
// Called from the client ticket page when it mounts and on each Realtime push.
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: ticketId } = await context.params;

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, clientAccountId: account.id },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const result = await prisma.message.updateMany({
    where: {
      ticketId,
      senderType: "ADMIN",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ updated: result.count });
}
